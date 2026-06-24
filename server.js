import express from 'express';
import cors from 'cors';
import { exec, execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import fs from 'fs';
import os from 'os';
import localtunnel from 'localtunnel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for APPDATA path
function getDataDir() {
  const dataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'YTMusicBG') : __dirname;
  if (!fs.existsSync(dataDir)) {
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
  }
  return dataDir;
}

const LEARNED_DB_FILE = path.join(getDataDir(), 'learnedData.json');
let learnedSongs = [];
if (fs.existsSync(LEARNED_DB_FILE)) {
  try {
    learnedSongs = JSON.parse(fs.readFileSync(LEARNED_DB_FILE, 'utf-8'));
  } catch (e) {
    console.error("Failed to load learned data:", e);
  }
}

function saveLearnedSong(song) {
  // Check if it already exists
  if (!learnedSongs.find(s => s.id === song.id)) {
    learnedSongs.push(song);
    fs.writeFile(LEARNED_DB_FILE, JSON.stringify(learnedSongs, null, 2), (err) => {
      if (err) console.error("Failed to save learned data:", err);
    });
    console.log(`[Learned] Đã thêm thành công: ${song.title}`);
  }
}

export let electronApp = null;
export function setElectronApp(app) {
  electronApp = app;
}

const app = express();
const PORT = process.env.PORT || 5173;

app.use(cors());
app.use(express.json()); // Bổ sung body parser cho POST
app.use(express.static(__dirname)); // Serve static files without strong cache

// In-memory cache for direct stream URLs to prevent spawning too many processes on range requests
const urlCache = new Map();

const pendingUrlPromises = new Map();

function getAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.url);
  }

  if (pendingUrlPromises.has(videoId)) {
    return pendingUrlPromises.get(videoId);
  }

  const promise = new Promise((resolve, reject) => {
    // Thêm --remote-components ejs:github để giải mã n-parameter YouTube (tránh throttle/lỗi)
    const cmdArgs = ['--js-runtimes', 'node', '--remote-components', 'ejs:github', '-g', '-f', 'bestaudio[abr<=128]/bestaudio/best', '--no-playlist', videoId];
    execFile('yt-dlp', cmdArgs, { timeout: 30000 }, (error, stdout, stderr) => {
      pendingUrlPromises.delete(videoId);
      if (error) {
        console.error(`yt-dlp error: ${stderr}`);
        return reject(error);
      }
      const url = stdout.trim();
      if (!url) return reject(new Error('No URL returned by yt-dlp'));
      
      // Cache the URL for 50 minutes (to avoid YouTube's 1-hour or 15-min dropping behavior on older URLs)
      urlCache.set(videoId, {
        url: url,
        expires: Date.now() + 1000 * 60 * 50
      });
      resolve(url);
    });
  });

  pendingUrlPromises.set(videoId, promise);
  return promise;
}

// Endpoint 1: Get metadata for a video
app.get('/api/info', (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const cmdArgs = ['--js-runtimes', 'node', '--remote-components', 'ejs:github', '-j', '--no-playlist', videoUrl];
  
  execFile('yt-dlp', cmdArgs, { maxBuffer: 1024 * 1024 * 10, timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: 'Failed to extract video info', details: stderr });
    }

    try {
      const info = JSON.parse(stdout);
      const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : '');

      const responseData = {
        id: info.id,
        title: info.title,
        author: info.uploader || info.artist || 'YouTube',
        thumbnail: thumbnail,
        duration: info.duration
      };

      res.json(responseData);

      // --- SELF LEARNING & COPYRIGHT CHECK ---
      // We check for commercial copyright markers: artist, track, album, or "Provided to YouTube by"
      const description = info.description || '';
      const isCopyrighted = !!(
        info.artist || 
        info.track || 
        info.album || 
        description.includes('Provided to YouTube by') ||
        description.includes('Licensed to YouTube by')
      );

      if (isCopyrighted) {
        console.log(`[Learned] Bỏ qua bài hát do có bản quyền: ${info.title}`);
      } else {
        saveLearnedSong({
          id: info.id,
          title: info.title,
          author: info.uploader || 'YouTube',
          url: `https://www.youtube.com/watch?v=${info.id}`
        });
      }
      // ---------------------------------------
    } catch (e) {
      console.error("Parse JSON error:", e);
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// Endpoint 2: Stream audio proxy supporting HTTP Range requests (crucial for iOS Safari)
app.get('/api/stream', (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).send('ID is required');
  }

  let retryCount = 0;
  let currentProxyReq = null;

  req.on('close', () => {
    if (currentProxyReq && !currentProxyReq.destroyed) {
      currentProxyReq.destroy();
    }
  });

  const attemptStream = async (forceRefresh) => {
    try {
      if (forceRefresh) urlCache.delete(videoId);
      const audioUrl = await getAudioUrl(videoId);
      
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Connection': 'keep-alive'
      };
      if (req.headers.range) headers['Range'] = req.headers.range;

      const parsedUrl = new URL(audioUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: headers
      };

      if (req.destroyed || req.socket.destroyed) {
        console.log(`[Stream] Client aborted request for ${videoId}`);
        return;
      }

      currentProxyReq = https.request(options, (proxyRes) => {
        // 403/404/410: URL expired → retry with fresh URL
        if (proxyRes.statusCode === 403 || proxyRes.statusCode === 404 || proxyRes.statusCode === 410) {
          console.log(`[Stream] URL for ${videoId} returned ${proxyRes.statusCode}. Retrying...`);
          if (retryCount < 2) {
            retryCount++;
            currentProxyReq.destroy();
            return attemptStream(true);
          }
        }

        // 416: Range không hợp lệ → thử lại không có Range header
        if (proxyRes.statusCode === 416) {
          console.log(`[Stream] 416 Range error for ${videoId}, retrying without range...`);
          if (retryCount < 2) {
            retryCount++;
            currentProxyReq.destroy();
            delete req.headers.range;
            return attemptStream(false);
          }
        }

        if (req.destroyed || req.socket.destroyed) {
          currentProxyReq.destroy();
          return;
        }

        res.statusCode = proxyRes.statusCode;
        // Cho phép browser cache stream để tua mượt hơn, đặc biệt khi tua lùi
        res.setHeader('Cache-Control', 'public, max-age=3600');
        if (proxyRes.headers['content-type']) res.setHeader('content-type', proxyRes.headers['content-type']);
        if (proxyRes.headers['content-length']) res.setHeader('content-length', proxyRes.headers['content-length']);
        if (proxyRes.headers['content-range']) res.setHeader('content-range', proxyRes.headers['content-range']);
        if (proxyRes.headers['accept-ranges']) res.setHeader('accept-ranges', proxyRes.headers['accept-ranges']);
        
        proxyRes.pipe(res);

        // Nếu stream bị abort giữa chừng (connection drop từ YouTube)
        proxyRes.on('aborted', () => {
          console.warn(`[Stream] YouTube aborted stream for ${videoId}`);
          urlCache.delete(videoId); // Delete cached URL so next time it gets a fresh one
          if (!res.headersSent) res.status(503).send('Stream interrupted');
        });
      });

      currentProxyReq.on('error', (err) => {
        if (req.destroyed || req.socket.destroyed) return;
        console.error('Proxy request error:', err);
        if (!res.headersSent) res.status(500).send('Streaming error');
      });

      currentProxyReq.setTimeout(30000, () => {
        console.warn(`[Stream] Timeout for ${videoId}`);
        currentProxyReq.destroy();
      });

      currentProxyReq.end();

    } catch (error) {
      if (req.destroyed || req.socket.destroyed) return;
      console.error("Stream extraction error:", error);
      if (!res.headersSent) res.status(500).send('Failed to fetch stream URL');
    }
  };

  attemptStream(false);
});


// Endpoint 2b: Prefetch to cache URL for instantly playing the next song
app.get('/api/prefetch', (req, res) => {
  const videoId = req.query.id;
  if (videoId) {
    getAudioUrl(videoId).catch(() => {});
  }
  res.json({ success: true });
});

// Endpoint 3: Flat playlist info
app.get('/api/playlist', (req, res) => {
  const playlistUrl = req.query.url;
  const offset = parseInt(req.query.offset) || 0;
  const count = parseInt(req.query.limit) || 20;

  if (!playlistUrl) {
    return res.status(400).json({ error: 'Playlist URL is required' });
  }

  const cmdArgs = [
    '--js-runtimes', 'node', 
    '--flat-playlist', 
    '-J', 
    '--playlist-items', `${offset + 1}-${offset + count}`,
    playlistUrl
  ];

  execFile('yt-dlp', cmdArgs, { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: 'Failed to extract playlist info', details: stderr });
    }

    try {
      const data = JSON.parse(stdout);
      if (!data.entries || !data.entries.length) {
        return res.status(404).json({ error: 'No entries found' });
      }

      const tracks = data.entries.map(entry => ({
        id: entry.id,
        title: entry.title,
        author: entry.uploader || data.uploader || 'YouTube',
        url: `https://www.youtube.com/watch?v=${entry.id}`
      })).filter(r => r.id && r.title);

      res.json({
        title: data.title || 'YouTube Playlist',
        tracks: tracks,
        hasMore: tracks.length === count
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to parse playlist info' });
    }
  });
});

// Endpoint 4: Search YouTube - Returns 20 results with channelId
app.get('/api/search', (req, res) => {
  const query = req.query.q;
  const offset = parseInt(req.query.offset) || 0;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const count = parseInt(req.query.limit) || 5;
  const searchQuery = offset > 0 ? `ytsearch${offset + count}:${query}` : `ytsearch${count}:${query}`;
  const cmdArgs = ['--js-runtimes', 'node', '-J', '--flat-playlist', searchQuery];
  
  execFile('yt-dlp', cmdArgs, { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (error, stdout, stderr) => {
    try {
      const data = JSON.parse(stdout);
      const entries = data.entries || [];
      const allResults = entries.map(info => {
        return {
          id: info.id,
          title: info.title,
          author: info.uploader || info.channel || info.artist || 'YouTube',
          channelId: info.uploader_id || info.channel_id || null,
          url: `https://www.youtube.com/watch?v=${info.id}`
        };
      }).filter(r => r.id && r.title);

      // Slice to return only the requested range
      const results = allResults.slice(offset, offset + count);
      res.json({ results, hasMore: allResults.length > offset + count });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to parse search results' });
    }
  });
});

// --- ARTIST PAGE CACHE ---
const ARTIST_CACHE_FILE = path.join(getDataDir(), 'artists_cache.json');
const ARTIST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function loadArtistCache() {
  try {
    if (fs.existsSync(ARTIST_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ARTIST_CACHE_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
}

function saveArtistCache(cache) {
  try { fs.writeFileSync(ARTIST_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8'); } catch(e) {}
}

// Endpoint: Get artist songs (lazy, cached)
app.get('/api/artist', (req, res) => {
  const { id: channelId, name: channelName } = req.query;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  const cache = loadArtistCache();
  const cached = cache[channelId];
  
  // Return from cache if fresh (< 24h)
  if (cached && (Date.now() - cached.cachedAt) < ARTIST_CACHE_TTL) {
    return res.json(cached);
  }

  // Fetch from YouTube (channel videos)
  const channelUrl = channelId.startsWith('@') 
    ? `https://www.youtube.com/${channelId}/videos`
    : `https://www.youtube.com/channel/${channelId}/videos`;
  
  const cmdArgs = ['--js-runtimes', 'node', '--flat-playlist', '-J', '--playlist-end', '50', channelUrl];

  execFile('yt-dlp', cmdArgs, { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      // Fallback: try with ytsearch for the artist name
      const fallbackArgs = ['--js-runtimes', 'node', '-j', '--no-playlist', `ytsearch30:${channelName || channelId}`];
      
      execFile('yt-dlp', fallbackArgs, { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err2, stdout2, stderr2) => {
        if (err2) {
          return res.status(500).json({ error: 'Failed to fetch artist', details: stderr2?.substring(0, 200) });
        }
        try {
          const lines = stdout2.trim().split('\n');
          const entries = lines.map(l => JSON.parse(l)).filter(e => e.id && e.title);
          // Only keep songs by this artist if possible, otherwise keep all (it's a search)
          const artistEntries = entries.filter(e => e.uploader_id === channelId || e.uploader === channelName || (channelName && e.uploader?.includes(channelName)));
          const finalEntries = artistEntries.length > 0 ? artistEntries : entries;
          
          const artistData = {
            channelId,
            name: channelName || finalEntries[0]?.uploader || 'Unknown Artist',
            thumbnail: `https://img.youtube.com/vi/${finalEntries[0]?.id}/hqdefault.jpg`,
            songs: finalEntries.map(e => ({
              id: e.id,
              title: e.title,
              author: e.uploader || channelName || 'YouTube',
              channelId: e.uploader_id || channelId,
              url: `https://www.youtube.com/watch?v=${e.id}`
            })),
            totalFetched: finalEntries.length,
            cachedAt: Date.now()
          };
          cache[channelId] = artistData;
          saveArtistCache(cache);
          return res.json(artistData);
        } catch (e2) {
          return res.status(500).json({ error: 'Failed to parse fallback data' });
        }
      });
      return;
    }
    try {
      const data = JSON.parse(stdout);
      const entries = (data.entries || []).filter(e => e.id && e.title && e.title !== '[Deleted video]');
      const artistData = {
        channelId,
        name: channelName || data.uploader || data.channel || channelId,
        thumbnail: data.thumbnails?.slice(-1)[0]?.url || 
                   (entries[0] ? `https://img.youtube.com/vi/${entries[0].id}/hqdefault.jpg` : ''),
        songs: entries.map(e => ({
          id: e.id,
          title: e.title,
          author: e.uploader || data.uploader || channelName || 'YouTube',
          channelId: e.uploader_id || channelId,
          url: `https://www.youtube.com/watch?v=${e.id}`
        })),
        totalFetched: 50,
        cachedAt: Date.now()
      };
      cache[channelId] = artistData;
      saveArtistCache(cache);
      res.json(artistData);
    } catch(e) {
      console.error('Artist parse error:', e);
      res.status(500).json({ error: 'Failed to parse artist data' });
    }
  });
});

// Endpoint: Load more from artist (page 2, 3...)
app.get('/api/artist/more', (req, res) => {
  const { id: channelId, page = 2 } = req.query;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  const pageNum = parseInt(page);
  const end = pageNum * 50;
  const start = end - 50 + 1;

  const channelUrl = channelId.startsWith('@') 
    ? `https://www.youtube.com/${channelId}/videos`
    : `https://www.youtube.com/channel/${channelId}/videos`;

  const cmdArgs = ['--js-runtimes', 'node', '--flat-playlist', '-J',
    '--playlist-start', String(start), '--playlist-end', String(end), channelUrl];

  execFile('yt-dlp', cmdArgs, { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: 'Failed to fetch more', details: stderr?.substring(0, 200) });
    try {
      const data = JSON.parse(stdout);
      const entries = (data.entries || []).filter(e => e.id && e.title);
      const songs = entries.map(e => ({
        id: e.id, title: e.title,
        author: e.uploader || data.uploader || 'YouTube',
        channelId: e.uploader_id || channelId,
        url: `https://www.youtube.com/watch?v=${e.id}`
      }));

      // Append to cache
      const cache = loadArtistCache();
      if (cache[channelId]) {
        const existing = new Set(cache[channelId].songs.map(s => s.id));
        const newSongs = songs.filter(s => !existing.has(s.id));
        cache[channelId].songs.push(...newSongs);
        cache[channelId].totalFetched = end;
        saveArtistCache(cache);
      }
      res.json({ songs, hasMore: entries.length >= 50 });
    } catch(e) {
      res.status(500).json({ error: 'Parse error' });
    }
  });
});


// Helper lấy IP LAN
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

// Cấu hình Database
const DB_FILE = path.join(getDataDir(), 'database.json');

if (!fs.existsSync(DB_FILE)) {
  const defaultDB = {
    settings: { autoSkip: true, allowPhoneEdit: true },
    playlists: [
      {
        id: "default-" + Date.now(),
        name: "Mặc định",
        songs: [
          {
            title: "Nghe nhạc YouTube không quảng cáo",
            author: "Hướng dẫn sử dụng",
            id: "IFAN2qgcMAQ",
            url: "https://www.youtube.com/watch?v=IFAN2qgcMAQ"
          }
        ]
      }
    ]
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), 'utf-8');
}

// Endpoint 5: Lấy toàn bộ dữ liệu (Playlists + Settings + Local IP)
app.get('/api/data', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    data.ip = getLocalIP();
    data.port = PORT;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to read database' });
  }
});

app.get('/api/autostart', (req, res) => {
  if (electronApp) {
    const settings = electronApp.getLoginItemSettings();
    res.json({ autoStart: settings.openAtLogin });
  } else {
    res.json({ autoStart: false });
  }
});

// Middleware để chặn truy cập từ bên ngoài mạng LAN vào các API hệ thống
function localOnly(req, res, next) {
  if (req.headers['x-forwarded-for'] || req.headers['x-localtunnel-id']) {
    return res.status(403).json({ error: 'Forbidden. System actions are not allowed over internet tunnels.' });
  }
  const ip = req.ip || req.connection.remoteAddress;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden. System actions are only allowed from the host machine.' });
  }
}

// Middleware cho phép phone sửa nếu cài đặt bật
function localOrAllowed(req, res, next) {
  const isTunnel = !!(req.headers['x-forwarded-for'] || req.headers['x-localtunnel-id']);
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!isTunnel && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    return next();
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (data.settings && data.settings.allowPhoneEdit !== false) {
      return next();
    }
  } catch (e) {}
  res.status(403).json({ error: 'Phone editing is disabled by the host.' });
}

// Endpoint: Trả về quyền hạn cho client
app.get('/api/permissions', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const isLocal = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
  let allowPhoneEdit = true;
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    allowPhoneEdit = data.settings?.allowPhoneEdit !== false;
  } catch (e) {}
  res.json({
    isLocal,
    canEdit: isLocal || allowPhoneEdit
  });
});

app.post('/api/autostart', localOnly, (req, res) => {
  if (electronApp) {
    electronApp.setLoginItemSettings({ openAtLogin: req.body.autoStart });
  }
  res.json({ success: true });
});

app.post('/api/quit', localOnly, (req, res) => {
  res.json({ success: true });
  setTimeout(() => {
    if (electronApp) electronApp.quit();
    else process.exit(0);
  }, 100);
});

// Endpoint báo lỗi và tự động xoá bài hát khỏi mọi DB
app.post('/api/report-error', localOnly, (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.json({ success: false });

  let totalRemoved = 0;

  // 1. Gỡ khỏi Bảng Xếp Hạng
  try {
    const discoverDataPath = path.join(__dirname, 'discoverData.json');
    if (fs.existsSync(discoverDataPath)) {
      let discover = JSON.parse(fs.readFileSync(discoverDataPath, 'utf8'));
      let modified = false;
      const albums = Array.isArray(discover) ? discover : (discover.albums || []);
      albums.forEach(album => {
        const originalLength = album.songs.length;
        album.songs = album.songs.filter(s => s.id !== videoId);
        if (album.songs.length < originalLength) {
          modified = true;
          totalRemoved += (originalLength - album.songs.length);
        }
      });
      if (modified) fs.writeFileSync(discoverDataPath, JSON.stringify(discover, null, 2));
    }
  } catch(e) { console.error('Lỗi khi xoá bài lỗi khỏi Discover', e); }

  // 2. Gỡ khỏi Thư viện Cá Nhân
  try {
    const dbPath = path.join(__dirname, 'database.json');
    if (fs.existsSync(dbPath)) {
      let db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      let modified = false;
      if (db.playlists) {
        db.playlists.forEach(pl => {
          const originalLength = pl.songs.length;
          pl.songs = pl.songs.filter(s => s.id !== videoId);
          if (pl.songs.length < originalLength) {
            modified = true;
            totalRemoved += (originalLength - pl.songs.length);
          }
        });
      }
      if (modified) fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }
  } catch(e) { console.error('Lỗi khi xoá bài lỗi khỏi DB', e); }

  console.log(`Đã thanh trừng bài hát lỗi [${videoId}] từ ${totalRemoved} vị trí trong hệ thống.`);
  res.json({ success: true, totalRemoved });
});

// Endpoint 6: Lưu trữ dữ liệu
app.post('/api/data', localOrAllowed, (req, res) => {
  try {
    const data = req.body;
    const toSave = { 
      settings: data.settings || { autoSkip: true }, 
      playlists: data.playlists || [] 
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to write database' });
  }
});

// Endpoint 1: Trả về Bảng Xếp Hạng (Discover)
app.get('/api/discover', (req, res) => {
  try {
    const discoverFile = path.join(__dirname, 'discoverData.json');
    if (fs.existsSync(discoverFile)) {
      const data = fs.readFileSync(discoverFile, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } else {
      res.json([]);
    }
  } catch (e) {
    console.error("Lỗi đọc discover data:", e);
    res.status(500).json([]);
  }
});

app.get('/api/learned', (req, res) => {
  res.json(learnedSongs);
});

export function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

// --- INTERNET TUNNEL (LOCALTUNNEL) ---
let activeTunnel = null;
app.get('/api/tunnel', async (req, res) => {
  try {
    if (activeTunnel && !activeTunnel.closed) {
      return res.json({ url: activeTunnel.url });
    }
    activeTunnel = await localtunnel({ port: PORT });
    
    activeTunnel.on('close', () => {
      activeTunnel = null;
    });

    res.json({ url: activeTunnel.url });
  } catch (error) {
    console.error("Tunnel error:", error);
    res.status(500).json({ error: "Cannot create tunnel" });
  }
});

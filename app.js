// --- Bypassing LocalTunnel warning globally ---
const originalFetch = window.fetch;
window.fetch = async function() {
  let [resource, config] = arguments;
  config = config || {};
  config.headers = config.headers || {};
  config.headers['Bypass-Tunnel-Reminder'] = 'true';
  return originalFetch(resource, config);
};

// --- STATE ---
let appData = {
  settings: { autoSkip: true, allowPhoneEdit: true },
  playlists: [{ id: "default", name: "Mặc định", songs: [] }],
  ip: 'localhost',
  port: 5173
};
let currentListIndex = 0;
let currentSongIndex = 0;
let isPlaying = false;
let pauseTimestamp = 0;
let qrGenerated = false;
let canEdit = true;

let currentSelectToken = 0;
let playMode = 'sequential';
const PLAY_MODES = ['sequential', 'shuffle', 'repeat_one'];

const isDesktop = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
let sessionPlaylist = null; // Used when playing an Album or when Phone cannot edit

// --- DOM ELEMENTS ---
const appSidebar = document.getElementById('appSidebar');
const mobileClosePlayerBtn = document.getElementById('mobileClosePlayerBtn');

// Views
const viewPlaylist = document.getElementById('viewPlaylist');
const viewDiscover = document.getElementById('viewDiscover');
const viewAlbum = document.getElementById('viewAlbum');

// Nav
const navPlaylistBtn = document.getElementById('navPlaylistBtn');
const navDiscoverBtn = document.getElementById('navDiscoverBtn');
const qrBtn = document.getElementById('qrBtn');
const settingsBtn = document.getElementById('settingsBtn');

// Main Player
const inputUrl = document.getElementById('urlInput');
const loadBtn = document.getElementById('loadBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playModeBtn = document.getElementById('playModeBtn');
const progressBarBg = document.getElementById('progressBarBg');
const progressBarFill = document.getElementById('progressBarFill');
const currentTimeEl = document.getElementById('currentTime');
const durationTimeEl = document.getElementById('durationTime');
const trackTitleEl = document.getElementById('trackTitle');
const trackAuthorEl = document.getElementById('trackAuthor');
const artworkContainer = document.getElementById('artworkContainer');
const artworkEl = document.getElementById('artwork');
const videoEmbed = document.getElementById('videoEmbed');
const videoToggleBtn = document.getElementById('videoToggleBtn');
const playlistList = document.getElementById('playlistList');
const currentPlaylistNameEl = document.getElementById('currentPlaylistName');
const songCountEl = document.getElementById('songCount');
const audio = document.getElementById('audioPlayer');

// --- VIDEO MODE ---
let videoMode = false;
let currentVideoId = null;

if (videoToggleBtn) {
  videoToggleBtn.onclick = () => {
    videoMode = !videoMode;
    if (videoMode) {
      videoToggleBtn.classList.add('active');
      videoToggleBtn.innerHTML = '<i class="ph ph-image"></i> Ảnh bìa';
      videoToggleBtn.title = 'Xem ảnh bìa';
      artworkEl.style.display = 'none';
      videoEmbed.style.display = 'block';
      if (currentVideoId) {
        videoEmbed.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&controls=1&rel=0`;
      }
      // Pause audio since video has its own audio
      if (!audio.paused) audio.pause();
    } else {
      videoToggleBtn.classList.remove('active');
      videoToggleBtn.innerHTML = '<i class="ph ph-monitor-play"></i> Video';
      videoToggleBtn.title = 'Xem video';
      artworkEl.style.display = 'block';
      videoEmbed.style.display = 'none';
      videoEmbed.src = '';
    }
  };
}

// Mini Player
const miniPlayer = document.getElementById('miniPlayer');
const miniTitle = document.getElementById('miniTitle');
const miniAuthor = document.getElementById('miniAuthor');
const miniArtwork = document.getElementById('miniArtwork');
const miniPlayPauseBtn = document.getElementById('miniPlayPauseBtn');
const miniProgress = document.getElementById('miniProgress');

// Modals & Pages
const qrModal = document.getElementById('qrModal');
const playlistsModal = document.getElementById('playlistsModal');
const settingsModal = document.getElementById('settingsModal');
const searchModal = document.getElementById('searchModal');
const searchResultsList = document.getElementById('searchResultsList');
const searchModalTitle = document.getElementById('searchModalTitle');
const inputModal = document.getElementById('inputModal');
const addToPlaylistModal = document.getElementById('addToPlaylistModal');
const addToPlaylistList = document.getElementById('addToPlaylistList');
const discoverGrid = document.getElementById('discoverGrid');

const qrcodeContainer = document.getElementById('qrcode');
const ipAddressText = document.getElementById('ipAddressText');
const playlistsListUI = document.getElementById('playlistsListUI');
const createNewPlaylistBtn = document.getElementById('createNewPlaylistBtn');
const autoSkipToggle = document.getElementById('autoSkipToggle');

// --- TOAST ---
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// --- INIT ---
// Failsafe: Nếu sau 5s vẫn còn splash thì ẩn đi, tránh điện thoại bị treo
setTimeout(() => {
  const splash = document.getElementById('splashScreen');
  if (splash && splash.style.display !== 'none') {
    splash.classList.add('hidden');
    setTimeout(() => splash.style.display = 'none', 400);
  }
}, 5000);

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const permRes = await fetch('/api/permissions');
    if (permRes.ok) {
      const perm = await permRes.json();
      canEdit = perm.canEdit;
    }
  } catch(e) {}

  if (!isDesktop) {
    settingsBtn.style.display = 'none';
  } else {
    const desktopSettings = document.getElementById('desktopSettings');
    const autoStartToggle = document.getElementById('autoStartToggle');
    const allowPhoneEditToggle = document.getElementById('allowPhoneEditToggle');
    const quitAppBtn = document.getElementById('quitAppBtn');

    if (desktopSettings) desktopSettings.style.display = 'block';

    try {
      const res = await fetch('/api/autostart');
      if (res.ok) {
        const data = await res.json();
        if (autoStartToggle) autoStartToggle.checked = data.autoStart;
      }
    } catch(e) {}

    if (autoStartToggle) {
      autoStartToggle.addEventListener('change', async () => {
        try {
          await fetch('/api/autostart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoStart: autoStartToggle.checked })
          });
        } catch(e) {}
      });
    }

    if (allowPhoneEditToggle) {
      allowPhoneEditToggle.addEventListener('change', async () => {
        appData.settings.allowPhoneEdit = allowPhoneEditToggle.checked;
        await saveData();
        showToast(allowPhoneEditToggle.checked ? 'Điện thoại được phép sửa danh sách' : 'Điện thoại chỉ được nghe nhạc');
      });
    }

    if (quitAppBtn) {
      quitAppBtn.addEventListener('click', async () => {
        if (confirm("Bạn có chắc chắn muốn thoát hoàn toàn phần mềm?")) {
          try { await fetch('/api/quit', { method: 'POST' }); } catch(e) {}
          window.close();
        }
      });
    }
  }

  await loadData();
  renderPlaylist();

  // Hide splash screen smoothly
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.style.display = 'none', 400);
  }

  const songs = getCurrentSongs();
  if (songs.length > 0) {
    updatePlayerInfo(songs[0]);
  } else {
    trackTitleEl.innerText = "Chưa có bài hát";
    trackAuthorEl.innerText = "Hãy tìm kiếm để thêm";
  }

  autoSkipToggle.checked = appData.settings.autoSkip;
  autoSkipToggle.addEventListener('change', () => {
    appData.settings.autoSkip = autoSkipToggle.checked;
    if (!sessionPlaylist) saveData();
  });

  if (isDesktop) {
    const allowPhoneEditToggle = document.getElementById('allowPhoneEditToggle');
    if (allowPhoneEditToggle) allowPhoneEditToggle.checked = appData.settings.allowPhoneEdit !== false;
  }

  updatePlayModeUI();
  
  // Mobile Player UI init
  if (!isDesktop) appSidebar.classList.remove('mobile-open');
});

// --- ROUTER (SPA VIEWS) ---
function switchView(viewId) {
  viewPlaylist.classList.remove('active');
  viewDiscover.classList.remove('active');
  viewAlbum.classList.remove('active');
  document.getElementById('viewArtist').classList.remove('active');
  
  navPlaylistBtn.classList.remove('active-tab');
  navDiscoverBtn.classList.remove('active-tab');
  
  if (viewId === 'playlist') {
    viewPlaylist.classList.add('active');
    navPlaylistBtn.classList.add('active-tab');
  } else if (viewId === 'discover') {
    viewDiscover.classList.add('active');
    navDiscoverBtn.classList.add('active-tab');
    loadDiscoverData();
  } else if (viewId === 'album') {
    viewAlbum.classList.add('active');
    navDiscoverBtn.classList.add('active-tab');
  } else if (viewId === 'artist') {
    document.getElementById('viewArtist').classList.add('active');
  }
}

navPlaylistBtn.onclick = () => switchView('playlist');
navDiscoverBtn.onclick = () => switchView('discover');

// --- DATA ---
async function loadData() {
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      appData = await res.json();
      if (!appData.playlists || appData.playlists.length === 0) {
        appData.playlists = [{ id: "default", name: "Mặc định", songs: [] }];
      }
      if (!appData.settings) appData.settings = { autoSkip: true, allowPhoneEdit: true };
    }
  } catch(e) {
    console.error("Lỗi tải dữ liệu", e);
  }
}

async function saveData() {
  if (!canEdit) return; 
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: appData.settings, playlists: appData.playlists })
    });
  } catch(e) {
    console.error("Lỗi lưu dữ liệu", e);
  }
}

function getCurrentSongs() {
  if (sessionPlaylist) return sessionPlaylist.songs;
  if (!appData.playlists[currentListIndex]) return [];
  return appData.playlists[currentListIndex].songs || [];
}

// --- RENDER CURRENT PLAYLIST ---
function renderPlaylist() {
  const songs = getCurrentSongs();
  currentPlaylistNameEl.innerHTML = (sessionPlaylist ? sessionPlaylist.name : appData.playlists[currentListIndex].name) + ' <i class="ph ph-caret-down"></i>';
  songCountEl.innerText = `${songs.length} bài`;

  playlistList.innerHTML = '';
  songs.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = `playlist-item ${index === currentSongIndex ? 'active' : ''}`;

    const infoDiv = document.createElement('div');
    infoDiv.style.display = 'flex';
    infoDiv.style.alignItems = 'center';
    infoDiv.style.gap = '10px';
    infoDiv.style.flex = '1';
    infoDiv.style.minWidth = '0';
    infoDiv.innerHTML = `
      <img src="https://img.youtube.com/vi/${song.id}/mqdefault.jpg" alt="" loading="lazy">
      <div class="playlist-item-info">
        <div class="playlist-item-title">${song.title}</div>
        <div class="playlist-item-author">${song.channelId ? `<a class="author-link" style="color:var(--primary-color); cursor:pointer;">${song.author}</a>` : song.author}</div>
      </div>
    `;
    
    const authorLink = infoDiv.querySelector('.author-link');
    if (authorLink) {
      authorLink.onclick = (e) => {
        e.stopPropagation();
        openArtistPage(song.channelId, song.author);
      };
    }

    infoDiv.onclick = () => {
      // If clicking a song in Album, ensure we are in playlist view to see it
      if (sessionPlaylist) {
        switchView('playlist');
      }
      selectSong(index);
    };

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'playlist-item-actions';
    actionsDiv.style.cssText = 'display: flex; gap: 5px; opacity: 1; transition: 0.2s;';

    if (appData.playlists.length > 0) {
      const addBtn = document.createElement('button');
      addBtn.className = 'action-btn';
      addBtn.innerHTML = '<i class="ph ph-plus-circle"></i>';
      addBtn.onclick = (e) => { e.stopPropagation(); showAddToPlaylistPopup(song); };
      actionsDiv.appendChild(addBtn);
    }

    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'action-btn';
      upBtn.innerHTML = '<i class="ph ph-caret-up"></i>';
      upBtn.onclick = (e) => {
        e.stopPropagation();
        [songs[index - 1], songs[index]] = [songs[index], songs[index - 1]];
        if (currentSongIndex === index) currentSongIndex--;
        else if (currentSongIndex === index - 1) currentSongIndex++;
        if (!sessionPlaylist) saveData();
        renderPlaylist();
      };
      actionsDiv.appendChild(upBtn);
    }

    if (index < songs.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'action-btn';
      downBtn.innerHTML = '<i class="ph ph-caret-down"></i>';
      downBtn.onclick = (e) => {
        e.stopPropagation();
        [songs[index + 1], songs[index]] = [songs[index], songs[index + 1]];
        if (currentSongIndex === index) currentSongIndex++;
        else if (currentSongIndex === index + 1) currentSongIndex--;
        if (!sessionPlaylist) saveData();
        renderPlaylist();
      };
      actionsDiv.appendChild(downBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn delete';
    delBtn.innerHTML = '<i class="ph ph-trash"></i>';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      songs.splice(index, 1);
      if (!sessionPlaylist) saveData();

      if (index === currentSongIndex) {
        if (songs.length > 0) {
          currentSongIndex = index >= songs.length ? 0 : index;
          selectSong(currentSongIndex);
        } else {
          audio.pause();
          audio.src = '';
          trackTitleEl.innerText = "Danh sách trống";
        }
      } else if (index < currentSongIndex) {
        currentSongIndex--;
      }
      renderPlaylist();
    };
    actionsDiv.appendChild(delBtn);

    item.appendChild(infoDiv);
    item.appendChild(actionsDiv);
    playlistList.appendChild(item);
  });
}

// --- DISCOVER / ALBUMS ---
let discoverLoaded = false;
async function loadDiscoverData() {
  // Always reload - never skip, so user always sees updated data
  
  const renderDiscover = (data) => {
    discoverGrid.innerHTML = '';
    let albums = [];
    let artists = [];

    // Support both old array format and new { artists, albums } format
    if (Array.isArray(data)) {
      albums = data;
    } else if (data && typeof data === 'object') {
      albums = data.albums || [];
      artists = data.artists || [];
    } else {
      discoverGrid.innerHTML = '<p style="text-align:center;width:100%;">Lỗi dữ liệu.</p>';
      return;
    }

    if (artists.length > 0) {
      const artistSection = document.createElement('div');
      artistSection.className = 'artist-section';
      artistSection.innerHTML = '<h3 style="margin: 0 0 10px 0; font-size: 1.1rem; padding: 0 5px;">Nghệ sĩ Nổi Bật</h3>';
      
      const artistScroll = document.createElement('div');
      artistScroll.className = 'artist-scroll';
      
      artists.forEach(artist => {
        const aCard = document.createElement('div');
        aCard.className = 'artist-circle';
        aCard.innerHTML = `
          <img src="${artist.thumbnail}" alt="" loading="lazy" onerror="this.onerror=null; this.src='https://img.youtube.com/vi/${artist.id || ''}/mqdefault.jpg'">
          <div class="artist-name">${artist.name}</div>
        `;
        aCard.onclick = () => openArtistPage(artist.id, artist.name);
        artistScroll.appendChild(aCard);
      });
      artistSection.appendChild(artistScroll);
      discoverGrid.appendChild(artistSection);
    }

    if (albums.length > 0) {
      const albumSection = document.createElement('div');
      albumSection.innerHTML = '<h3 style="margin: 15px 0 10px 0; font-size: 1.1rem; padding: 0 5px;">Tuyển Chọn</h3>';
      const albumGrid = document.createElement('div');
      albumGrid.className = 'album-compact-grid';
      
      albums.forEach(album => {
        const card = document.createElement('div');
        card.className = 'album-card compact';
        card.innerHTML = `
          <img src="${album.cover}" class="album-cover" alt="" loading="lazy">
          <div class="album-title">${album.name}</div>
        `;
        card.onclick = () => showAlbumDetail(album);
        albumGrid.appendChild(card);
      });
      
      albumSection.appendChild(albumGrid);
      discoverGrid.appendChild(albumSection);
    }

    if (artists.length === 0 && albums.length === 0) {
      discoverGrid.innerHTML = '<p style="text-align:center;width:100%;">Không có dữ liệu.</p>';
    }
  };

  // Always show loading, then fetch fresh data
  discoverGrid.innerHTML = '<p style="text-align:center;width:100%;">Đang tải Bảng Xếp Hạng...</p>';
  discoverLoaded = true;

  try {
    const res = await fetch('/api/discover');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderDiscover(data);
  } catch(e) {
    discoverGrid.innerHTML = '<p style="text-align:center;width:100%;">Lỗi tải dữ liệu. <button onclick="discoverLoaded=false;loadDiscoverData()" style="background:var(--primary-color);border:none;color:white;padding:5px 12px;border-radius:8px;cursor:pointer;margin-top:8px;">Thử lại</button></p>';
  }
}

function showAlbumDetail(album) {
  switchView('album');
  document.getElementById('albumDetailName').innerText = album.name;
  document.getElementById('albumDetailCount').innerText = `${album.songs.length} bài hát`;
  
  const trackList = document.getElementById('albumTrackList');
  trackList.innerHTML = '';
  
  album.songs.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <img src="https://img.youtube.com/vi/${s.id}/mqdefault.jpg" alt="" loading="lazy">
      <div class="search-result-info">
        <div class="search-result-title">${s.title}</div>
        <div class="search-result-author">${s.author}</div>
      </div>
      <div class="search-result-actions">
        <button class="add-btn"><i class="ph ph-plus"></i></button>
      </div>
    `;
    
    item.querySelector('.add-btn').onclick = (e) => {
      e.stopPropagation();
      showAddToPlaylistPopup({ id: s.id, title: s.title, author: s.author, url: `https://youtube.com/watch?v=${s.id}`});
    };
    
    // Play specific song in album
    item.onclick = () => {
      sessionPlaylist = { name: album.name, songs: JSON.parse(JSON.stringify(album.songs)) };
      currentSongIndex = album.songs.findIndex(x => x.id === s.id);
      renderPlaylist();
      selectSong(currentSongIndex);
      switchView('playlist');
      if (!isDesktop) appSidebar.classList.add('mobile-open');
    };
    
    trackList.appendChild(item);
  });
  
  document.getElementById('backToDiscoverBtn').onclick = () => switchView('discover');
  
  const playAllBtn = document.getElementById('playAlbumBtn');
  playAllBtn.onclick = () => {
    sessionPlaylist = { name: album.name, songs: JSON.parse(JSON.stringify(album.songs)) };
    currentSongIndex = 0;
    renderPlaylist();
    selectSong(0);
    switchView('playlist');
    if (!isDesktop) appSidebar.classList.add('mobile-open');
  };
  
  // UX Requirement: Do not auto-play if just viewing Album, wait for user action
}

// --- ADD TO PLAYLIST MODAL ---
function showAddToPlaylistPopup(song) {
  addToPlaylistList.innerHTML = '';
  appData.playlists.forEach((pl, idx) => {
    const item = document.createElement('div');
    item.className = 'add-to-pl-item';
    item.innerHTML = `<span class="pl-name">${pl.name}</span><span class="pl-count">${pl.songs?.length || 0} bài</span>`;
    item.onclick = () => {
      if (pl.songs.find(s => s.id === song.id)) {
        showToast('Bài hát đã có trong danh sách');
      } else {
        pl.songs.push({ ...song });
        saveData();
        showToast(`Đã thêm vào "${pl.name}"`);
        if (!sessionPlaylist && currentListIndex === idx) renderPlaylist();
      }
      addToPlaylistModal.style.display = 'none';
    };
    addToPlaylistList.appendChild(item);
  });
  addToPlaylistModal.style.display = 'flex';
}

// --- SEARCH ---
let currentSearchQuery = '';
let currentSearchOffset = 0;
let isCurrentSearchPlaylist = false;

loadBtn.addEventListener('click', handleUrlInput);
inputUrl.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUrlInput(); });

const loadMoreSearchBtn = document.getElementById('loadMoreSearchBtn');
loadMoreSearchBtn.addEventListener('click', async () => {
  currentSearchOffset += 5;
  loadMoreSearchBtn.disabled = true;
  loadMoreSearchBtn.innerHTML = '<i class="ph ph-spinner"></i> Đang tải...';
  try {
    const apiPath = isCurrentSearchPlaylist 
      ? `/api/playlist?url=${encodeURIComponent(currentSearchQuery)}&offset=${currentSearchOffset}&limit=5`
      : `/api/search?q=${encodeURIComponent(currentSearchQuery)}&offset=${currentSearchOffset}&limit=5`;
      
    const res = await fetch(apiPath);
    const data = await res.json();
    
    // Đối với playlist, mảng chứa trong data.tracks, với search là data.results
    const items = isCurrentSearchPlaylist ? data.tracks : data.results;
    
    if (items && items.length > 0) {
      appendSearchResults(items);
      loadMoreSearchBtn.style.display = data.hasMore ? 'flex' : 'none';
    } else {
      loadMoreSearchBtn.style.display = 'none';
    }
  } finally {
    loadMoreSearchBtn.disabled = false;
    loadMoreSearchBtn.innerHTML = '<i class="ph ph-arrow-down"></i> Tải thêm 5 bài';
  }
});

async function handleUrlInput() {
  const url = inputUrl.value.trim();
  if (!url) return;

  const videoIdMatch = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
  const isPlaylist = url.includes('list=') || url.includes('/playlist?');
  const songs = getCurrentSongs();

  if (videoIdMatch) {
    // Ưu tiên phát ngay bài hát (chính xác bài hát mà user đang xem)
    const newSong = { title: "Đang tải...", author: "YouTube", id: videoIdMatch[1], url: url };
    songs.unshift(newSong);
    if (!sessionPlaylist) saveData();
    currentSongIndex = 0;
    renderPlaylist();
    selectSong(0);
    inputUrl.value = "";
  } else if (isPlaylist) {
    trackTitleEl.innerText = "Đang nạp playlist...";
    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}&limit=5`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        currentSearchQuery = url;
        currentSearchOffset = 0;
        isCurrentSearchPlaylist = true;
        showSearchResults(data.tracks, `Playlist: ${data.title}`, data.hasMore);
        inputUrl.value = "";
      }
    } catch (e) {
      showToast("Lỗi khi tải playlist!");
    }
    updatePlayerInfo(songs[currentSongIndex]);
  } else {
    loadBtn.disabled = true;
    const orig = loadBtn.innerHTML;
    loadBtn.innerHTML = "⏳";
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(url)}&limit=5`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        currentSearchQuery = url;
        currentSearchOffset = 0;
        isCurrentSearchPlaylist = false;
        showSearchResults(data.results, `Kết quả: "${url}"`, data.hasMore);
        inputUrl.value = "";
      } else {
        showToast("Không tìm thấy kết quả!");
      }
    } catch(e) {
      showToast("Lỗi khi tìm kiếm!");
    } finally {
      loadBtn.disabled = false;
      loadBtn.innerHTML = orig;
    }
  }
}

function showSearchResults(results, title, hasMore = false) {
  searchModalTitle.textContent = title || 'Kết quả tìm kiếm';
  searchResultsList.innerHTML = '';
  loadMoreSearchBtn.style.display = hasMore ? 'flex' : 'none';
  appendSearchResults(results);
  searchModal.style.display = 'flex';
}

function appendSearchResults(results) {
  results.forEach(song => {
    const item = buildSearchItem(song);
    searchResultsList.appendChild(item);
  });
}

function buildSearchItem(song) {
  const item = document.createElement('div');
  item.className = 'search-result-item';
  item.innerHTML = `
    <img src="https://img.youtube.com/vi/${song.id}/mqdefault.jpg" alt="" loading="lazy">
    <div class="search-result-info">
      <div class="search-result-title">${song.title}</div>
      <a class="author-link">${song.author}</a>
    </div>
    <div class="search-result-actions">
      <button class="add-btn add-to-current"><i class="ph ph-plus"></i></button>
    </div>
  `;

  // Author link → Artist Page
  if (song.channelId) {
    item.querySelector('.author-link').onclick = (e) => {
      e.stopPropagation();
      searchModal.style.display = 'none';
      openArtistPage(song.channelId, song.author);
    };
  }

  item.querySelector('.add-to-current').onclick = (e) => {
    e.stopPropagation();
    const currentSongs = getCurrentSongs();
    if (currentSongs.find(s => s.id === song.id)) return showToast('Bài hát đã có');
    currentSongs.push({ title: song.title, author: song.author, id: song.id, channelId: song.channelId || null, url: song.url || `https://www.youtube.com/watch?v=${song.id}` });
    if (!sessionPlaylist) saveData();
    renderPlaylist();
    showToast(`Đã thêm "${song.title}"`);
    const btn = e.currentTarget;
    btn.innerHTML = '<i class="ph ph-check"></i>';
    btn.style.color = '#2ecc71';
    btn.style.borderColor = '#2ecc71';
    btn.disabled = true;
  };

  // Click title → play immediately
  item.querySelector('.search-result-title').style.cursor = 'pointer';
  item.querySelector('.search-result-title').onclick = () => {
    const currentSongs = getCurrentSongs();
    if (!currentSongs.find(s => s.id === song.id)) {
      currentSongs.unshift({ title: song.title, author: song.author, id: song.id, channelId: song.channelId || null, url: song.url || `https://www.youtube.com/watch?v=${song.id}` });
      if (!sessionPlaylist) saveData();
    }
    currentSongIndex = currentSongs.findIndex(s => s.id === song.id);
    searchModal.style.display = 'none';
    renderPlaylist();
    selectSong(currentSongIndex);
  };

  return item;
}

// --- ARTIST PAGE ---
let currentArtistPage = 1;
let currentArtistChannelId = null;

document.getElementById('backFromArtistBtn').onclick = () => switchView('discover');

document.getElementById('loadMoreArtistBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loadMoreArtistBtn');
  currentArtistPage++;
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Đang tải...';
  try {
    const res = await fetch(`/api/artist/more?id=${currentArtistChannelId}&page=${currentArtistPage}`);
    const data = await res.json();
    if (data.songs && data.songs.length > 0) {
      const list = document.getElementById('artistSongList');
      data.songs.forEach(s => list.appendChild(buildAlbumSongItem(s, 'artist')));
      btn.style.display = data.hasMore ? 'flex' : 'none';
    } else {
      btn.style.display = 'none';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-arrow-down"></i> Xem thêm 50 bài';
  }
});

async function openArtistPage(channelId, channelName) {
  // Always reset and re-fetch - fix bug where switching artists doesn't reload
  currentArtistChannelId = channelId;
  currentArtistPage = 1;
  switchView('artist');

  const skeleton = document.getElementById('artistSkeleton');
  const content = document.getElementById('artistContent');
  skeleton.style.display = 'block';
  content.style.display = 'none';
  // Clear old data so user sees fresh load
  document.getElementById('artistSongList').innerHTML = '';
  document.getElementById('artistName').innerText = channelName || '...';
  document.getElementById('artistSongCount').innerText = 'Đang tải...';

  try {
    // Add cache-bust param so server always re-fetches fresh data
    const res = await fetch(`/api/artist?id=${encodeURIComponent(channelId)}&name=${encodeURIComponent(channelName || '')}&t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();

    skeleton.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('artistName').innerText = data.name || channelName;
    document.getElementById('artistSongCount').innerText = `${data.songs.length} bài hát`;
    const thumb = document.getElementById('artistThumb');
    thumb.src = data.thumbnail || (data.songs[0] ? `https://img.youtube.com/vi/${data.songs[0].id}/hqdefault.jpg` : '');
    thumb.onerror = () => { thumb.onerror = null; thumb.src = `https://img.youtube.com/vi/${data.songs[0]?.id}/hqdefault.jpg`; };

    const list = document.getElementById('artistSongList');
    list.innerHTML = '';
    data.songs.forEach(s => list.appendChild(buildAlbumSongItem(s, 'artist')));

    const moreBtn = document.getElementById('loadMoreArtistBtn');
    moreBtn.style.display = data.songs.length >= 50 ? 'flex' : 'none';
  } catch(e) {
    skeleton.style.display = 'none';
    showToast('Không thể tải trang nghệ sĩ');
    switchView('discover');
  }
}

// Shared helper for building a song row (Album or Artist context)
function buildAlbumSongItem(s, context = 'album') {
  const item = document.createElement('div');
  item.className = 'search-result-item';
  item.innerHTML = `
    <img src="https://img.youtube.com/vi/${s.id}/mqdefault.jpg" alt="" loading="lazy">
    <div class="search-result-info">
      <div class="search-result-title" style="cursor:pointer;">${s.title}</div>
      ${s.channelId && context !== 'artist' ? `<a class="author-link">${s.author}</a>` : `<span class="search-result-author">${s.author}</span>`}
    </div>
    <div class="search-result-actions">
      <button class="add-btn"><i class="ph ph-plus"></i></button>
    </div>
  `;

  // Author link → Artist Page (only in album context)
  if (context !== 'artist' && s.channelId) {
    item.querySelector('.author-link').onclick = (e) => {
      e.stopPropagation();
      openArtistPage(s.channelId, s.author);
    };
  }

  item.querySelector('.add-btn').onclick = (e) => {
    e.stopPropagation();
    showAddToPlaylistPopup({ id: s.id, title: s.title, author: s.author, channelId: s.channelId || null, url: `https://youtube.com/watch?v=${s.id}` });
  };

  item.querySelector('.search-result-title').onclick = () => {
    if (context === 'artist') {
      // Play from artist — create a temp session
      const artistSongs = Array.from(document.getElementById('artistSongList').querySelectorAll('.search-result-title')).map((el, i) => ({
        id: el.closest('.search-result-item').querySelector('img').src.match(/vi\/(.+?)\/mq/)?.[1],
        title: el.textContent.trim(),
        author: s.author
      }));
    }
    // Generic: play the song, go to playlist
    const currentSongs = getCurrentSongs();
    if (!currentSongs.find(x => x.id === s.id)) {
      currentSongs.unshift({ id: s.id, title: s.title, author: s.author, channelId: s.channelId || null, url: `https://youtube.com/watch?v=${s.id}` });
      if (!sessionPlaylist) saveData();
    }
    currentSongIndex = currentSongs.findIndex(x => x.id === s.id);
    renderPlaylist();
    selectSong(currentSongIndex);
    switchView('playlist');
    if (!isDesktop) appSidebar.classList.add('mobile-open');
  };

  return item;
}


// --- PLAYBACK CONTROLS ---
playPauseBtn.addEventListener('click', togglePlay);
miniPlayPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });

  function togglePlay() {
    if (!audio.src) { selectSong(currentSongIndex); return; }
    if (audio.paused) {
      if (pauseTimestamp > 0 && Date.now() - pauseTimestamp > 120000) {
        console.warn("[Resume] Paused for > 2 mins, auto-recovering stream...");
        recoverAudioStream();
        pauseTimestamp = 0;
        return;
      }
      
      // Khởi động watchdog ngay lập tức nếu stream bị kẹt (không lên tiếng)
      consecutiveErrorCount = 0;
      startStalledWatchdog();

      audio.play().catch(e => {
        console.warn("Play error/blocked:", e);
        recoverAudioStream();
      });
      pauseTimestamp = 0;
    } else {
      audio.pause();
    }
  }

// IPC listener for mini player commands
if (window.electronAPI) {
  window.electronAPI.onPlayerCommand((cmd) => {
    if (cmd === 'togglePlay') togglePlay();
    if (cmd === 'playNext') playNext(true);
    if (cmd === 'playPrev') playPrev(true);
  });
}

function playNext(isAuto = false) {
  const songs = getCurrentSongs();
  if (songs.length === 0) return;
  if (playMode === 'repeat_one') selectSong(currentSongIndex, isAuto);
  else if (playMode === 'shuffle') selectSong(Math.floor(Math.random() * songs.length), isAuto);
  else selectSong(currentSongIndex < songs.length - 1 ? currentSongIndex + 1 : 0, isAuto);
}

function playPrev(isAuto = false) {
  const songs = getCurrentSongs();
  if (songs.length === 0) return;
  if (playMode === 'repeat_one') selectSong(currentSongIndex, isAuto);
  else if (playMode === 'shuffle') selectSong(Math.floor(Math.random() * songs.length), isAuto);
  else selectSong(currentSongIndex > 0 ? currentSongIndex - 1 : songs.length - 1, isAuto);
}

nextBtn.addEventListener('click', playNext);

const playAllBtn = document.getElementById('playAllBtn');
if (playAllBtn) {
  playAllBtn.addEventListener('click', () => {
    const songs = getCurrentSongs();
    if (songs.length === 0) return showToast('Danh sách trống');
    currentSongIndex = 0;
    playMode = 'sequential';
    updatePlayModeUI();
    renderPlaylist();
    selectSong(0);
  });
}

const shufflePlayBtn = document.getElementById('shufflePlayBtn');
if (shufflePlayBtn) {
  shufflePlayBtn.addEventListener('click', () => {
    const songs = getCurrentSongs();
    if (songs.length === 0) return showToast('Danh sách trống');
    currentSongIndex = Math.floor(Math.random() * songs.length);
    playMode = 'shuffle';
    updatePlayModeUI();
    renderPlaylist();
    selectSong(currentSongIndex);
  });
}
prevBtn.addEventListener('click', playPrev);

progressBarBg.addEventListener('click', (e) => {
  if (!audio.duration) return;
  const rect = progressBarBg.getBoundingClientRect();
  audio.currentTime = audio.duration * ((e.clientX - rect.left) / rect.width);
});

// --- AUDIO EVENTS ---
audio.addEventListener('play', () => { 
  isPlaying = true; 
  updateUIPlayPause(); 
  sendPlayerState();
});
  audio.addEventListener('pause', () => { 
    pauseTimestamp = Date.now();
    isPlaying = false; 
    updateUIPlayPause(); 
    sendPlayerState();
  });

audio.addEventListener('waiting', () => {
  const spinner = '<i class="ph ph-spinner ph-spin"></i>';
  playPauseBtn.innerHTML = spinner;
  miniPlayPauseBtn.innerHTML = spinner;
});

audio.addEventListener('playing', () => {
  isPlaying = true;
  updateUIPlayPause();
  prefetchNextSong();
  sendPlayerState();
});

function prefetchNextSong() {
  const songs = getCurrentSongs();
  if (!songs || songs.length === 0) return;
  let nextIndex = -1;
  if (playMode === 'sequential') {
    nextIndex = currentSongIndex < songs.length - 1 ? currentSongIndex + 1 : 0;
  } else if (playMode === 'shuffle') {
    // Just prefetch the one right below it as a guess
    nextIndex = currentSongIndex < songs.length - 1 ? currentSongIndex + 1 : 0;
  }
  if (nextIndex !== -1 && songs[nextIndex]) {
    fetch(`/api/prefetch?id=${songs[nextIndex].id}`).catch(() => {});
  }
}

audio.addEventListener('timeupdate', () => {
  const d = audio.duration;
  if (d > 0) {
    const pct = (audio.currentTime / d) * 100;
    progressBarFill.style.width = `${pct}%`;
    miniProgress.style.width = `${pct}%`;
    currentTimeEl.innerText = formatTime(audio.currentTime);
    
    // Throttle state update for progress to avoid spamming IPC
    if (Math.floor(audio.currentTime) % 2 === 0) {
      if (window.electronAPI) {
        window.electronAPI.sendPlayerState({ progressPct: pct });
      }
    }
  }
});
audio.addEventListener('loadedmetadata', () => { durationTimeEl.innerText = formatTime(audio.duration); });
audio.addEventListener('ended', playNext);

// Cờ để ngăn error handler kích hoạt khi đang reload stream thủ công
let suppressAudioErrors = false;
let consecutiveErrorCount = 0;

audio.addEventListener('error', () => {
  if (suppressAudioErrors) return; // Bỏ qua lỗi do chính code gây ra (reload)
  const errCode = audio.error?.code;
  // Code 1 = MEDIA_ERR_ABORTED (user action / reload) → bỏ qua
  if (errCode === 1) return;
  console.error("Audio playback error", audio.error);
  
  if (!navigator.onLine) {
    trackTitleEl.innerText = "Mất mạng. Đang chờ...";
    return;
  }
  
  consecutiveErrorCount++;
  if (consecutiveErrorCount >= 3) {
    console.warn("Nhiều lỗi liên tiếp. Dừng phát tự động.");
    trackTitleEl.innerText = "Lỗi liên tiếp. Đã tạm dừng.";
    audio.pause();
    return;
  }

  trackTitleEl.innerText = "Lỗi tải âm thanh";
  if (appData.settings.autoSkip) {
    setTimeout(() => playNext(true), 2000);
  }
});

// --- STALL / FREEZE RECOVERY & NETWORK HANDLING ---
// Khi stream bị ngắt giữa chừng (YouTube throttle), dùng audio.load() thay vì xóa src
// để tránh kích hoạt error event
let stalledTimer = null;
let lastWatchdogTime = -1;
let watchdogStallCount = 0;

function clearStalledTimer() {
  if (stalledTimer) { clearInterval(stalledTimer); stalledTimer = null; }
  watchdogStallCount = 0;
}

function startStalledWatchdog() {
  clearStalledTimer();
  lastWatchdogTime = audio.currentTime;
  watchdogStallCount = 0;

  stalledTimer = setInterval(() => {
    if (audio.paused || audio.ended || suppressAudioErrors) {
      clearStalledTimer();
      return;
    }
    if (audio.currentTime === lastWatchdogTime) {
      watchdogStallCount++;
      if (watchdogStallCount >= 5) { // 5s không tiến → retry
        clearStalledTimer();
        console.warn('[Stall] Stream đứng 5s, thử tải lại...');
        recoverAudioStream();
      }
    } else {
      watchdogStallCount = 0;
      lastWatchdogTime = audio.currentTime;
    }
  }, 1000);
}

function recoverAudioStream() {
  const savedTime = audio.currentTime;
  suppressAudioErrors = true;
  
  // Ép tải lại URL bằng cách thêm query timestamp và media fragment
  const currentUrl = new URL(audio.src, window.location.href);
  currentUrl.searchParams.set('t', Date.now());
  if (savedTime > 0) {
    currentUrl.hash = `t=${savedTime}`;
  }
  audio.src = currentUrl.toString();
  
  audio.load();
  
  const onCanPlay = () => {
    audio.removeEventListener('canplay', onCanPlay);
    // Vẫn set lại currentTime để đảm bảo chính xác phòng trường hợp browser ignore hash
    if (savedTime > 0 && Math.abs(audio.currentTime - savedTime) > 2) {
      try { audio.currentTime = savedTime; } catch(e){}
    }
    audio.play()
      .then(() => { suppressAudioErrors = false; })
      .catch(() => {
        suppressAudioErrors = false;
        if (appData.settings.autoSkip && navigator.onLine) setTimeout(() => playNext(true), 1500);
      });
  };
  audio.addEventListener('canplay', onCanPlay);
  
  // Fallback 10s nếu không gọi được canplay
  setTimeout(() => {
    audio.removeEventListener('canplay', onCanPlay);
    if (suppressAudioErrors) {
      suppressAudioErrors = false;
      if (appData.settings.autoSkip && navigator.onLine) playNext(true);
    }
  }, 10000);
}

audio.addEventListener('playing', () => { 
  consecutiveErrorCount = 0;
  startStalledWatchdog(); 
});
audio.addEventListener('pause', () => { clearStalledTimer(); });
audio.addEventListener('ended', () => { clearStalledTimer(); });

// Network Change Listeners
let wasPlayingBeforeOffline = false;
window.addEventListener('offline', () => {
  console.warn('[Network] Offline detected');
  wasPlayingBeforeOffline = !audio.paused;
  if (!audio.paused) {
    audio.pause();
    trackTitleEl.innerText = "Mất kết nối mạng...";
  }
});

window.addEventListener('online', () => {
  console.warn('[Network] Online detected');
  if (wasPlayingBeforeOffline) {
    trackTitleEl.innerText = "Đã có mạng, đang kết nối lại...";
    setTimeout(() => recoverAudioStream(), 2000); // Chờ 2s cho mạng ổn định
  } else {
    const songs = getCurrentSongs();
    if (songs && songs[currentSongIndex]) updatePlayerInfo(songs[currentSongIndex]);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Trình duyệt vừa được mở lại (thoát trạng thái ngủ đông)
    if (!audio.paused && audio.readyState < 3 && !suppressAudioErrors) {
      console.warn('[Visibility] Browser woke up, audio is waiting. Trying to recover...');
      recoverAudioStream();
    }
  }
});

// --- SELECT SONG ---
async function selectSong(index, isAuto = false) {
  if (!isAuto) {
    consecutiveErrorCount = 0; // Chỉ reset khi user chủ động chọn bài
  }
  const songs = getCurrentSongs();
  if (!songs || songs.length === 0) return;

  const token = ++currentSelectToken;
  currentSongIndex = index;
  const song = songs[index];
  
  updatePlayerInfo(song);
  renderPlaylist();

  // Show spinner immediately
  const spinner = '<i class="ph ph-spinner ph-spin"></i>';
  playPauseBtn.innerHTML = spinner;
  miniPlayPauseBtn.innerHTML = spinner;

  try {
    audio.src = `/api/stream?id=${song.id}`;
    const p = audio.play();
    if (p !== undefined) p.catch(() => {});

    // Chỉ fetch info nếu tiêu đề là tạm thời hoặc bị thiếu
    if (song.title === 'Đang phân tích...' || !song.author) {
      const res = await fetch(`/api/info?url=${encodeURIComponent(song.url || 'https://youtube.com/watch?v='+song.id)}`);
      if (res.ok) {
        if (currentSelectToken !== token) return;
        const data = await res.json();
        song.title = data.title;
        song.author = data.author;
        updatePlayerInfo(song);
        updateMediaSession(data.title, data.author, song.id);
      }
    } else {
      updateMediaSession(song.title, song.author, song.id);
    }
  } catch (error) {
    if (currentSelectToken !== token) return;
    trackTitleEl.innerText = "Bị chặn / Lỗi tải";
    fetch('/api/report-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: song.id }) }).catch(()=>{});
    if (appData.settings.autoSkip) {
      setTimeout(() => {
        if (currentSelectToken !== token) return;
        songs.splice(index, 1);
        if (!sessionPlaylist) saveData();
        songs.length === 0 ? audio.pause() : playNext();
      }, 2000);
    }
  }
}

function updatePlayerInfo(song) {
  if (!song) return;
  trackTitleEl.innerText = song.title;
  
  if (song.channelId) {
    trackAuthorEl.innerHTML = `<a style="color:var(--primary-color); cursor:pointer;">${song.author}</a>`;
    trackAuthorEl.querySelector('a').onclick = () => {
      openArtistPage(song.channelId, song.author);
    };
  } else {
    trackAuthorEl.innerText = song.author;
  }

  const imgUrl = `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`;
  artworkEl.src = imgUrl;
  currentVideoId = song.id;

  // Update video embed if video mode is active
  if (videoMode && videoEmbed) {
    videoEmbed.src = `https://www.youtube.com/embed/${song.id}?autoplay=1&controls=1&rel=0`;
    audio.pause(); // Let video handle audio
  }
  
  miniTitle.innerText = song.title;
  miniAuthor.innerText = song.author;
  miniArtwork.src = imgUrl;

  sendPlayerState();
}

function sendPlayerState() {
  if (window.electronAPI) {
    const song = getCurrentSongs()[currentSongIndex];
    if (song) {
      window.electronAPI.sendPlayerState({
        title: song.title,
        author: song.author,
        artwork: `https://img.youtube.com/vi/${song.id}/mqdefault.jpg`,
        isPlaying: isPlaying,
        progressPct: audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
      });
    }
  }
}

function updateUIPlayPause() {
  if (isPlaying && audio.readyState < 3) {
    // Keep spinner if playing but still waiting for data
    const spinner = '<i class="ph ph-spinner ph-spin"></i>';
    playPauseBtn.innerHTML = spinner;
    miniPlayPauseBtn.innerHTML = spinner;
  } else {
    const icon = isPlaying ? '<i class="ph-fill ph-pause"></i>' : '<i class="ph-fill ph-play"></i>';
    playPauseBtn.innerHTML = icon;
    miniPlayPauseBtn.innerHTML = icon;
  }
  isPlaying ? artworkContainer.classList.add('playing') : artworkContainer.classList.remove('playing');
}

// --- MODALS & EXTRAS ---
currentPlaylistNameEl.onclick = () => {
  if (!isDesktop && !canEdit) return showToast('Chủ máy chưa cho phép sửa');
  sessionPlaylist = null;
  playlistsModal.style.display = 'flex';
  renderPlaylistsManager();
};

qrBtn.onclick = () => {
  qrModal.style.display = 'flex';
  const url = `http://${appData.ip}:${appData.port}`;
  ipAddressText.innerText = url;
  if (!qrGenerated && typeof QRCode !== 'undefined') {
    new QRCode(qrcodeContainer, { text: url, width: 150, height: 150 });
    qrGenerated = true;
  }
};

const createTunnelBtn = document.getElementById('createTunnelBtn');
const tunnelLinkContainer = document.getElementById('tunnelLinkContainer');
const tunnelLinkInput = document.getElementById('tunnelLinkInput');

createTunnelBtn.onclick = async () => {
  createTunnelBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Đang khởi tạo... (Cần 15s)';
  createTunnelBtn.disabled = true;
  try {
    const res = await fetch('/api/tunnel');
    const data = await res.json();
    if(data.url) {
      tunnelLinkContainer.style.display = 'block';
      tunnelLinkInput.value = data.url;
      createTunnelBtn.style.display = 'none';
      
      // Cập nhật lại mã QR mới
      document.getElementById('qrcode').innerHTML = '';
      new QRCode(document.getElementById('qrcode'), { text: data.url, width: 150, height: 150 });
    }
  } catch(e) {
    alert("Lỗi tạo link internet. Có thể server quá tải.");
    createTunnelBtn.innerHTML = '<i class="ph ph-globe-hemisphere-west"></i> Phát qua Internet (Khác WiFi / Dùng 4G)';
    createTunnelBtn.disabled = false;
  }
};

settingsBtn.onclick = () => settingsModal.style.display = 'flex';

window.onclick = (e) => {
  if (e.target === qrModal) qrModal.style.display = 'none';
  if (e.target === playlistsModal) playlistsModal.style.display = 'none';
  if (e.target === settingsModal) settingsModal.style.display = 'none';
  if (e.target === searchModal) searchModal.style.display = 'none';
  if (e.target === inputModal) inputModal.style.display = 'none';
  if (e.target === addToPlaylistModal) addToPlaylistModal.style.display = 'none';
}

function renderPlaylistsManager() {
  playlistsListUI.innerHTML = '';
  appData.playlists.forEach((pl, idx) => {
    const item = document.createElement('div');
    item.className = `playlist-item-ui ${idx === currentListIndex ? 'active' : ''}`;
    const nameEl = document.createElement('div');
    nameEl.innerText = `${pl.name} (${pl.songs?.length || 0} bài)`;
    nameEl.style.flex = '1';
    nameEl.onclick = () => {
      currentListIndex = idx;
      playlistsModal.style.display = 'none';
      switchView('playlist');
      renderPlaylist();
    };
    item.appendChild(nameEl);

    if (appData.playlists.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.innerHTML = '<i class="ph ph-trash"></i>';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Xoá danh sách "${pl.name}"?`)) {
          appData.playlists.splice(idx, 1);
          if (currentListIndex === idx) currentListIndex = 0;
          else if (currentListIndex > idx) currentListIndex--;
          saveData();
          renderPlaylistsManager();
          renderPlaylist();
        }
      };
      item.appendChild(delBtn);
    }
    playlistsListUI.appendChild(item);
  });
}

function showInputModal(title, placeholder) {
  return new Promise((resolve) => {
    const titleEl = document.getElementById('inputModalTitle');
    const fieldEl = document.getElementById('inputModalField');
    const confirmBtn = document.getElementById('inputModalConfirm');

    titleEl.textContent = title;
    fieldEl.placeholder = placeholder;
    fieldEl.value = '';
    inputModal.style.display = 'flex';
    setTimeout(() => fieldEl.focus(), 100);

    const cleanup = () => { confirmBtn.removeEventListener('click', onConfirm); fieldEl.removeEventListener('keypress', onKey); };
    const onConfirm = () => { const val = fieldEl.value.trim(); inputModal.style.display = 'none'; cleanup(); resolve(val || null); };
    const onKey = (e) => { if (e.key === 'Enter') onConfirm(); };

    confirmBtn.addEventListener('click', onConfirm);
    fieldEl.addEventListener('keypress', onKey);
  });
}

createNewPlaylistBtn.onclick = async () => {
  const name = await showInputModal('Tạo danh sách mới', 'Nhập tên danh sách...');
  if (name) {
    if (appData.playlists.find(p => p.name === name)) return showToast('Tên danh sách đã tồn tại!');
    appData.playlists.push({ id: "pl-" + Date.now(), name: name, songs: [] });
    saveData();
    renderPlaylistsManager();
    showToast(`Đã tạo "${name}"`);
  }
};

function updatePlayModeUI() {
  if (playMode === 'sequential') { playModeBtn.innerHTML = '<i class="ph ph-arrows-left-right"></i>'; playModeBtn.style.color = 'var(--text-primary)'; }
  else if (playMode === 'shuffle') { playModeBtn.innerHTML = '<i class="ph ph-shuffle"></i>'; playModeBtn.style.color = 'var(--accent-color)'; }
  else if (playMode === 'repeat_one') { playModeBtn.innerHTML = '<i class="ph ph-repeat-once"></i>'; playModeBtn.style.color = 'var(--accent-color)'; }
}

playModeBtn.onclick = () => {
  let idx = PLAY_MODES.indexOf(playMode);
  playMode = PLAY_MODES[(idx + 1) % PLAY_MODES.length];
  updatePlayModeUI();
};

miniPlayer.onclick = () => appSidebar.classList.add('mobile-open');
mobileClosePlayerBtn.onclick = () => appSidebar.classList.remove('mobile-open');

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

function updateMediaSession(title, author, videoId) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title, artist: author, album: "YT Music BG",
      artwork: [{ src: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }]
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }
}

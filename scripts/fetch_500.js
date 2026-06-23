import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const categories = [
  {
    id: "vpop-100",
    name: "🔥 Top 100 V-Pop & Zing MP3",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80",
    query: "ytsearch100:top 100 bài hát V-Pop Zing mp3 hay nhất"
  },
  {
    id: "usuk-100",
    name: "🇺🇸 Top 100 US-UK Hits",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80",
    query: "ytsearch100:top 100 billboard hot 100 music video"
  },
  {
    id: "edm-100",
    name: "🎧 Top 100 EDM & Remix",
    cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80",
    query: "ytsearch100:top 100 ncs edm gaming music"
  },
  {
    id: "lofi-100",
    name: "☕ Top 100 Lofi Chill",
    cover: "https://images.unsplash.com/photo-1493225457124-a1a2a5f5f9af?w=300&q=80",
    query: "ytsearch100:top 100 lofi chill việt nam"
  },
  {
    id: "cpop-100",
    name: "🇨🇳 Top 100 Nhạc Hoa Lời Việt",
    cover: "https://images.unsplash.com/photo-1543362143-41bb6c125fc7?w=300&q=80",
    query: "ytsearch100:top 100 nhạc hoa lời việt tiktok"
  }
];

const outputFile = path.join(__dirname, '..', 'discoverData.json');

async function fetchCategory(category) {
  console.log(`Đang cào dữ liệu: ${category.name}...`);
  return new Promise((resolve) => {
    // Sử dụng --flat-playlist và --js-runtimes node để bắt chính xác dữ liệu từ yt-dlp
    const cmd = `yt-dlp --js-runtimes node --flat-playlist -j "${category.query}"`;
    exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi lấy dữ liệu cho ${category.name}:`, error.message);
        resolve({ ...category, songs: [] });
        return;
      }

      const lines = stdout.trim().split('\n').filter(l => l.trim() !== '');
      const songs = lines.map(line => {
        try {
          const info = JSON.parse(line);
          return {
            title: info.title,
            author: info.uploader || info.channel || 'YouTube',
            id: info.id,
            url: `https://www.youtube.com/watch?v=${info.id}`
          };
        } catch (e) {
          return null;
        }
      }).filter(s => s !== null && s.id);

      console.log(`=> Đã lấy thành công ${songs.length} bài hát cho ${category.name}`);
      resolve({
        id: category.id,
        name: category.name,
        cover: category.cover,
        songs: songs
      });
    });
  });
}

async function run() {
  console.log("Bắt đầu tiến trình lấy 500 bài hát...");
  const results = [];
  for (const cat of categories) {
    const data = await fetchCategory(cat);
    results.push(data);
  }

  console.log("Đang ghi vào discoverData.json...");
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');
  console.log("✅ XONG! Đã thu thập đủ khoảng 500 bài hát.");
}

run();

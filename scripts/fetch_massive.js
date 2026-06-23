import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 10 Playlists Đại diện cho 10 Thể loại
const categories = [
  { name: "Nhạc Trẻ Thịnh Hành", query: "nhạc trẻ thịnh hành hay nhất" },
  { name: "US-UK Top Hits", query: "us uk top hits" },
  { name: "K-Pop Bests", query: "kpop best songs" },
  { name: "Lofi Chill", query: "lofi chill học tập làm việc" },
  { name: "EDM Sôi Động", query: "edm tiktok sôi động" },
  { name: "Acoustic Nhẹ Nhàng", query: "nhạc acoustic cover hay nhất" },
  { name: "Nhạc Xưa / Bolero", query: "nhạc bolero nhạc xưa" },
  { name: "Piano/Guitar Không Lời", query: "nhạc không lời piano guitar" },
  { name: "Nhạc TikTok Trending", query: "nhạc tiktok trending" },
  { name: "Rap Việt", query: "rap việt hay nhất" }
];

const outputFile = path.join(__dirname, '..', 'discoverData.json');
let allData = [];

// Fallback cover if extraction fails
const defaultCover = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&q=80";

function fetchPlaylist(category) {
  return new Promise((resolve) => {
    console.log(`[Đang tải] ${category.name}...`);
    // flat-playlist to only get metadata fast
    const cmd = `yt-dlp --js-runtimes node -J "ytsearch50:${category.query}"`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Lỗi] ${category.name}: ${error.message}`);
        return resolve();
      }
      
      try {
        const data = JSON.parse(stdout);
        const entries = data.entries || [];
        if (entries.length === 0) return resolve();
        
        let coverUrl = defaultCover;
        // Find first valid thumbnail for album cover
        for (const entry of entries) {
          if (entry.thumbnails && entry.thumbnails.length > 0) {
            coverUrl = entry.thumbnails[entry.thumbnails.length - 1].url;
            break;
          }
        }
        
        const songs = entries.map(e => ({
          id: e.id,
          title: e.title,
          author: e.uploader || e.channel || "YouTube",
          url: `https://www.youtube.com/watch?v=${e.id}`
        })).filter(s => s.id && s.title && s.title !== '[Deleted video]' && s.title !== '[Private video]');
        
        if (songs.length > 0) {
          allData.push({
            id: "album-" + Date.now() + Math.floor(Math.random() * 1000),
            name: category.name,
            cover: coverUrl,
            songs: songs
          });
          console.log(`[Thành công] ${category.name} - ${songs.length} bài hát`);
        }
      } catch (e) {
        console.error(`[Lỗi Parse JSON] ${category.name}:`, e);
      }
      
      resolve();
    });
  });
}

async function run() {
  for (const cat of categories) {
    await fetchPlaylist(cat);
  }
  
  fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2), 'utf8');
  console.log(`\n🎉 Hoàn thành cào dữ liệu! Đã lưu tổng cộng ${allData.length} danh mục vào discoverData.json`);
}

run();

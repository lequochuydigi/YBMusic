// Script patch covers cho discoverData.json
// Thay thế cover bằng ảnh Unsplash đẹp đúng thể loại, không cần cào lại
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COVERS = {
  "Nhạc Trẻ Thịnh Hành":   "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&q=80",
  "US-UK Top Hits":          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80",
  "K-Pop Bests":             "https://images.unsplash.com/photo-1621274280090-a85dd7b6a33d?w=500&q=80",
  "Lofi Chill":              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&q=80",
  "EDM Sôi Động":            "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=500&q=80",
  "Acoustic Nhẹ Nhàng":     "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=500&q=80",
  "Nhạc Xưa / Bolero":      "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=500&q=80",
  "Piano/Guitar Không Lời": "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=500&q=80",
  "Nhạc TikTok Trending":   "https://images.unsplash.com/photo-1516280906849-e5d8f0b2e56c?w=500&q=80",
  "Rap Việt":                "https://images.unsplash.com/photo-1571609239621-3428b8fd1720?w=500&q=80",
};

const filePath = path.join(__dirname, '..', 'discoverData.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let patched = 0;
data.forEach(album => {
  if (COVERS[album.name]) {
    album.cover = COVERS[album.name];
    patched++;
    console.log(`[OK] ${album.name}`);
  } else {
    // Fallback: dùng ảnh thumbnail của bài đầu tiên nếu có
    if (album.songs && album.songs.length > 0) {
      album.cover = `https://img.youtube.com/vi/${album.songs[0].id}/hqdefault.jpg`;
    }
    console.log(`[Fallback] ${album.name}`);
    patched++;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log(`\n✅ Đã patch ${patched}/${data.length} covers cho discoverData.json`);

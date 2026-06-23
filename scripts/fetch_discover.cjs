const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const categories = [
  {
    id: "trending",
    name: "📈 Top Trending & TikTok",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80",
    query: "ytsearch50:nhạc trẻ remix tiktok lofi"
  },
  {
    id: "vpop",
    name: "🇻🇳 V-Pop Lofi Chill",
    cover: "https://images.unsplash.com/photo-1493225457124-a1a2a5f5f9af?w=300&q=80",
    query: "ytsearch50:nhạc trẻ lofi chill nhẹ nhàng"
  },
  {
    id: "usuk",
    name: "🇺🇸 US-UK Hits Lyrics",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80",
    query: "ytsearch50:top us uk hits lyrics"
  },
  {
    id: "cpop",
    name: "🇨🇳 Nhạc Hoa Lời Việt",
    cover: "https://images.unsplash.com/photo-1543362143-41bb6c125fc7?w=300&q=80",
    query: "ytsearch50:nhạc hoa lời việt lofi"
  }
];

function fetchSongs(query) {
  console.log(`Đang quét dữ liệu cho: ${query}...`);
  try {
    const stdout = execSync(`npx yt-dlp -j --flat-playlist "${query}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const lines = stdout.trim().split('\n');
    const songs = [];
    
    for (const line of lines) {
      if (!line) continue;
      try {
        const item = JSON.parse(line);
        // Lọc bỏ các video livestream hoặc thời lượng quá dài (> 10 tiếng)
        if (item.duration && item.duration > 36000) continue;
        
        songs.push({
          title: item.title,
          author: item.uploader || "YouTube",
          id: item.id,
          url: `https://youtube.com/watch?v=${item.id}`
        });
      } catch (e) {
        console.error("Lỗi parse 1 dòng JSON:", e.message);
      }
    }
    console.log(`=> Đã cào được ${songs.length} bài hát.`);
    return songs;
  } catch (error) {
    console.error("Lỗi khi chạy yt-dlp:", error.message);
    return [];
  }
}

const discoverData = [];

for (const cat of categories) {
  const songs = fetchSongs(cat.query);
  discoverData.push({
    id: cat.id,
    name: cat.name,
    cover: cat.cover,
    songs: songs
  });
}

const outPath = path.join(__dirname, '..', 'discoverData.json');
fs.writeFileSync(outPath, JSON.stringify(discoverData, null, 2));
console.log(`\nHoàn tất! Dữ liệu đã được lưu vào ${outPath}`);

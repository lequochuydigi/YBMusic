import fs from 'fs';
import ytSearch from 'yt-search';

const artistNames = [
  "Sơn Tùng M-TP",
  "Đen Vâu",
  "JustaTee",
  "MCK",
  "tlinh",
  "HIEUTHUHAI",
  "B Ray",
  "Vũ.",
  "Hoàng Dũng",
  "AMEE",
  "Bích Phương",
  "Binz",
  "Wren Evans",
  "Mono",
  "Tóc Tiên",
  "Min"
];

async function updateArtists() {
  console.log('Fetching artist data...');
  const artists = [];
  
  for (const name of artistNames) {
    console.log(`Searching for ${name}...`);
    try {
      const r = await ytSearch(name);
      const channel = r.channels && r.channels.length > 0 ? r.channels[0] : null;
      
      if (channel) {
        artists.push({
          name: name,
          id: channel.url.split('/channel/')[1] || channel.url.split('/c/')[1] || channel.url.split('/@')[1] || channel.url,
          thumbnail: channel.image
        });
        console.log(`Found: ${name} - ${channel.image}`);
      } else {
        console.log(`Could not find channel for ${name}`);
      }
    } catch (e) {
      console.log(`Error searching ${name}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  const discoverPath = './discoverData.json';
  const data = JSON.parse(fs.readFileSync(discoverPath, 'utf8'));
  data.artists = artists;
  fs.writeFileSync(discoverPath, JSON.stringify(data, null, 2));
  console.log('Successfully updated discoverData.json with new artists!');
}

updateArtists();

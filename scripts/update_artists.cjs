const fs = require('fs');
const play = require('play-dl');

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
      const results = await play.search(name, { source : { youtube : "channel" }, limit: 1 });
      const channel = results.length > 0 ? results[0] : null;
      
      if (channel) {
        artists.push({
          name: name,
          id: channel.id,
          thumbnail: channel.icons && channel.icons.length > 0 ? channel.icons[0].url : ''
        });
        console.log(`Found: ${name} - ${channel.id}`);
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

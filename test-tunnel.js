import localtunnel from 'localtunnel';

(async () => {
  try {
    const tunnel = await localtunnel({ port: 5173 });
    console.log("Tunnel URL:", tunnel.url);
    tunnel.on('close', () => {
      console.log("Tunnel closed");
    });
    setTimeout(() => tunnel.close(), 5000);
  } catch (e) {
    console.error(e);
  }
})();

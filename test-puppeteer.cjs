const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // Redirect console logs to node
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  page.on('requestfailed', request =>
    console.error('REQUEST FAILED:', request.url(), request.failure().errorText)
  );

  console.log('Navigating to http://127.0.0.1:5173/');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  // Check if splash screen is hidden
  const isSplashHidden = await page.evaluate(() => {
    const splash = document.getElementById('splashScreen');
    return !splash || splash.style.display === 'none';
  });

  console.log('Is splash screen hidden?', isSplashHidden);

  await browser.close();
})();

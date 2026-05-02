const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('response', response => {
    if (response.url().includes('.css')) {
      console.log('CSS RESPONSE:', response.url(), response.status());
    }
  });
  await page.goto('http://localhost:4567/', { waitUntil: 'networkidle0' });
  const navColor = await page.evaluate(() => {
    const nav = document.querySelector('.nav');
    return nav ? window.getComputedStyle(nav).backgroundColor : 'no nav';
  });
  console.log('Nav background color:', navColor);
  await browser.close();
})();

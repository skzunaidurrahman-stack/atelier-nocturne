import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(process.argv[2], { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: process.argv[3], animations: 'disabled', timeout: 120000 });
await browser.close();

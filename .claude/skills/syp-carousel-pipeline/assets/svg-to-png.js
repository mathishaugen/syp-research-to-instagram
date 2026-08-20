// Rasterizes the rendered SVG deck to full-quality PNGs via headless
// Chromium (real font/image rendering, matches the review gallery exactly).
// Requires the globally-installed `playwright` package — run with:
//   NODE_PATH="$(npm root -g)" node svg-to-png.js <svg-dir> <png-out-dir>
//
// No color quantization needed here — drive_upload.py uploads via the real
// Drive REST API (proper multipart HTTP), which handles any file size
// reliably. Quantizing was only ever a workaround for the old, unreliable
// chat-tool-based upload path; don't reintroduce it.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const [, , inDir, outDir] = process.argv;
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs.readdirSync(inDir).filter(f => f.endsWith('.svg')).sort();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  for (const f of files) {
    const svgPath = path.join(inDir, f);
    const url = 'file:///' + svgPath.replace(/\\/g, '/');
    await page.goto(url);
    const outPath = path.join(outDir, f.replace(/\.svg$/, '.png'));
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    console.log('Wrote', outPath);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

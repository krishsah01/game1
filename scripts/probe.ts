/**
 * Quick headless smoke probe: loads the app, waits for a scenario, reports
 * console errors and whether WebGL rendering is active.
 *   BASE_URL=http://127.0.0.1:5173 npx tsx scripts/probe.ts
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined, // e.g. /opt/pw-browsers/chromium when the bundled build is absent
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  const logs: string[] = [];
  page.on('console', (m) => {
    const text = `[${m.type()}] ${m.text()}`;
    logs.push(text);
    if (m.type() === 'error') errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.scenario.on', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.scene-canvas') as HTMLCanvasElement | null;
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    return {
      canvas: !!canvas,
      size: canvas ? [canvas.width, canvas.height] : null,
      webgl: !!gl,
      renderer: gl ? (gl.getParameter(gl.RENDERER) as string) : null,
      chip: document.querySelector('.chip')?.textContent,
      scenario: document.querySelector('.scenario.on')?.textContent,
      labels: Array.from(document.querySelectorAll('.wlabel')).map((e) => e.textContent),
      hud: document.querySelector('.hud.top-left')?.textContent,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: 'docs/screenshots/probe.png' });
  console.log('console errors:', errors.length);
  for (const e of errors) console.log('  ', e);
  console.log('last logs:', logs.slice(-8).join('\n  '));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

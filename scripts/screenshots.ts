/**
 * Walks every preset in player and developer view, exercises the key
 * interactions and saves screenshots to docs/screenshots/.
 *
 *   npm run dev            (in another terminal)
 *   npm run screenshots    (BASE_URL defaults to http://127.0.0.1:5173)
 *
 * If the Playwright-bundled Chromium is not installed, point PW_CHROMIUM at a
 * local Chromium/Chrome binary.
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = 'docs/screenshots';

interface Step {
  file: string;
  note: string;
}
const steps: Step[] = [];

async function shot(page: Page, name: string, note: string) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  steps.push({ file, note });
  console.log(`  ${name}: ${note}`);
}

async function selectScenario(page: Page, index: number) {
  await page.locator('.scenario').nth(index).click();
  await page.waitForFunction((i) => document.querySelectorAll('.scenario')[i]?.classList.contains('on'), index);
  await page.waitForTimeout(900);
}

async function setMode(page: Page, dev: boolean) {
  const btn = page.locator('.topbar-controls button').first();
  const text = await btn.textContent();
  const isDev = text?.includes('Developer');
  if (isDev !== dev) {
    await btn.click();
    await page.waitForTimeout(250);
  }
}

async function hoverCanvas(page: Page, fx = 0.72, fy = 0.6) {
  const box = await page.locator('canvas.scene-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(120);
}

async function focusCanvas(page: Page) {
  await page.evaluate(() => (document.querySelector('canvas.scene-canvas') as HTMLCanvasElement).focus());
}

async function inspectorButton(page: Page, label: string) {
  await page.locator('.inspector button', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
  });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.scenario.on', { timeout: 20000 });
  await page.waitForTimeout(800);

  // 1. Hidden battlefield
  await selectScenario(page, 0);
  await hoverCanvas(page);
  await shot(page, '01-hidden-battlefield-player', 'Preset 1 player view: static room readable, nothing dynamic drawn behind the partition.');
  await setMode(page, true);
  await page.waitForTimeout(300);
  await shot(page, '01-hidden-battlefield-dev', 'Preset 1 developer view: magenta wireframe = unobserved truth (patrol + bag), sight rays clipped by the partition, top-view inset.');
  await setMode(page, false);

  // 2. Exposure ladder
  await selectScenario(page, 1);
  await setMode(page, true);
  await hoverCanvas(page, 0.6, 0.62);
  await shot(page, '02a-exposure-hidden', 'Preset 2 hidden: eye and muzzle below the barrier top; all sight rays stop at the barrier.');
  await inspectorButton(page, 'Observe');
  await page.waitForTimeout(500);
  await shot(page, '02b-exposure-observe', 'Observe: eye clears the barrier, target revealed; the amber firing line still ends on concrete.');
  await inspectorButton(page, 'Test firing line');
  await page.waitForTimeout(250);
  await shot(page, '02c-exposure-firing-line-test', 'Test firing line in observe state strikes the barrier (blue tracer), no target hit, no ammo used.');
  await inspectorButton(page, 'Aim over');
  await page.waitForTimeout(500);
  await shot(page, '02d-exposure-aim-over', 'Aim over: both anchors clear the barrier; head and chest exposed.');
  await setMode(page, false);
  await shot(page, '02e-exposure-aim-over-player', 'Same state in player view: observed target gets the restrained marker/outline only.');

  // 3. Camera intel
  await selectScenario(page, 2);
  await hoverCanvas(page);
  await shot(page, '03a-camera-offline', 'Preset 3 camera offline: far room readable but empty.');
  await inspectorButton(page, 'ONLINE');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.chip')).some((c) => c.textContent?.includes('rev 2')));
  await page.waitForTimeout(700);
  await shot(page, '03b-camera-online', 'updateConfig(cameraStatus: ONLINE) → revision 2: CAM 01 reveals the enemy and the bag inside its own unblocked view.');
  await setMode(page, true);
  await shot(page, '03c-camera-online-dev', 'Developer view: camera cone and its clipped sample rays; source tag CAM 01.');
  await setMode(page, false);
  // A slider gesture must commit exactly one debounced updateConfig (revision 2 → 3).
  const slider = page.locator('.inspector input[type=range]').first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.chip')).some((c) => c.textContent?.includes('rev 3')), undefined, { timeout: 5000 });
  await page.waitForTimeout(600);
  const rev = await page.evaluate(() => Array.from(document.querySelectorAll('.chip')).map((c) => c.textContent).find((t) => t?.startsWith('rev')));
  if (rev !== 'rev 3') throw new Error(`slider commit produced ${rev}, expected exactly rev 3`);
  console.log('  slider commit check: one UpdateConfig → rev 3');

  // 4. Lost contact
  await selectScenario(page, 3);
  await hoverCanvas(page);
  await page.waitForTimeout(600);
  await shot(page, '04a-lost-contact-live', 'Preset 4: camera online, enemy observed.');
  await inspectorButton(page, 'JAMMED');
  await page.waitForTimeout(9000);
  await shot(page, '04b-lost-contact-marker', 'Link jammed 9 s ago: enemy gone, hollow LAST SEEN marker stays at the old position.');
  await setMode(page, true);
  await shot(page, '04c-lost-contact-dev', 'Developer truth: the hidden enemy has walked away from the marker.');
  await setMode(page, false);

  // 5. Smoke and sound
  await selectScenario(page, 4);
  await hoverCanvas(page, 0.3, 0.6);
  await page.waitForTimeout(500);
  await shot(page, '05a-smoke-off', 'Preset 5: patrol observed by you and CAM 01.');
  await inspectorButton(page, 'Smoke OFF');
  await page.waitForTimeout(1200);
  await page.locator('.inspector .btn-row', { hasText: 'OPFOR B movement' }).locator('button', { hasText: 'SPRINT' }).click();
  await page.waitForTimeout(2200);
  await shot(page, '05b-smoke-on-sound', 'Smoke on: every visual source loses the patrol; amber sound arcs give only rough direction and loudness.');

  // 6. Depth shot: put the pointer on the target's chest so the aim point sits at the target's distance.
  await selectScenario(page, 5);
  await setMode(page, true);
  await page.waitForTimeout(800);
  const aimAtTarget = async () => {
    const pt = await page.evaluate(() => (window as unknown as { __milsimLab: { worldToScreen: (x: number, y: number, z: number) => { x: number; y: number } } }).__milsimLab.worldToScreen(13.6, 1.2, 0));
    const box = await page.locator('canvas.scene-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.move(box.x + pt.x, box.y + pt.y);
    await page.waitForTimeout(150);
  };
  await aimAtTarget();
  await inspectorButton(page, 'FAR');
  await aimAtTarget();
  await page.waitForTimeout(200);
  await inspectorButton(page, 'Fire');
  await page.waitForTimeout(150);
  await shot(page, '06a-depth-shot-jamb', 'Preset 6 selected depth FAR: the shot strikes the door jamb (tracer stops at the partition).');
  await page.waitForTimeout(700);
  await inspectorButton(page, 'MID');
  await aimAtTarget();
  await inspectorButton(page, 'Fire');
  await page.waitForTimeout(150);
  await shot(page, '06b-depth-shot-hit', 'Selected depth MID: same screen aim passes the slot and hits the target.');
  await setMode(page, false);
  await hoverCanvas(page, 0.8, 0.55);
  await shot(page, '06c-depth-shot-reticle', 'Player view: reticle with oscillating depth dot and selected-depth label.');

  // 7. Control point
  await selectScenario(page, 6);
  await focusCanvas(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(1900);
  await page.keyboard.up('d');
  await page.waitForTimeout(1500);
  await hoverCanvas(page, 0.7, 0.6);
  await shot(page, '07a-control-capturing', 'Preset 7: attacker inside CONTROL A, progress advancing.');
  await inspectorButton(page, 'Defender: enter zone');
  await page.waitForTimeout(3200);
  await shot(page, '07b-control-contested', 'Defender entered behind the crate stack: public CONTESTED state, no defender marker.');
  await setMode(page, true);
  await shot(page, '07c-control-contested-dev', 'Developer truth: the defender stands inside the zone, unobserved.');
  await setMode(page, false);

  // API error demo + help
  await page.locator('.inspector details', { hasText: 'API status' }).evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await inspectorButton(page, 'Send invalid config');
  await page.waitForTimeout(500);
  await page.locator('.inspector details', { hasText: 'API status' }).scrollIntoViewIfNeeded();
  await shot(page, '08-api-errors', 'API panel: a deliberately invalid mutation is rejected with BAD_USER_INPUT; earlier operations succeeded with revisions.');
  await focusCanvas(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot(page, '09-help', 'Help overlay (pauses the simulation).');

  await browser.close();
  console.log('\nconsole/page errors:', errors.length);
  for (const e of errors) console.log('  ', e);
  console.log(JSON.stringify(steps, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

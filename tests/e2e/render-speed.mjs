// Measures real render speed and saves sample output. Run with the dev servers up:
//   GPU=1 node tests/e2e/render-speed.mjs
// Env: ROOM, PHOTO_SPP, PANO_SPP, PANO_W. Progress is logged as it goes.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, launch, OUT, sleep } from './cdp.mjs';

const ROOM = process.env.ROOM ?? 'Living & Dining';
const PHOTO_SPP = Number(process.env.PHOTO_SPP ?? 64);
const PANO_SPP = Number(process.env.PANO_SPP ?? 64);
const PANO_W = Number(process.env.PANO_W ?? 2048);
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

const b = await launch(9336);
try {
  await b.viewport(1440, 900);
  await b.goto(BASE + '/');
  log(`renderer: ${await b.evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`)}`);
  await b.waitFor(`!!document.querySelector('.dash')`);
  await b.clickText('Try the sample 3-bedroom layout');
  await b.waitFor(`location.pathname.startsWith('/p/') && document.querySelectorAll('svg.plan polygon[data-kind="room"]').length > 0`, 15000);
  await b.clickText('Walk');
  await b.waitFor(`!!window.__viewer?.built`, 60000);
  await b.evaluate(`window.__viewer.built.ready`);
  await b.clickText(ROOM);
  await sleep(2000);
  await b.shot('speed-live-walk');

  const render = async (label, file, expr) => {
    const t0 = Date.now();
    await b.evaluate(`window.__t0 = performance.now(); window.__marks = []; true`);
    const timer = setInterval(async () => {
      const p = await b.evaluate(`window.__progress ?? 0`).catch(() => null);
      if (p !== null) log(`  ${label}: ${Math.round(p * 100)}% after ${Math.round((Date.now() - t0) / 1000)}s`);
    }, 30000);
    const url = await b.evaluate(expr);
    clearInterval(timer);
    fs.writeFileSync(path.join(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
    log(`${label}: done in ${Math.round((Date.now() - t0) / 1000)}s → ${path.join(OUT, file)}`);
  };

  await render('HD photo', 'speed-hd-photo.jpg', `window.__viewer.renderPhoto({ samples: ${PHOTO_SPP}, onProgress: (p) => (window.__progress = p) })`);
  await render(
    'Real View',
    'speed-real-view.jpg',
    `(async () => { window.__progress = 0; const room = window.__viewer.rooms.find((r) => r.name === ${JSON.stringify(ROOM)}); return (await window.__viewer.renderPanorama(room.id, { samples: ${PANO_SPP}, width: ${PANO_W}, onProgress: (p) => (window.__progress = p) })).dataUrl; })()`,
  );
  const bad = b.problems();
  log(bad.length ? `console problems:\n${bad.slice(0, 8).join('\n')}` : 'no console problems');
} catch (e) {
  log(`FAILED ${e.message}`);
  await b.shot('speed-failure').catch(() => {});
} finally {
  await b.close();
}

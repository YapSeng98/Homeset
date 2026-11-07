// Full agent → buyer journey in a real browser. Dev servers must be running (npm run dev).
//   npm run e2e            (software GPU: slow but works anywhere)
//   GPU=1 npm run e2e      (real GPU: much faster)
// GitHub Pages build: VITE_E2E=1 npm run build:pages, npm run preview:pages, then
//   BASE_URL=http://localhost:4173/Homeset GPU=1 npm run e2e
// Screenshots go to $E2E_OUT. Projects created here are deleted at the end.
import { BASE, launch, OUT, sleep } from './cdp.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const created = new Set();
const projectIdFromUrl = (b) => b.evaluate(`location.pathname.split('/p/')[1]`);
const count = (b, sel) => b.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

const b = await launch(9333);

/** Plan (mm) → screen px, using the live SVG transform. */
const planToScreen = (wx, wy) =>
  b.evaluate(`(() => {
    const svg = document.querySelector('svg.plan');
    const m = svg.querySelector(':scope > g').getAttribute('transform').match(/translate\\(([-\\d.e]+) ([-\\d.e]+)\\) scale\\(([-\\d.e]+)\\)/);
    const r = svg.getBoundingClientRect();
    return [r.left + Number(m[1]) + ${wx} * Number(m[3]), r.top + Number(m[2]) + ${wy} * Number(m[3])];
  })()`);
const mouse = async (x, y) => {
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(80);
};
const key = async (k, code, vk, modifiers = 0) => {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await sleep(120);
};

try {
  await b.viewport(1440, 900);

  // --- Agent draws a room from scratch
  await b.goto(`${BASE}/`);
  await b.waitFor(`!!document.querySelector('.dash')`);
  check('Dashboard loads', true);
  await b.setField('Project name', 'E2E drawn room');
  await b.clickText('Create');
  await b.waitFor(`location.pathname.includes('/p/') && !!document.querySelector('svg.plan')`);
  created.add(await projectIdFromUrl(b));
  await b.clickText('Draw walls from scratch');
  await sleep(300);
  for (const [x, y] of [[0, 0], [5000, 0], [5000, 4000], [0, 4000], [0, 0]]) await mouse(...(await planToScreen(x, y)));
  await sleep(300);
  const label = await b.evaluate(`[...document.querySelectorAll('svg.plan text')].map((t) => t.textContent).join(' | ')`);
  check('Drawing 4 walls closes a room with the correct area', (await count(b, 'svg.plan polygon[data-kind="room"]')) === 1 && label.includes('18.7 m²'), label);

  await b.evaluate(`document.querySelector('button[title="Door"]').click()`);
  const [dx, dy] = await planToScreen(2500, 0);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dx, y: dy });
  await mouse(dx, dy);
  check('Door tool places an opening on a wall', (await count(b, 'svg.plan g[data-kind="opening"]')) === 1);
  await b.shot('01-drawn-room-plan');

  await key('z', 'KeyZ', 90, 4);
  const afterUndo = await count(b, 'svg.plan g[data-kind="opening"]');
  await key('z', 'KeyZ', 90, 4 | 8);
  check('Undo and redo work', afterUndo === 0 && (await count(b, 'svg.plan g[data-kind="opening"]')) === 1);

  await b.clickText('3D');
  await b.waitFor(`!!document.querySelector('.stage-3d canvas')`, 60000);
  await b.waitFor(`document.querySelector('.topbar .small')?.textContent === 'Saved'`, 15000, 'autosave');
  check('3D view renders and autosave reaches Saved', true);

  // --- Sample apartment with real furniture
  await b.goto(`${BASE}/`);
  await b.waitFor(`!!document.querySelector('.dash')`);
  await b.clickText('Try the sample 3-bedroom layout');
  await b.waitFor(`location.pathname.includes('/p/') && document.querySelectorAll('svg.plan polygon[data-kind="room"]').length > 0`, 15000);
  const sampleId = await projectIdFromUrl(b);
  created.add(sampleId);
  await sleep(400);
  const roomNames = await b.evaluate(`[...document.querySelectorAll('svg.plan text[font-weight="600"]')].map((t) => t.textContent)`);
  check('Sample layout detects 9 named rooms', roomNames.length === 9, roomNames.join(', '));
  await b.shot('02-sample-plan');
  await mouse(...(await planToScreen(4000, 6000)));
  await sleep(200);
  check('Selecting a room shows its finishes', await b.evaluate(`document.querySelector('.side')?.textContent.includes('Floor finish')`));
  await key('Escape', 'Escape', 27);

  await b.clickText('3D');
  await b.waitFor(`!!window.__viewer?.built`, 60000);
  await b.evaluate(`window.__viewer.built.ready`);
  const scans = await b.evaluate(`(() => { let n = 0; window.__viewer.built.group.traverse((o) => { if (o.isMesh && o.material.map && o.geometry.userData.shared) n++; }); return n; })()`);
  check('Photoscanned furniture models load with textures', scans > 0, `${scans} textured model meshes`);
  await sleep(1500);
  await b.shot('03-sample-dollhouse');
  await b.clickText('Walk');
  await sleep(2500);
  await b.shot('04-sample-walk');
  // Dragging to look around must redraw while it turns (it once stayed frozen until you walked).
  await b.evaluate(`(() => { const r = window.__viewer.renderer; window.__renders = 0; const render = r.render.bind(r); r.render = (s, c) => { window.__renders++; return render(s, c); }; return true; })()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 450, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600 + i * 12, y: 450, button: 'left', buttons: 1 });
    await sleep(40);
  }
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', clickCount: 1 });
  const dragFrames = await b.evaluate('window.__renders');
  check('Dragging to look around redraws the view', dragFrames >= 5, `${dragFrames} frames during the drag`);

  // --- HD photo and Real View (low settings: this checks the pipeline, not image quality)
  const photo = await b.evaluate(`window.__viewer.renderPhoto({ samples: 2 })`);
  check('HD photo renders a JPEG', photo.startsWith('data:image/jpeg'), `${Math.round(photo.length / 1024)} KB`);
  await sleep(500);
  await b.shot('05-after-photo');

  await b.clickText('360° Real View');
  await b.waitFor(`document.querySelector('.modal')?.textContent.includes('Create Real View')`);
  await b.shot('06-real-view-dialog');
  await b.clickText('Close');
  const panoRooms = ['Living & Dining', 'Kitchen', 'Master Bedroom'];
  const panoCount = await b.evaluate(`(async () => {
    const made = [];
    for (const name of ${JSON.stringify(panoRooms)}) {
      const room = window.__viewer.rooms.find((r) => r.name === name);
      const shot = await window.__viewer.renderPanorama(room.id, { samples: 2, width: 512 });
      const file = new File([await (await fetch(shot.dataUrl)).blob()], 'pano.jpg', { type: 'image/jpeg' });
      const asset = await window.__api.uploadAsset('${sampleId}', file);
      made.push({ roomId: room.id, url: asset.url, position: shot.position, height: shot.height });
    }
    const store = window.__store;
    store.dispatch({ type: 'panorama/setAll', levelId: store.level.id, panoramas: made });
    return made.length;
  })()`);
  check('Real View renders and uploads a panorama per room', panoCount === panoRooms.length);

  // --- Publish through the form
  await b.clickText('Publish tour');
  await b.waitFor(`!!document.querySelector('.modal')`);
  await b.setField('Price', '850000');
  await b.setField('Area / address', 'Mont Kiara, Kuala Lumpur');
  await b.setField('Your name', 'Aisyah Rahman');
  await b.setField('WhatsApp number', '012-345 6789');
  await b.setField('REN / REA / PEA No.', 'REN 12345');
  await b.setField('Agency', 'Demo Realty Sdn Bhd');
  await b.setField('Firm Reg. No.', 'E (1) 1234');
  await b.clickText('Publish');
  await b.waitFor(`!!document.querySelector('.share-link input')`, 15000, 'publish result');
  await b.waitFor(`!!document.querySelector('.qr img')`, 5000, 'QR code');
  const link = await b.evaluate(`document.querySelector('.share-link input').value`);
  check('Publishing gives a share link and QR code', /\/t\/[a-z0-9]{8}$/.test(link), link);
  await b.shot('07-published');
  await b.waitFor(`document.querySelector('.topbar .small')?.textContent === 'Saved'`, 15000, 'editor saved before leaving');

  // --- Buyer on a phone
  await b.viewport(390, 844, true);
  await b.goto(link);
  await b.waitFor(`document.querySelector('.seg button.on')?.textContent === 'Real View 360°'`, 20000, 'Real View default');
  await b.waitFor(`document.querySelector('.tour-rooms button.on')?.textContent === 'Living & Dining'`, 30000, 'living room panorama');
  check('Tour opens in Real View, in the living room', true);
  const agentText = await b.evaluate(`document.querySelector('.agent-card')?.textContent`);
  check('Tour shows the agent with REN and firm numbers', agentText.includes('REN 12345') && agentText.includes('E (1) 1234'));
  const wa = await b.evaluate(`document.querySelector('a.btn-wa')?.href`);
  check('WhatsApp button links to the agent in Malaysian format', wa.startsWith('https://wa.me/60123456789'));

  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    for (const name of await b.evaluate(`[...document.querySelectorAll('.pano-marker')].filter((m) => m.style.display !== 'none').map((m) => m.textContent)`)) seen.add(name);
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await sleep(50);
  }
  check('Looking around shows markers to connected rooms', seen.has('Kitchen') && seen.has('Master Bedroom'), [...seen].join(', '));
  await b.shot('08-tour-real-view');
  for (let i = 0; i < 80 && !(await b.evaluate(`[...document.querySelectorAll('.pano-marker')].some((m) => m.style.display !== 'none')`)); i++) {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await sleep(60);
  }
  const target = await b.evaluate(`(() => { const m = [...document.querySelectorAll('.pano-marker')].find((x) => x.style.display !== 'none'); m.click(); return m.textContent; })()`);
  await b.waitFor(`document.querySelector('.tour-rooms button.on')?.textContent === ${JSON.stringify(target)}`, 20000, `step into ${target}`);
  check('Tapping a marker walks into that room', true, target);
  await sleep(2000);

  await b.clickText('Overview');
  await b.waitFor(`!!window.__viewer?.built && !!document.querySelector('.tour canvas')`, 60000);
  await sleep(2000);
  await b.shot('09-tour-overview');
  await b.clickText('Living & Dining');
  await b.waitFor(`!!window.__viewer?.currentRoom`, 120000, 'room detection in walk mode');
  await sleep(2500);
  await b.shot('10-tour-walk');

  await b.clickText('Enquire');
  await b.setField('Name', 'Tan Wei Ming');
  await b.setField('Phone', '+65 9123 4567');
  const sendDisabled = await b.evaluate(`[...document.querySelectorAll('.modal button')].find((x) => x.textContent === 'Send enquiry').disabled`);
  await b.evaluate(`document.querySelector('.modal input[type=checkbox]').click()`);
  await b.clickText('Send enquiry');
  await b.waitFor(`document.querySelector('.modal-body')?.textContent.includes('Thank you')`, 5000, 'lead sent');
  check('Enquiry needs PDPA consent, then is accepted', sendDisabled === true);
  await b.clickText('Close');
  await b.clickText('Overview');
  await sleep(1500);

  await b.clickText('中文');
  await sleep(200);
  check('Language switch to 中文', await b.evaluate(`document.body.textContent.includes('咨询')`));
  await b.clickText('EN');

  await b.evaluate(`window.dispatchEvent(new Event('pagehide')); true`);
  await sleep(800);
  const insights = await b.evaluate(`window.__api.insights('${sampleId}')`);
  check('Agent sees the view, the lead and time per room', insights.analytics.views >= 1 && insights.leads.length === 1 && insights.analytics.rooms.length >= 1, JSON.stringify(insights.analytics));

  const bad = b.problems();
  check('No console errors or warnings', bad.length === 0, bad.slice(0, 8).join('\n      '));
} catch (err) {
  check('Unexpected failure', false, err.message);
  await b.shot('zz-failure').catch(() => {});
} finally {
  for (const id of created) await b.evaluate(`window.__api.deleteProject('${id}')`, 10000).catch(() => fetch(`${BASE}/api/projects/${id}`, { method: 'DELETE' })).catch(() => {});
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed. Screenshots: ${OUT}`);
  await b.close();
  process.exit(results.every(Boolean) ? 0 : 1);
}

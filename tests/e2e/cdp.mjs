// Minimal headless-Chrome driver over the DevTools protocol (no dependencies).
// GPU=1 uses the machine's real GPU; otherwise a software GPU, which is much slower.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
export const OUT = process.env.E2E_OUT ?? path.join(os.tmpdir(), 'homeset-e2e');
fs.mkdirSync(OUT, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Console noise that is not ours: the path tracer library's own notices, and software-GPU limits. */
const KNOWN_NOISE =
  /WebGLPathTracer: This class has been deprecated|THREE\.Clock: This module has been deprecated|MeshBVH: "maxLeafTris"|iridescenceThicknessRange|"Source" has been renamed|KHR_parallel_shader_compile|GPU stall|favicon|React DevTools/;

export async function launch(port = 9334) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'homeset-chrome-'));
  const gpuFlags = process.env.GPU === '1' ? ['--use-angle=metal', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  // UNCAPPED=1 lifts the 60 fps limit, so frame-rate measurements show real differences.
  if (process.env.UNCAPPED === '1') gpuFlags.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const chrome = spawn(
    CHROME,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, ...gpuFlags, '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank'],
    { stdio: 'ignore' },
  );
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  if (!wsUrl) throw new Error('Chrome did not start');
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let nextId = 0;
  const pending = new Map();
  const problems = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      problems.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    } else if (msg.method === 'Page.javascriptDialogOpening') {
      // A dialog blocks the page; accept it so the run continues, and report it.
      problems.push(`DIALOG (${msg.params.type}) shown: ${msg.params.message || 'leave-page prompt'}`);
      void send('Page.handleJavaScriptDialog', { accept: true });
    }
  };
  let session;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++nextId;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params, sessionId: session }));
    });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  session = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  await send('Page.enable');
  await send('Runtime.enable');

  /** Runs JS in the page. A frozen page fails after `timeout` ms instead of hanging the test. */
  const evaluate = async (expression, timeout = Number(process.env.EVAL_TIMEOUT ?? 180000)) => {
    let timer;
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`page did not respond within ${timeout / 1000}s: ${expression.slice(0, 80)}`)), timeout))),
    ]).finally(() => clearTimeout(timer));
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const waitFor = async (expression, timeout = 10000, label = expression) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expression, Math.max(2000, timeout - (Date.now() - t0))).catch(() => false)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for: ${label}`);
  };
  return {
    send,
    evaluate,
    waitFor,
    /** Console errors and warnings, minus known third-party noise. */
    problems: () => problems.filter((p) => !KNOWN_NOISE.test(p)),
    viewport: (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }),
    goto: async (url) => {
      let timer;
      await Promise.race([
        send('Page.navigate', { url }),
        new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`navigation to ${url} did not respond within 30s`)), 30000))),
      ]).finally(() => clearTimeout(timer));
      await waitFor('document.readyState === "complete"', 30000);
    },
    shot: async (name) => {
      let timer;
      const { data } = await Promise.race([
        send('Page.captureScreenshot', { format: 'png' }),
        new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('screenshot timed out')), 20000))),
      ]).finally(() => clearTimeout(timer));
      fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    },
    clickText: (text) =>
      evaluate(`(() => { const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw new Error('No button: ' + ${JSON.stringify(text)}); el.click(); return true; })()`),
    setField: (label, value) =>
      evaluate(`(() => {
        const l = [...document.querySelectorAll('label.field')].find((x) => x.querySelector('span')?.textContent.trim().startsWith(${JSON.stringify(label)}));
        if (!l) throw new Error('No field: ' + ${JSON.stringify(label)});
        const el = l.querySelector('input,select,textarea');
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true; })()`),
    close: async () => {
      ws.close();
      chrome.kill();
      await sleep(800);
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      } catch {
        /* temp dir; the OS cleans it up */
      }
    },
  };
}

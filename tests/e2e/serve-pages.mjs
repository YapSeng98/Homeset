// Serves apps/web/dist the way GitHub Pages does: under /Homeset/, with 404.html for unknown paths
// (that is how deep links such as /Homeset/t/abc123 reach the app). Build first with `npm run build:pages`.
//   npm run preview:pages   → http://localhost:4173/Homeset/
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/dist');
const PREFIX = '/Homeset/';
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/markdown' };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!url.startsWith(PREFIX)) return res.writeHead(302, { Location: PREFIX }).end();
    let file = path.join(ROOT, url.slice(PREFIX.length));
    if (!file.startsWith(ROOT)) return res.writeHead(400).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const found = fs.existsSync(file);
    if (!found) file = path.join(ROOT, '404.html');
    res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`GitHub Pages preview: http://localhost:${PORT}${PREFIX}`));

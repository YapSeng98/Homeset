// Copies projects from the local server into the GitHub Pages build as showcase projects:
// every visitor's browser starts with them (see seedShowcase in apps/web/src/browserApi.ts).
// With `npm run dev` running:
//   node scripts/export-showcase.mjs prj_3knkhk00yq [more project ids…]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://127.0.0.1:8787';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/public/showcase.json');

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: node scripts/export-showcase.mjs <projectId> [projectId…]');
  process.exit(1);
}

const projects = [];
for (const id of ids) {
  const res = await fetch(`${API}/api/projects/${id}`);
  if (!res.ok) throw new Error(`Project ${id}: ${res.status} ${res.statusText}`);
  const { name, region, thumbnail, model } = await res.json();
  // Floor plan images are private working files, like on publish.
  const levels = model.levels.map(({ underlay: _u, ...l }) => l);
  const images = levels.flatMap((l) => l.panoramas ?? []).filter((p) => !p.url.startsWith('data:'));
  if (images.length) throw new Error(`Project ${id} has Real View images stored on the server; they cannot be exported yet.`);
  projects.push({ id, name, region, thumbnail, model: { ...model, levels } });
  console.log(`${id}  ${name}`);
}
fs.writeFileSync(OUT, JSON.stringify(projects));
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);

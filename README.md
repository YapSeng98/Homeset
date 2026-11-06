# rumah3d

Design-to-sale platform for Malaysia and Singapore. Upload a floor plan, trace it, and get a furnished 3D home. Buyers can walk through it, view photoreal 360° "Real View" rooms, and contact the agent on WhatsApp. Agents first, interior design (ID) firms next, Developer Pro later.

## Run it

Requires Node 24+.

```bash
npm install
npm run dev        # API on :8787, web app on http://localhost:5173
npm test           # unit + API tests
npm run typecheck
GPU=1 npm run e2e  # full agent → buyer journey in headless Chrome (needs `npm run dev` running)
npm run build && npm start   # production: one server on :8787 serves API + web app
```

Data (SQLite database and uploads) lives in `./data/`. Delete that folder to reset.

## What works today

| Area | Features |
|---|---|
| Floor plan | Upload JPG/PNG/WebP, set scale by clicking a known dimension, trace walls with snapping (corners, walls, right angles, alignment), type exact lengths |
| 2D editor | Walls, doors, sliding doors, windows, openings, rooms detected automatically with area in sq ft and m², furniture that snaps against walls, undo/redo, autosave |
| 3D | Dollhouse view and first-person walk (WASD, drag to look, double-click to walk, phone joystick, wall collision) |
| Realism | Photoscanned furniture (Poly Haven, CC0), fabric/wood/stone materials, skirting, curtains, ceiling lights, ambient occlusion, sky |
| HD Photo | Path-traced photoreal still of any view (despeckle + denoise), downloadable JPG for listing portals. About 2.5 min on an Apple M2 |
| Real View 360° | Path-traced panorama per room; buyers step between rooms via doorway markers (Street View style). Standard quality ≈ 90 s per room on an M2. Some grain remains at these settings; cloud GPU rendering is the production path |
| Selling | Publish a tour with REN/REA (MY) or CEA (SG) details, share via link, QR code or WhatsApp, PDPA-consented enquiry form |
| Insights | Views, visitors, leads and time spent per room |
| Languages | English, Bahasa Malaysia, 中文 |

## Structure

```
packages/core       Home Model schema (zod), geometry (wall joins, openings, room detection,
                    line of sight), commands + undo, catalog/plugins, region rules (MY/SG)
packages/viewer3d   Framework-free three.js: house builder, walk controls, HD photo and
                    360° path tracing, Real View panorama player
apps/api            Fastify API: projects, uploads, publishing, leads, analytics (SQLite store)
apps/web            React app: dashboard, editor, public tour page
```

**One model, many views:** the 2D plan, 3D view, walkthrough, photos, Real View and (later) quotations all read the same `HomeModel` JSON. Every edit is a `Command` (see `packages/core/src/commands.ts`), which gives undo/redo now and collaboration/audit later.

## Extending

- **Furniture and materials:** add a plugin with `definePlugin({ catalogItems, materials })` and register it in `apps/web/src/registry.ts`. Real models are `model: { kind: 'gltf', url }` with the item's real size. Code-built models use `registerFurnitureBuilder()` in `@rumah3d/viewer3d`.
- **Country rules:** tax, currency and required agent disclosures are in `packages/core/src/region.ts`.
- **Plans and features:** subscription tiers map to feature flags in `apps/api/src/plans.ts`.
- **Database:** routes depend on the `Store` interface (`apps/api/src/store/types.ts`). Add a `PostgresStore` for production without touching routes.
- **Schema changes:** bump `SCHEMA_VERSION` and add a migration in `packages/core/src/model.ts`.

## Not built yet (next)

1. Real sign-up/login (the prototype runs as one demo agent; see `apps/api/src/auth.ts`)
2. AI floor plan recognition (walls detected automatically from the uploaded image)
3. One-click staging styles (auto-furnish), HDB layout template library
4. 9:16 walkthrough video export for TikTok/Reels
5. WhatsApp/email notifications for new leads
6. Postgres + object storage for production hosting
7. ID Studio: carpentry builders, BOQ quotations; then Developer Pro

Third-party assets: `apps/web/public/catalog/polyhaven/` (CC0, see its README).

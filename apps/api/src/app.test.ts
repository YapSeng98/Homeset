import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { HomeModel } from '@rumah3d/core';
import { buildApp } from './app';
import { loadConfig } from './config';
import { SqliteStore } from './store/sqlite';

let app: FastifyInstance;
let store: SqliteStore;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumah3d-test-'));
  store = new SqliteStore(':memory:');
  app = await buildApp(store, { ...loadConfig({}), dataDir, webDist: path.join(dataDir, 'no-web') });
});

afterAll(async () => {
  await app.close();
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const agent = { name: 'Aisyah Rahman', phone: '+60 12-345 6789', agentRegNo: 'REN 12345', agencyName: 'Demo Realty Sdn Bhd', agencyRegNo: 'E (1) 1234' };
const listing = { title: '3-Bedroom Condo, Mont Kiara', listingType: 'sale' as const, price: 850000, builtUpSqft: 1200 };

describe('agent flow: create → draw → publish → buyer views → lead → insights', () => {
  let projectId = '';
  let slug = '';

  it('creates a project with an empty model', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Mont Kiara A-12-3', region: 'MY' } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    projectId = body.id;
    expect(body.model.levels).toHaveLength(1);
  });

  it('refuses to publish an empty plan', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/publish`, payload: { listing, agent } });
    expect(res.statusCode).toBe(400);
  });

  it('saves a drawn model', async () => {
    const project = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}` })).json();
    const model: HomeModel = project.model;
    const level = model.levels[0]!;
    level.walls = [
      { id: 'w1', a: [0, 0], b: [6000, 0], thickness: 200 },
      { id: 'w2', a: [6000, 0], b: [6000, 4000], thickness: 200 },
      { id: 'w3', a: [6000, 4000], b: [0, 4000], thickness: 200 },
      { id: 'w4', a: [0, 4000], b: [0, 0], thickness: 200 },
    ];
    level.rooms = [{ id: 'r1', name: 'Living', type: 'living', polygon: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]] }];
    level.underlay = { url: '/api/assets/secret', pixelWidth: 100, pixelHeight: 100, mmPerPixel: 10, offset: [0, 0], opacity: 0.5, visible: true };
    level.panoramas = [{ roomId: 'r1', url: '/api/assets/pano1', position: [3000, 2000], height: 1500 }];
    const res = await app.inject({ method: 'PUT', url: `/api/projects/${projectId}`, payload: { model } });
    expect(res.statusCode).toBe(200);
    expect(res.json().model.levels[0].walls).toHaveLength(4);
  });

  it('rejects an invalid model', async () => {
    const res = await app.inject({ method: 'PUT', url: `/api/projects/${projectId}`, payload: { model: { name: 'x' } } });
    expect(res.statusCode).toBe(400);
  });

  it('requires the REN number for Malaysian listings', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/publish`, payload: { listing, agent: { ...agent, agentRegNo: '' } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('REN');
  });

  it('publishes a tour and keeps the slug on republish', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/publish`, payload: { listing, agent } });
    expect(res.statusCode).toBe(200);
    slug = res.json().slug;
    expect(res.json().path).toBe(`/t/${slug}`);
    const again = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/publish`, payload: { listing: { ...listing, price: 830000 }, agent } });
    expect(again.json().slug).toBe(slug);
  });

  it('serves the public tour without private floor plan images', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/public/tours/${slug}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.listing.price).toBe(830000);
    expect(body.agent.agentRegNo).toBe('REN 12345');
    expect(body.model.levels[0].underlay).toBeUndefined();
    expect(body.model.levels[0].panoramas).toEqual([{ roomId: 'r1', url: '/api/assets/pano1', position: [3000, 2000], height: 1500 }]);
    expect(body.watermark).toBe(false);
  });

  it('requires PDPA consent for leads', async () => {
    const lead = { name: 'Tan Wei Ming', phone: '+65 9123 4567', message: 'Is it still available?' };
    const denied = await app.inject({ method: 'POST', url: `/api/public/tours/${slug}/leads`, payload: lead });
    expect(denied.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: `/api/public/tours/${slug}/leads`, payload: { ...lead, consent: true } });
    expect(ok.statusCode).toBe(201);
  });

  it('records analytics sent by sendBeacon (text/plain)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/tours/${slug}/events`,
      headers: { 'content-type': 'text/plain' },
      payload: JSON.stringify({ session: 'sess_abc123', events: [{ type: 'view' }, { type: 'room', roomId: 'r1', seconds: 42 }] }),
    });
    expect(res.statusCode).toBe(204);
  });

  it('shows the agent their leads and analytics', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/insights` });
    const body = res.json();
    expect(body.leads).toHaveLength(1);
    expect(body.leads[0].name).toBe('Tan Wei Ming');
    expect(body.analytics).toEqual({ views: 1, sessions: 1, leads: 1, rooms: [{ roomId: 'r1', seconds: 42 }] });
  });

  it('uploads a floor plan image and serves it back', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const boundary = '----rumah3d';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="plan.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/assets`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const file = await app.inject({ method: 'GET', url: res.json().url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.rawPayload.equals(png)).toBe(true);
  });

  it('rejects non-image uploads', async () => {
    const boundary = '----rumah3d';
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.exe"\r\nContent-Type: application/octet-stream\r\n\r\nMZ\r\n--${boundary}--\r\n`);
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assets`, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    expect(res.statusCode).toBe(415);
  });
});

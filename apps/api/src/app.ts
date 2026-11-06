import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { createEmptyModel, createId, HomeModelSchema, randomString, REGIONS, RegionSchema } from '@rumah3d/core';
import type { Config } from './config';
import { createAuthenticate } from './auth';
import { PLANS } from './plans';
import type { Store } from './store/types';

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const ListingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  listingType: z.enum(['sale', 'rent']),
  price: z.number().positive().optional(),
  builtUpSqft: z.number().positive().optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
  tenure: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

const AgentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[0-9 -]{8,16}$/, 'Phone number looks wrong'),
  agentRegNo: z.string().trim().max(30),
  agencyName: z.string().trim().max(120),
  agencyRegNo: z.string().trim().max(40),
});

const LeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[0-9 -]{8,16}$/, 'Phone number looks wrong'),
  email: z.email().optional().or(z.literal('')),
  message: z.string().max(1000).optional(),
  /** PDPA (MY/SG): explicit consent to be contacted. */
  consent: z.literal(true),
});

const EventsSchema = z.object({
  session: z.string().min(6).max(64),
  events: z
    .array(z.object({ type: z.enum(['view', 'room']), roomId: z.string().max(64).optional(), seconds: z.number().min(0).max(3600).optional() }))
    .max(200),
});

export async function buildApp(store: Store, config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 5 * 1024 * 1024 });
  const uploadDir = path.join(config.dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  // sendBeacon posts analytics as text/plain.
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(String(body)));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  const authenticate = createAuthenticate(store);
  const badRequest = (issues: z.ZodError) => ({ error: 'Invalid input', issues: issues.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });

  // ---------- Private API (agent / designer) ----------
  await app.register(async (api) => {
    api.addHook('preHandler', authenticate);

    api.get('/api/me', async (req) => ({ user: req.auth.user, org: req.auth.org, features: PLANS[req.auth.org.plan] }));

    api.get('/api/projects', async (req) => store.listProjects(req.auth.org.id));

    api.post('/api/projects', async (req, reply) => {
      const body = z.object({ name: z.string().trim().min(1).max(120), region: RegionSchema }).safeParse(req.body);
      if (!body.success) return reply.code(400).send(badRequest(body.error));
      const model = createEmptyModel(body.data.name, body.data.region);
      const project = await store.createProject({ orgId: req.auth.org.id, ...body.data, model });
      return reply.code(201).send(project);
    });

    api.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
      const project = await store.getProject(req.auth.org.id, req.params.id);
      return project ?? reply.code(404).send({ error: 'Project not found' });
    });

    api.put<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
      const body = z
        .object({ name: z.string().trim().min(1).max(120).optional(), model: HomeModelSchema.optional(), thumbnail: z.string().startsWith('data:image/').max(400_000).optional() })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send(badRequest(body.error));
      const project = await store.updateProject(req.auth.org.id, req.params.id, body.data);
      return project ?? reply.code(404).send({ error: 'Project not found' });
    });

    api.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
      const ok = await store.deleteProject(req.auth.org.id, req.params.id);
      return ok ? reply.code(204).send() : reply.code(404).send({ error: 'Project not found' });
    });

    // Floor plan upload (images now; PDF/DXF conversion is a later step).
    api.post<{ Params: { id: string } }>('/api/projects/:id/assets', async (req, reply) => {
      const project = await store.getProject(req.auth.org.id, req.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });
      const ext = IMAGE_TYPES[file.mimetype];
      if (!ext) {
        file.file.resume(); // drain so the request completes
        return reply.code(415).send({ error: 'Please upload a PNG, JPG or WebP image' });
      }
      const id = createId('ast');
      const filePath = path.join(uploadDir, `${id}.${ext}`);
      await pipeline(file.file, fs.createWriteStream(filePath));
      if (file.file.truncated) {
        fs.rmSync(filePath, { force: true });
        return reply.code(413).send({ error: 'File is too large' });
      }
      const size = fs.statSync(filePath).size;
      await store.createAsset({ id, orgId: req.auth.org.id, projectId: project.id, filename: file.filename, mime: file.mimetype, size, path: filePath });
      return reply.code(201).send({ id, url: `/api/assets/${id}` });
    });

    api.post<{ Params: { id: string } }>('/api/projects/:id/publish', async (req, reply) => {
      const project = await store.getProject(req.auth.org.id, req.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      const body = z.object({ listing: ListingSchema, agent: AgentSchema }).safeParse(req.body);
      if (!body.success) return reply.code(400).send(badRequest(body.error));

      // Registration numbers required by the country's rules (REN/REA in MY, CEA in SG).
      const missing = REGIONS[project.region].agentDisclosure.filter(
        (f) => f.required && !String((body.data.agent as Record<string, unknown>)[f.key] ?? '').trim(),
      );
      if (missing.length) {
        return reply.code(400).send({ error: `Required for ${REGIONS[project.region].name}: ${missing.map((f) => f.label).join(', ')}` });
      }
      if (project.model.levels.every((l) => l.walls.length === 0)) {
        return reply.code(400).send({ error: 'Draw the floor plan before publishing' });
      }

      const existing = await store.getTourByProject(project.id);
      const plan = PLANS[req.auth.org.plan];
      if (!existing && (await store.countTours(req.auth.org.id)) >= plan.maxActiveTours) {
        return reply.code(402).send({ error: 'Tour limit reached for your plan. Upgrade to publish more tours.' });
      }
      // Underlay images are private working files; never publish them.
      const publicModel = { ...project.model, levels: project.model.levels.map(({ underlay: _u, ...l }) => l) };
      const tour = await store.upsertTour({
        slug: existing?.slug ?? randomString(8),
        projectId: project.id,
        orgId: req.auth.org.id,
        region: project.region,
        model: publicModel,
        listing: body.data.listing,
        agent: body.data.agent,
        publishedAt: new Date().toISOString(),
      });
      return { slug: tour.slug, path: `/t/${tour.slug}` };
    });

    api.get<{ Params: { id: string } }>('/api/projects/:id/tour', async (req, reply) => {
      const project = await store.getProject(req.auth.org.id, req.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      const tour = await store.getTourByProject(project.id);
      if (!tour) return { tour: null };
      const { model: _m, ...rest } = tour;
      return { tour: rest };
    });

    api.get<{ Params: { id: string } }>('/api/projects/:id/insights', async (req, reply) => {
      const project = await store.getProject(req.auth.org.id, req.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      const tour = await store.getTourByProject(project.id);
      const leads = await store.listLeads(req.auth.org.id, project.id);
      const analytics = tour && PLANS[req.auth.org.plan].analytics ? await store.tourAnalytics(tour.slug) : null;
      return { leads, analytics };
    });
  });

  // ---------- Assets ----------
  // Asset ids are unguessable; floor plan images are only referenced from private projects.
  app.get<{ Params: { id: string } }>('/api/assets/:id', async (req, reply) => {
    const asset = await store.getAsset(req.params.id);
    if (!asset || !fs.existsSync(asset.path)) return reply.code(404).send({ error: 'Not found' });
    reply.header('Content-Type', asset.mime).header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(fs.createReadStream(asset.path));
  });

  // ---------- Public tour API (buyers) ----------
  app.get<{ Params: { slug: string } }>('/api/public/tours/:slug', async (req, reply) => {
    const tour = await store.getTour(req.params.slug);
    if (!tour) return reply.code(404).send({ error: 'Tour not found' });
    const org = await store.getOrg(tour.orgId);
    return {
      slug: tour.slug,
      region: tour.region,
      model: tour.model,
      listing: tour.listing,
      agent: tour.agent,
      publishedAt: tour.publishedAt,
      watermark: org ? PLANS[org.plan].watermark : true,
    };
  });

  app.post<{ Params: { slug: string } }>('/api/public/tours/:slug/leads', async (req, reply) => {
    const tour = await store.getTour(req.params.slug);
    if (!tour) return reply.code(404).send({ error: 'Tour not found' });
    const body = LeadSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(badRequest(body.error));
    const lead = await store.createLead({
      id: createId('lead'),
      tourSlug: tour.slug,
      projectId: tour.projectId,
      orgId: tour.orgId,
      name: body.data.name,
      phone: body.data.phone,
      email: body.data.email || null,
      message: body.data.message || null,
    });
    // Next: notify the agent on WhatsApp / email (webhook queue).
    return reply.code(201).send({ id: lead.id });
  });

  app.post<{ Params: { slug: string } }>('/api/public/tours/:slug/events', async (req, reply) => {
    const tour = await store.getTour(req.params.slug);
    if (!tour) return reply.code(404).send({ error: 'Tour not found' });
    const body = EventsSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(badRequest(body.error));
    await store.addTourEvents(tour.slug, body.data.session, body.data.events);
    return reply.code(204).send();
  });

  // ---------- Web app (production) ----------
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}

import {
  AgentSchema,
  createEmptyModel,
  createId,
  HomeModelSchema,
  LeadSchema,
  ListingSchema,
  migrateModel,
  publicModel,
  publishBlocker,
  randomString,
  TourEventsSchema,
  type HomeModel,
  type Region,
} from '@homeset/core';
import { ApiError, type AgentProfile, type Api, type Listing, type Project } from './api';

/**
 * The same API as the server, kept in IndexedDB so the app runs as a static site.
 * Everything stays in this browser: a published tour opens only on this device.
 */

interface ProjectRow {
  id: string;
  name: string;
  region: Region;
  model: HomeModel;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}
interface TourRow {
  slug: string;
  projectId: string;
  region: Region;
  model: HomeModel;
  listing: Listing;
  agent: AgentProfile;
  views: number;
  publishedAt: string;
}
interface LeadRow {
  id: string;
  tourSlug: string;
  projectId: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  createdAt: string;
}
interface EventRow {
  slug: string;
  session: string;
  type: 'view' | 'room';
  roomId?: string;
  seconds?: number;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

let opened: Promise<IDBDatabase> | undefined;
const db = (): Promise<IDBDatabase> => (opened ??= openDb());

async function openDb(): Promise<IDBDatabase> {
  let fresh = false;
  const d = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('homeset', 1);
    req.onupgradeneeded = (e) => {
      fresh = e.oldVersion === 0;
      const idb = req.result;
      idb.createObjectStore('projects', { keyPath: 'id' });
      idb.createObjectStore('tours', { keyPath: 'slug' }).createIndex('projectId', 'projectId', { unique: true });
      idb.createObjectStore('leads', { keyPath: 'id' }).createIndex('projectId', 'projectId');
      idb.createObjectStore('events', { autoIncrement: true }).createIndex('slug', 'slug');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (fresh) await seedShowcase(d);
  return d;
}

/** A browser's first visit starts with the showcase projects in public/showcase.json (made by scripts/export-showcase.mjs). */
async function seedShowcase(d: IDBDatabase): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}showcase.json`);
    if (!res.ok) return;
    const projects = (await res.json()) as Omit<ProjectRow, 'createdAt' | 'updatedAt'>[];
    const now = new Date().toISOString();
    const tx = d.transaction('projects', 'readwrite');
    for (const p of projects) tx.objectStore('projects').put({ ...p, model: migrateModel(p.model), createdAt: now, updatedAt: now } satisfies ProjectRow);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* the app works without the showcase */
  }
}

type StoreName = 'projects' | 'tours' | 'leads' | 'events';

/** Runs one request in its own transaction and resolves once the transaction has committed. */
async function run<T>(name: StoreName, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(name, mode);
  const req = fn(tx.objectStore(name));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
  });
}

const getProjectRow = (id: string) => run<ProjectRow | undefined>('projects', 'readonly', (s) => s.get(id));
const tourOf = (projectId: string) => run<TourRow | undefined>('tours', 'readonly', (s) => s.index('projectId').get(projectId));

async function requireProject(id: string): Promise<ProjectRow> {
  const row = await getProjectRow(id);
  if (!row) throw new ApiError('Project not found', 404);
  return row;
}

async function requireTour(slug: string): Promise<TourRow> {
  const tour = await run<TourRow | undefined>('tours', 'readonly', (s) => s.get(slug));
  if (!tour) throw new ApiError('Tour not found', 404);
  return tour;
}

/** Same message shape as the server's 400 responses. */
function invalid(issues: { path: PropertyKey[]; message: string }[]): ApiError {
  return new ApiError(`Invalid input: ${issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, 400);
}

async function toProject(row: ProjectRow): Promise<Project> {
  const tour = await tourOf(row.id);
  return { id: row.id, name: row.name, region: row.region, thumbnail: row.thumbnail, updatedAt: row.updatedAt, tourSlug: tour?.slug ?? null, model: migrateModel(row.model) };
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const browserApi: Api = {
  listProjects: async () => {
    const [rows, tours] = await Promise.all([run<ProjectRow[]>('projects', 'readonly', (s) => s.getAll()), run<TourRow[]>('tours', 'readonly', (s) => s.getAll())]);
    const slugs = new Map(tours.map((t) => [t.projectId, t.slug]));
    return rows
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => ({ id: r.id, name: r.name, region: r.region, thumbnail: r.thumbnail, updatedAt: r.updatedAt, tourSlug: slugs.get(r.id) ?? null }));
  },

  createProject: async (name, region) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) throw invalid([{ path: ['name'], message: 'Enter a project name (up to 120 characters)' }]);
    const now = new Date().toISOString();
    const row: ProjectRow = { id: createId('prj'), name: trimmed, region, model: createEmptyModel(trimmed, region), thumbnail: null, createdAt: now, updatedAt: now };
    await run('projects', 'readwrite', (s) => s.put(row));
    return toProject(row);
  },

  getProject: async (id) => toProject(await requireProject(id)),

  saveProject: async (id, patch) => {
    const existing = await requireProject(id);
    let model = existing.model;
    if (patch.model) {
      const parsed = HomeModelSchema.safeParse(patch.model);
      if (!parsed.success) throw invalid(parsed.error.issues);
      model = parsed.data;
    }
    const name = patch.name?.trim() || model.name || existing.name;
    const row: ProjectRow = { ...existing, name, region: model.region, model: { ...model, name }, thumbnail: patch.thumbnail ?? existing.thumbnail, updatedAt: new Date().toISOString() };
    await run('projects', 'readwrite', (s) => s.put(row));
    return toProject(row);
  },

  deleteProject: async (id) => {
    await requireProject(id);
    const tour = await tourOf(id);
    await run('projects', 'readwrite', (s) => s.delete(id));
    if (tour) await run('tours', 'readwrite', (s) => s.delete(tour.slug));
  },

  // Images are kept inside the project as data URLs, so they survive reloads without a file server.
  uploadAsset: async (projectId, file) => {
    await requireProject(projectId);
    if (!IMAGE_TYPES.includes(file.type)) throw new ApiError('Please upload a PNG, JPG or WebP image', 415);
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('File is too large', 413);
    return { id: createId('ast'), url: await readAsDataUrl(file) };
  },

  publish: async (projectId, listing, agent) => {
    const project = await requireProject(projectId);
    const parsedListing = ListingSchema.safeParse(listing);
    if (!parsedListing.success) throw invalid(parsedListing.error.issues.map((i) => ({ ...i, path: ['listing', ...i.path] })));
    const parsedAgent = AgentSchema.safeParse(agent);
    if (!parsedAgent.success) throw invalid(parsedAgent.error.issues.map((i) => ({ ...i, path: ['agent', ...i.path] })));
    const blocker = publishBlocker(project.region, project.model, parsedAgent.data);
    if (blocker) throw new ApiError(blocker, 400);

    const existing = await tourOf(projectId);
    const tour: TourRow = {
      slug: existing?.slug ?? randomString(8),
      projectId,
      region: project.region,
      model: publicModel(project.model),
      listing: parsedListing.data,
      agent: parsedAgent.data,
      views: existing?.views ?? 0,
      publishedAt: new Date().toISOString(),
    };
    await run('tours', 'readwrite', (s) => s.put(tour));
    return { slug: tour.slug, path: `/t/${tour.slug}` };
  },

  getTourInfo: async (projectId) => {
    await requireProject(projectId);
    const tour = await tourOf(projectId);
    if (!tour) return { tour: null };
    const { model: _m, ...rest } = tour;
    return { tour: rest };
  },

  insights: async (projectId) => {
    await requireProject(projectId);
    const tour = await tourOf(projectId);
    const leads = (await run<LeadRow[]>('leads', 'readonly', (s) => s.index('projectId').getAll(projectId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!tour) return { leads, analytics: null };
    const events = await run<EventRow[]>('events', 'readonly', (s) => s.index('slug').getAll(tour.slug));
    const seconds = new Map<string, number>();
    for (const e of events) if (e.type === 'room' && e.roomId) seconds.set(e.roomId, (seconds.get(e.roomId) ?? 0) + (e.seconds ?? 0));
    return {
      leads,
      analytics: {
        views: tour.views,
        sessions: new Set(events.map((e) => e.session)).size,
        leads: leads.filter((l) => l.tourSlug === tour.slug).length,
        rooms: [...seconds].map(([roomId, s]) => ({ roomId, seconds: Math.round(s) })).sort((a, b) => b.seconds - a.seconds),
      },
    };
  },

  publicTour: async (slug) => {
    const tour = await requireTour(slug);
    return { slug: tour.slug, region: tour.region, model: migrateModel(tour.model), listing: tour.listing, agent: tour.agent, publishedAt: tour.publishedAt, watermark: false };
  },

  sendLead: async (slug, lead) => {
    const tour = await requireTour(slug);
    const parsed = LeadSchema.safeParse(lead);
    if (!parsed.success) throw invalid(parsed.error.issues);
    const row: LeadRow = {
      id: createId('lead'),
      tourSlug: tour.slug,
      projectId: tour.projectId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      message: parsed.data.message || null,
      createdAt: new Date().toISOString(),
    };
    await run('leads', 'readwrite', (s) => s.put(row));
    return { id: row.id };
  },

  sendEvents: (slug, session, events) => {
    const parsed = TourEventsSchema.safeParse({ session, events });
    if (!parsed.success) return;
    void (async () => {
      const tour = await requireTour(slug);
      const tx = (await db()).transaction(['tours', 'events'], 'readwrite');
      for (const e of parsed.data.events) tx.objectStore('events').add({ slug, session, ...e } satisfies EventRow);
      const views = parsed.data.events.filter((e) => e.type === 'view').length;
      if (views) tx.objectStore('tours').put({ ...tour, views: tour.views + views });
    })().catch(() => {});
  },
};

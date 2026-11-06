import { DatabaseSync } from 'node:sqlite';
import { createId, migrateModel, type Region } from '@homeset/core';
import type {
  AssetRecord,
  LeadRecord,
  OrgRecord,
  ProjectRecord,
  ProjectSummary,
  Store,
  TourAnalytics,
  TourEvent,
  TourRecord,
  UserRecord,
} from './types';

type Row = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  model_json TEXT NOT NULL,
  thumbnail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_org ON projects(org_id, updated_at);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS tours (
  slug TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL,
  region TEXT NOT NULL,
  model_json TEXT NOT NULL,
  listing_json TEXT NOT NULL,
  agent_json TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tour_slug TEXT NOT NULL,
  project_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS leads_project ON leads(org_id, project_id);
CREATE TABLE IF NOT EXISTS tour_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tour_slug TEXT NOT NULL,
  session TEXT NOT NULL,
  type TEXT NOT NULL,
  room_id TEXT,
  seconds REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS tour_events_slug ON tour_events(tour_slug);
`;

export const DEV_ORG_ID = 'org_dev';
export const DEV_USER_ID = 'usr_dev';

export class SqliteStore implements Store {
  private db: DatabaseSync;

  /** Pass ':memory:' for tests. */
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.seedDev();
  }

  /** A default organisation and user until real sign-up/login lands. */
  private seedDev(): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO organizations (id, name, type, region, plan) VALUES (?, ?, ?, ?, ?)`)
      .run(DEV_ORG_ID, 'Demo Realty', 'agency', 'MY', 'agent_pro');
    this.db
      .prepare(`INSERT OR IGNORE INTO users (id, org_id, name, email, role) VALUES (?, ?, ?, ?, ?)`)
      .run(DEV_USER_ID, DEV_ORG_ID, 'Demo Agent', 'demo@homeset.local', 'owner');
  }

  async getOrg(id: string): Promise<OrgRecord | undefined> {
    const r = this.db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as Row | undefined;
    return r && { id: String(r.id), name: String(r.name), type: r.type as OrgRecord['type'], region: r.region as Region, plan: r.plan as OrgRecord['plan'] };
  }

  async getUser(id: string): Promise<UserRecord | undefined> {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return r && { id: String(r.id), orgId: String(r.org_id), name: String(r.name), email: String(r.email), role: r.role as UserRecord['role'] };
  }

  async listProjects(orgId: string): Promise<ProjectSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.region, p.thumbnail, p.updated_at, t.slug AS tour_slug
         FROM projects p LEFT JOIN tours t ON t.project_id = p.id
         WHERE p.org_id = ? ORDER BY p.updated_at DESC`,
      )
      .all(orgId) as Row[];
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      region: r.region as Region,
      thumbnail: (r.thumbnail as string | null) ?? null,
      updatedAt: String(r.updated_at),
      tourSlug: (r.tour_slug as string | null) ?? null,
    }));
  }

  async getProject(orgId: string, id: string): Promise<ProjectRecord | undefined> {
    const r = this.db
      .prepare(
        `SELECT p.*, t.slug AS tour_slug FROM projects p LEFT JOIN tours t ON t.project_id = p.id
         WHERE p.org_id = ? AND p.id = ?`,
      )
      .get(orgId, id) as Row | undefined;
    return r && this.toProject(r);
  }

  async createProject(input: { orgId: string; name: string; region: Region; model: ProjectRecord['model'] }): Promise<ProjectRecord> {
    const id = createId('prj');
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO projects (id, org_id, name, region, model_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.orgId, input.name, input.region, JSON.stringify(input.model), now, now);
    return (await this.getProject(input.orgId, id))!;
  }

  async updateProject(
    orgId: string,
    id: string,
    patch: { name?: string; model?: ProjectRecord['model']; thumbnail?: string },
  ): Promise<ProjectRecord | undefined> {
    const existing = await this.getProject(orgId, id);
    if (!existing) return undefined;
    const model = patch.model ?? existing.model;
    const name = patch.name ?? model.name ?? existing.name;
    this.db
      .prepare(`UPDATE projects SET name = ?, region = ?, model_json = ?, thumbnail = COALESCE(?, thumbnail), updated_at = ? WHERE org_id = ? AND id = ?`)
      .run(name, model.region, JSON.stringify({ ...model, name }), patch.thumbnail ?? null, new Date().toISOString(), orgId, id);
    return this.getProject(orgId, id);
  }

  async deleteProject(orgId: string, id: string): Promise<boolean> {
    const res = this.db.prepare('DELETE FROM projects WHERE org_id = ? AND id = ?').run(orgId, id);
    if (res.changes > 0) this.db.prepare('DELETE FROM tours WHERE project_id = ?').run(id);
    return res.changes > 0;
  }

  async createAsset(a: AssetRecord): Promise<AssetRecord> {
    this.db
      .prepare(`INSERT INTO assets (id, org_id, project_id, filename, mime, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(a.id, a.orgId, a.projectId, a.filename, a.mime, a.size, a.path);
    return a;
  }

  async getAsset(id: string): Promise<AssetRecord | undefined> {
    const r = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Row | undefined;
    return (
      r && {
        id: String(r.id),
        orgId: String(r.org_id),
        projectId: String(r.project_id),
        filename: String(r.filename),
        mime: String(r.mime),
        size: Number(r.size),
        path: String(r.path),
      }
    );
  }

  async getTour(slug: string): Promise<TourRecord | undefined> {
    const r = this.db.prepare('SELECT * FROM tours WHERE slug = ?').get(slug) as Row | undefined;
    return r && this.toTour(r);
  }

  async getTourByProject(projectId: string): Promise<TourRecord | undefined> {
    const r = this.db.prepare('SELECT * FROM tours WHERE project_id = ?').get(projectId) as Row | undefined;
    return r && this.toTour(r);
  }

  async countTours(orgId: string): Promise<number> {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM tours WHERE org_id = ?').get(orgId) as Row;
    return Number(r.n);
  }

  async upsertTour(t: Omit<TourRecord, 'views'>): Promise<TourRecord> {
    this.db
      .prepare(
        `INSERT INTO tours (slug, project_id, org_id, region, model_json, listing_json, agent_json, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET region = excluded.region, model_json = excluded.model_json,
           listing_json = excluded.listing_json, agent_json = excluded.agent_json, published_at = excluded.published_at`,
      )
      .run(t.slug, t.projectId, t.orgId, t.region, JSON.stringify(t.model), JSON.stringify(t.listing), JSON.stringify(t.agent), t.publishedAt);
    return (await this.getTour(t.slug))!;
  }

  async addTourEvents(slug: string, session: string, events: TourEvent[]): Promise<void> {
    const insert = this.db.prepare('INSERT INTO tour_events (tour_slug, session, type, room_id, seconds) VALUES (?, ?, ?, ?, ?)');
    const views = this.db.prepare('UPDATE tours SET views = views + 1 WHERE slug = ?');
    this.db.exec('BEGIN');
    try {
      for (const e of events) {
        insert.run(slug, session, e.type, e.roomId ?? null, e.seconds ?? null);
        if (e.type === 'view') views.run(slug);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async tourAnalytics(slug: string): Promise<TourAnalytics> {
    const tour = this.db.prepare('SELECT views FROM tours WHERE slug = ?').get(slug) as Row | undefined;
    const sessions = this.db.prepare('SELECT COUNT(DISTINCT session) AS n FROM tour_events WHERE tour_slug = ?').get(slug) as Row;
    const leads = this.db.prepare('SELECT COUNT(*) AS n FROM leads WHERE tour_slug = ?').get(slug) as Row;
    const rooms = this.db
      .prepare(
        `SELECT room_id, SUM(seconds) AS seconds FROM tour_events
         WHERE tour_slug = ? AND type = 'room' AND room_id IS NOT NULL
         GROUP BY room_id ORDER BY seconds DESC`,
      )
      .all(slug) as Row[];
    return {
      views: Number(tour?.views ?? 0),
      sessions: Number(sessions.n),
      leads: Number(leads.n),
      rooms: rooms.map((r) => ({ roomId: String(r.room_id), seconds: Math.round(Number(r.seconds)) })),
    };
  }

  async createLead(l: Omit<LeadRecord, 'createdAt'>): Promise<LeadRecord> {
    this.db
      .prepare(`INSERT INTO leads (id, tour_slug, project_id, org_id, name, phone, email, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(l.id, l.tourSlug, l.projectId, l.orgId, l.name, l.phone, l.email, l.message);
    const r = this.db.prepare('SELECT created_at FROM leads WHERE id = ?').get(l.id) as Row;
    return { ...l, createdAt: String(r.created_at) };
  }

  async listLeads(orgId: string, projectId: string): Promise<LeadRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM leads WHERE org_id = ? AND project_id = ? ORDER BY created_at DESC')
      .all(orgId, projectId) as Row[];
    return rows.map((r) => ({
      id: String(r.id),
      tourSlug: String(r.tour_slug),
      projectId: String(r.project_id),
      orgId: String(r.org_id),
      name: String(r.name),
      phone: String(r.phone),
      email: (r.email as string | null) ?? null,
      message: (r.message as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
  }

  close(): void {
    this.db.close();
  }

  private toProject(r: Row): ProjectRecord {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      region: r.region as Region,
      thumbnail: (r.thumbnail as string | null) ?? null,
      model: migrateModel(JSON.parse(String(r.model_json))),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      tourSlug: (r.tour_slug as string | null) ?? null,
    };
  }

  private toTour(r: Row): TourRecord {
    return {
      slug: String(r.slug),
      projectId: String(r.project_id),
      orgId: String(r.org_id),
      region: r.region as Region,
      model: migrateModel(JSON.parse(String(r.model_json))),
      listing: JSON.parse(String(r.listing_json)),
      agent: JSON.parse(String(r.agent_json)),
      views: Number(r.views),
      publishedAt: String(r.published_at),
    };
  }
}

import type { HomeModel, Region } from '@homeset/core';
import type { OrgType, PlanId } from '../plans';

export interface OrgRecord {
  id: string;
  name: string;
  type: OrgType;
  region: Region;
  plan: PlanId;
}

export interface UserRecord {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'designer' | 'agent';
}

export interface ProjectSummary {
  id: string;
  name: string;
  region: Region;
  thumbnail: string | null;
  updatedAt: string;
  tourSlug: string | null;
}

export interface ProjectRecord extends ProjectSummary {
  orgId: string;
  model: HomeModel;
  createdAt: string;
}

export interface AssetRecord {
  id: string;
  orgId: string;
  projectId: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
}

export interface Listing {
  title: string;
  listingType: 'sale' | 'rent';
  price?: number;
  builtUpSqft?: number;
  bedrooms?: number;
  bathrooms?: number;
  tenure?: string;
  address?: string;
  description?: string;
}

export interface AgentProfile {
  name: string;
  phone: string;
  agentRegNo: string;
  agencyName: string;
  agencyRegNo: string;
}

export interface TourRecord {
  slug: string;
  projectId: string;
  orgId: string;
  region: Region;
  model: HomeModel;
  listing: Listing;
  agent: AgentProfile;
  views: number;
  publishedAt: string;
}

export interface LeadRecord {
  id: string;
  tourSlug: string;
  projectId: string;
  orgId: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  createdAt: string;
}

export interface TourEvent {
  type: 'view' | 'room';
  roomId?: string;
  seconds?: number;
}

export interface TourAnalytics {
  views: number;
  sessions: number;
  leads: number;
  rooms: { roomId: string; seconds: number }[];
}

/**
 * Persistence boundary. The prototype uses SQLite (store/sqlite.ts);
 * a PostgresStore implementing the same interface replaces it for production.
 */
export interface Store {
  getOrg(id: string): Promise<OrgRecord | undefined>;
  getUser(id: string): Promise<UserRecord | undefined>;

  listProjects(orgId: string): Promise<ProjectSummary[]>;
  getProject(orgId: string, id: string): Promise<ProjectRecord | undefined>;
  createProject(input: { orgId: string; name: string; region: Region; model: HomeModel }): Promise<ProjectRecord>;
  updateProject(orgId: string, id: string, patch: { name?: string; model?: HomeModel; thumbnail?: string }): Promise<ProjectRecord | undefined>;
  deleteProject(orgId: string, id: string): Promise<boolean>;

  createAsset(input: Omit<AssetRecord, 'id'> & { id: string }): Promise<AssetRecord>;
  getAsset(id: string): Promise<AssetRecord | undefined>;

  getTour(slug: string): Promise<TourRecord | undefined>;
  getTourByProject(projectId: string): Promise<TourRecord | undefined>;
  countTours(orgId: string): Promise<number>;
  upsertTour(tour: Omit<TourRecord, 'views'>): Promise<TourRecord>;
  addTourEvents(slug: string, session: string, events: TourEvent[]): Promise<void>;
  tourAnalytics(slug: string): Promise<TourAnalytics>;

  createLead(lead: Omit<LeadRecord, 'createdAt'>): Promise<LeadRecord>;
  listLeads(orgId: string, projectId: string): Promise<LeadRecord[]>;

  close(): void;
}

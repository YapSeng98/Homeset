import type { HomeModel, Region } from '@homeset/core';
import { browserApi } from './browserApi';
import { BROWSER_ONLY, TEST_HOOKS } from './env';

export interface ProjectSummary {
  id: string;
  name: string;
  region: Region;
  thumbnail: string | null;
  updatedAt: string;
  tourSlug: string | null;
}

export interface Project extends ProjectSummary {
  model: HomeModel;
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
}

export interface AgentProfile {
  name: string;
  phone: string;
  agentRegNo: string;
  agencyName: string;
  agencyRegNo: string;
}

export interface PublicTour {
  slug: string;
  region: Region;
  model: HomeModel;
  listing: Listing;
  agent: AgentProfile;
  publishedAt: string;
  watermark: boolean;
}

export interface Insights {
  leads: { id: string; name: string; phone: string; email: string | null; message: string | null; createdAt: string }[];
  analytics: { views: number; sessions: number; leads: number; rooms: { roomId: string; seconds: number }[] } | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.issues?.length ? `: ${data.issues.map((i: { path: string; message: string }) => `${i.path} ${i.message}`).join('; ')}` : '';
    throw new ApiError(`${data.error ?? res.statusText}${detail}`, res.status);
  }
  return data as T;
}

const httpApi = {
  listProjects: () => request<ProjectSummary[]>('GET', '/api/projects'),
  createProject: (name: string, region: Region) => request<Project>('POST', '/api/projects', { name, region }),
  getProject: (id: string) => request<Project>('GET', `/api/projects/${id}`),
  saveProject: (id: string, patch: { model?: HomeModel; name?: string; thumbnail?: string }) => request<Project>('PUT', `/api/projects/${id}`, patch),
  deleteProject: (id: string) => request<void>('DELETE', `/api/projects/${id}`),
  uploadAsset: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; url: string }>('POST', `/api/projects/${projectId}/assets`, form);
  },
  publish: (projectId: string, listing: Listing, agent: AgentProfile) =>
    request<{ slug: string; path: string }>('POST', `/api/projects/${projectId}/publish`, { listing, agent }),
  getTourInfo: (projectId: string) =>
    request<{ tour: (Omit<PublicTour, 'model' | 'watermark'> & { views: number }) | null }>('GET', `/api/projects/${projectId}/tour`),
  insights: (projectId: string) => request<Insights>('GET', `/api/projects/${projectId}/insights`),
  publicTour: (slug: string) => request<PublicTour>('GET', `/api/public/tours/${slug}`),
  sendLead: (slug: string, lead: { name: string; phone: string; email?: string; message?: string; consent: true }) =>
    request<{ id: string }>('POST', `/api/public/tours/${slug}/leads`, lead),
  /** Fire-and-forget analytics that survives page close. */
  sendEvents: (slug: string, session: string, events: { type: 'view' | 'room'; roomId?: string; seconds?: number }[]) => {
    const body = JSON.stringify({ session, events });
    const url = `/api/public/tours/${slug}/events`;
    if (!navigator.sendBeacon?.(url, body)) {
      void fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => {});
    }
  },
};

export type Api = typeof httpApi;

export const api: Api = BROWSER_ONLY ? browserApi : httpApi;
if (TEST_HOOKS) (window as unknown as { __api?: Api }).__api = api;

/** Full URL of an in-app path such as `/t/abc123`, including the base path the app is served from. */
export const appUrl = (path: string): string => new URL(path.replace(/^\//, ''), window.location.origin + import.meta.env.BASE_URL).href;

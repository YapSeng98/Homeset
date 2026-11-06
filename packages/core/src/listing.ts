import { z } from 'zod';
import type { HomeModel, Region } from './schema';
import { REGIONS } from './region';

/** Publishing and enquiry rules, shared by the API server and the browser-only build. */

const PhoneSchema = z.string().trim().regex(/^\+?[0-9 -]{8,16}$/, 'Phone number looks wrong');

export const ListingSchema = z.object({
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

export const AgentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: PhoneSchema,
  agentRegNo: z.string().trim().max(30),
  agencyName: z.string().trim().max(120),
  agencyRegNo: z.string().trim().max(40),
});

export const LeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: PhoneSchema,
  email: z.email().optional().or(z.literal('')),
  message: z.string().max(1000).optional(),
  /** PDPA (MY/SG): explicit consent to be contacted. */
  consent: z.literal(true),
});

export const TourEventsSchema = z.object({
  session: z.string().min(6).max(64),
  events: z
    .array(z.object({ type: z.enum(['view', 'room']), roomId: z.string().max(64).optional(), seconds: z.number().min(0).max(3600).optional() }))
    .max(200),
});

/** Why this project cannot be published yet, or null when it can. */
export function publishBlocker(region: Region, model: HomeModel, agent: z.infer<typeof AgentSchema>): string | null {
  // Registration numbers required by the country's rules (REN/REA in MY, CEA in SG).
  const missing = REGIONS[region].agentDisclosure.filter((f) => f.required && !String((agent as Record<string, unknown>)[f.key] ?? '').trim());
  if (missing.length) return `Required for ${REGIONS[region].name}: ${missing.map((f) => f.label).join(', ')}`;
  if (model.levels.every((l) => l.walls.length === 0)) return 'Draw the floor plan before publishing';
  return null;
}

/** Underlay images are private working files; never publish them. */
export const publicModel = (model: HomeModel): HomeModel => ({ ...model, levels: model.levels.map(({ underlay: _u, ...l }) => l) });

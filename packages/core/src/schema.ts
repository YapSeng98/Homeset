import { z } from 'zod';

/**
 * The Home Model: the single source of truth for a property.
 * 2D plan, 3D view, walkthrough, quotation and sales pages are all views of this data.
 *
 * Conventions:
 * - All lengths are millimetres.
 * - Plan coordinates are [x, y] with y pointing "down" the screen; 3D maps plan y to world z.
 * - Bump SCHEMA_VERSION and add a step in migrate.ts whenever the shape changes.
 */
export const SCHEMA_VERSION = 1;

export const Vec2Schema = z.tuple([z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2Schema>;

export const RegionSchema = z.enum(['MY', 'SG']);
export type Region = z.infer<typeof RegionSchema>;

export const WallSchema = z.object({
  id: z.string(),
  a: Vec2Schema,
  b: Vec2Schema,
  thickness: z.number().positive(),
  /** Overrides the level height for this wall (e.g. half-height partition). */
  height: z.number().positive().optional(),
  /** Structural walls cannot be hacked (e.g. HDB structural walls). */
  structural: z.boolean().optional(),
});
export type Wall = z.infer<typeof WallSchema>;

export const OpeningKindSchema = z.enum(['door', 'sliding-door', 'window', 'opening']);
export type OpeningKind = z.infer<typeof OpeningKindSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  kind: OpeningKindSchema,
  /** Distance from wall start (a) to the centre of the opening. */
  offset: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Height of the bottom of the opening above the floor. */
  sill: z.number().min(0),
  /** Door swings to the other side of the wall. */
  flip: z.boolean().optional(),
  /** Door hinge on the other end. */
  mirror: z.boolean().optional(),
});
export type Opening = z.infer<typeof OpeningSchema>;

export const RoomTypeSchema = z.enum([
  'living',
  'dining',
  'kitchen',
  'master',
  'bedroom',
  'bathroom',
  'study',
  'balcony',
  'utility',
  'corridor',
  'other',
]);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: RoomTypeSchema,
  /** Inner (finished) floor polygon. */
  polygon: z.array(Vec2Schema).min(3),
  floorMaterial: z.string().optional(),
  wallMaterial: z.string().optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  position: Vec2Schema,
  /** Height above floor (e.g. wall-mounted TV). */
  elevation: z.number().default(0),
  /** Degrees, clockwise in plan view. */
  rotation: z.number().default(0),
  /** Size overrides; otherwise catalog size is used. */
  width: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  height: z.number().positive().optional(),
  materialId: z.string().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const UnderlaySchema = z.object({
  /** URL of the uploaded floor plan image. */
  url: z.string(),
  /** Image size in pixels. */
  pixelWidth: z.number().positive(),
  pixelHeight: z.number().positive(),
  /** Millimetres per image pixel (set by scale calibration). */
  mmPerPixel: z.number().positive(),
  /** Plan position of the image's top-left corner. */
  offset: Vec2Schema,
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
});
export type Underlay = z.infer<typeof UnderlaySchema>;

/** A photoreal 360° image rendered from a point in a room ("Real View"). */
export const PanoramaSchema = z.object({
  roomId: z.string(),
  url: z.string(),
  /** Plan position of the camera. */
  position: Vec2Schema,
  /** Camera height above the floor. */
  height: z.number().positive(),
});
export type Panorama = z.infer<typeof PanoramaSchema>;

export const LevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Floor elevation relative to ground floor. */
  elevation: z.number(),
  /** Floor-to-ceiling height. */
  height: z.number().positive(),
  defaultWallMaterial: z.string().optional(),
  defaultFloorMaterial: z.string().optional(),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  rooms: z.array(RoomSchema),
  items: z.array(ItemSchema),
  underlay: UnderlaySchema.optional(),
  panoramas: z.array(PanoramaSchema).optional(),
});
export type Level = z.infer<typeof LevelSchema>;

export const HomeModelSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string(),
  region: RegionSchema,
  /** Compass bearing of plan "up" in degrees (0 = north up). Used for sun studies. */
  northBearing: z.number().default(0),
  levels: z.array(LevelSchema).min(1),
});
export type HomeModel = z.infer<typeof HomeModelSchema>;

/** Sensible starting values; tune per region in region.ts. */
export const DEFAULTS = {
  levelHeight: 2800,
  wallThickness: 150,
  door: { width: 900, height: 2100, sill: 0 },
  slidingDoor: { width: 1800, height: 2100, sill: 0 },
  window: { width: 1200, height: 1200, sill: 900 },
  opening: { width: 900, height: 2100, sill: 0 },
} as const;

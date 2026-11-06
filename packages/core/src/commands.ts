import type { HomeModel, Item, Level, Opening, Panorama, Region, Room, Underlay, Vec2, Wall } from './schema';
import { equals } from './geometry/vec';

/**
 * Every change to a Home Model goes through a command.
 * This gives undo/redo now, and an edit log for collaboration and audit later.
 */
export type Command =
  | { type: 'model/rename'; name: string }
  | { type: 'model/setRegion'; region: Region }
  | { type: 'level/update'; levelId: string; patch: Partial<Pick<Level, 'name' | 'height' | 'defaultWallMaterial' | 'defaultFloorMaterial'>> }
  | { type: 'underlay/set'; levelId: string; underlay: Underlay | undefined }
  | { type: 'underlay/update'; levelId: string; patch: Partial<Underlay> }
  | { type: 'wall/add'; levelId: string; wall: Wall }
  | { type: 'wall/update'; levelId: string; id: string; patch: Partial<Omit<Wall, 'id'>> }
  | { type: 'wall/delete'; levelId: string; id: string }
  /** Moves every wall endpoint at `from` to `to`, keeping corners joined. */
  | { type: 'vertex/move'; levelId: string; from: Vec2; to: Vec2 }
  | { type: 'opening/add'; levelId: string; opening: Opening }
  | { type: 'opening/update'; levelId: string; id: string; patch: Partial<Omit<Opening, 'id'>> }
  | { type: 'opening/delete'; levelId: string; id: string }
  | { type: 'room/setAll'; levelId: string; rooms: Room[] }
  | { type: 'room/update'; levelId: string; id: string; patch: Partial<Omit<Room, 'id'>> }
  | { type: 'item/add'; levelId: string; item: Item }
  | { type: 'item/update'; levelId: string; id: string; patch: Partial<Omit<Item, 'id'>> }
  | { type: 'item/delete'; levelId: string; id: string }
  | { type: 'panorama/setAll'; levelId: string; panoramas: Panorama[] }
  | { type: 'batch'; commands: Command[] };

function onLevel(model: HomeModel, levelId: string, fn: (level: Level) => Level): HomeModel {
  return { ...model, levels: model.levels.map((l) => (l.id === levelId ? fn(l) : l)) };
}

const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<NoInfer<T>>): T[] =>
  list.map((x) => (x.id === id ? { ...x, ...patch } : x));

export function applyCommand(model: HomeModel, cmd: Command): HomeModel {
  switch (cmd.type) {
    case 'model/rename':
      return { ...model, name: cmd.name };
    case 'model/setRegion':
      return { ...model, region: cmd.region };
    case 'level/update':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, ...cmd.patch }));
    case 'underlay/set':
      return onLevel(model, cmd.levelId, (l) => {
        const { underlay: _old, ...rest } = l;
        return cmd.underlay ? { ...rest, underlay: cmd.underlay } : rest;
      });
    case 'underlay/update':
      return onLevel(model, cmd.levelId, (l) => (l.underlay ? { ...l, underlay: { ...l.underlay, ...cmd.patch } } : l));
    case 'wall/add':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, walls: [...l.walls, cmd.wall] }));
    case 'wall/update':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, walls: patchById(l.walls, cmd.id, cmd.patch) }));
    case 'wall/delete':
      return onLevel(model, cmd.levelId, (l) => ({
        ...l,
        walls: l.walls.filter((w) => w.id !== cmd.id),
        openings: l.openings.filter((o) => o.wallId !== cmd.id),
      }));
    case 'vertex/move':
      return onLevel(model, cmd.levelId, (l) => ({
        ...l,
        walls: l.walls.map((w) => {
          const a = equals(w.a, cmd.from) ? cmd.to : w.a;
          const b = equals(w.b, cmd.from) ? cmd.to : w.b;
          return a === w.a && b === w.b ? w : { ...w, a, b };
        }),
      }));
    case 'opening/add':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, openings: [...l.openings, cmd.opening] }));
    case 'opening/update':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, openings: patchById(l.openings, cmd.id, cmd.patch) }));
    case 'opening/delete':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, openings: l.openings.filter((o) => o.id !== cmd.id) }));
    case 'room/setAll':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, rooms: cmd.rooms }));
    case 'room/update':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, rooms: patchById(l.rooms, cmd.id, cmd.patch) }));
    case 'item/add':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, items: [...l.items, cmd.item] }));
    case 'item/update':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, items: patchById(l.items, cmd.id, cmd.patch) }));
    case 'item/delete':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== cmd.id) }));
    case 'panorama/setAll':
      return onLevel(model, cmd.levelId, (l) => ({ ...l, panoramas: cmd.panoramas }));
    case 'batch':
      return cmd.commands.reduce(applyCommand, model);
  }
}

export interface DispatchOptions {
  /** Consecutive commands with the same key (e.g. a drag) collapse into one undo step. */
  mergeKey?: string;
}

/** Snapshot-based undo/redo. Models are immutable, so snapshots share structure. */
export class History {
  private past: HomeModel[] = [];
  private future: HomeModel[] = [];
  private lastMergeKey: string | undefined;

  constructor(
    public present: HomeModel,
    private readonly limit = 200,
  ) {}

  dispatch(cmd: Command, opts: DispatchOptions = {}): HomeModel {
    const next = applyCommand(this.present, cmd);
    if (next === this.present) return next;
    if (!opts.mergeKey || opts.mergeKey !== this.lastMergeKey) {
      this.past.push(this.present);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.lastMergeKey = opts.mergeKey;
    this.future = [];
    this.present = next;
    return next;
  }

  /** Ends any running merge (call on pointer-up). */
  seal(): void {
    this.lastMergeKey = undefined;
  }

  undo(): HomeModel {
    const prev = this.past.pop();
    if (prev) {
      this.future.push(this.present);
      this.present = prev;
    }
    this.lastMergeKey = undefined;
    return this.present;
  }

  redo(): HomeModel {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.present);
      this.present = next;
    }
    this.lastMergeKey = undefined;
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

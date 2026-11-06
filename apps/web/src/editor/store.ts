import { useSyncExternalStore } from 'react';
import { applyCommand, History, syncRooms, type Command, type DispatchOptions, type HomeModel, type Level } from '@homeset/core';

export type Tool = 'select' | 'wall' | 'door' | 'sliding-door' | 'window' | 'opening' | 'calibrate';
export type ViewKind = 'plan' | 'orbit' | 'walk';
export type Selection = { kind: 'wall' | 'opening' | 'room' | 'item'; id: string } | null;
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export interface EditorState {
  model: HomeModel;
  levelId: string;
  tool: Tool;
  /** Catalog item being placed. */
  placing: string | null;
  selection: Selection;
  view: ViewKind;
  wallThickness: number;
  canUndo: boolean;
  canRedo: boolean;
  save: SaveState;
  /** Bumped to ask the plan view to zoom to fit. */
  fitRequest: number;
}

const WALL_COMMANDS = new Set<Command['type']>(['wall/add', 'wall/update', 'wall/delete', 'vertex/move']);
const touchesWalls = (cmd: Command): boolean =>
  cmd.type === 'batch' ? cmd.commands.some(touchesWalls) : WALL_COMMANDS.has(cmd.type);

export class EditorStore {
  private state: EditorState;
  private readonly history: History;
  private readonly listeners = new Set<() => void>();

  constructor(model: HomeModel) {
    this.history = new History(model);
    this.state = {
      model,
      levelId: model.levels[0]!.id,
      tool: 'select',
      placing: null,
      selection: null,
      view: 'plan',
      wallThickness: 150,
      canUndo: false,
      canRedo: false,
      save: 'saved',
      fitRequest: 0,
    };
  }

  getState = (): EditorState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get level(): Level {
    return this.state.model.levels.find((l) => l.id === this.state.levelId)!;
  }

  private set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /** Applies a command. Wall edits also re-detect rooms, in the same undo step. */
  dispatch(cmd: Command, opts?: DispatchOptions): void {
    let full = cmd;
    if (touchesWalls(cmd)) {
      const next = applyCommand(this.history.present, cmd);
      const level = next.levels.find((l) => l.id === this.state.levelId)!;
      full = { type: 'batch', commands: [cmd, { type: 'room/setAll', levelId: level.id, rooms: syncRooms(level.rooms, level.walls) }] };
    }
    const model = this.history.dispatch(full, opts);
    this.afterChange(model);
  }

  seal(): void {
    this.history.seal();
  }

  undo(): void {
    this.afterChange(this.history.undo());
  }

  redo(): void {
    this.afterChange(this.history.redo());
  }

  private afterChange(model: HomeModel): void {
    const level = model.levels.find((l) => l.id === this.state.levelId)!;
    const sel = this.state.selection;
    const exists =
      !sel ||
      (sel.kind === 'wall' && level.walls.some((w) => w.id === sel.id)) ||
      (sel.kind === 'opening' && level.openings.some((o) => o.id === sel.id)) ||
      (sel.kind === 'room' && level.rooms.some((r) => r.id === sel.id)) ||
      (sel.kind === 'item' && level.items.some((i) => i.id === sel.id));
    this.set({
      model,
      selection: exists ? sel : null,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      save: model === this.state.model ? this.state.save : 'unsaved',
    });
  }

  setTool(tool: Tool): void {
    this.set({ tool, placing: null, selection: tool === 'select' ? this.state.selection : null });
  }

  setPlacing(catalogId: string | null): void {
    this.set({ placing: catalogId, tool: 'select', selection: null, view: catalogId ? 'plan' : this.state.view });
  }

  select(selection: Selection): void {
    this.set({ selection });
  }

  setView(view: ViewKind): void {
    this.set({ view });
  }

  setSave(save: SaveState): void {
    this.set({ save });
  }

  setWallThickness(wallThickness: number): void {
    this.set({ wallThickness });
  }

  requestFit(): void {
    this.set({ fitRequest: this.state.fitRequest + 1 });
  }

  deleteSelection(): void {
    const sel = this.state.selection;
    if (!sel) return;
    const levelId = this.state.levelId;
    if (sel.kind === 'wall') this.dispatch({ type: 'wall/delete', levelId, id: sel.id });
    else if (sel.kind === 'opening') this.dispatch({ type: 'opening/delete', levelId, id: sel.id });
    else if (sel.kind === 'item') this.dispatch({ type: 'item/delete', levelId, id: sel.id });
  }
}

export function useEditor(store: EditorStore): EditorState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

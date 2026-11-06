import { useEffect, useState } from 'react';
import {
  add,
  area,
  createId,
  dist,
  FLOOR_BY_ROOM_TYPE,
  formatArea,
  formatMoney,
  localize,
  normalize,
  REGIONS,
  RoomTypeSchema,
  scale,
  sub,
  type CatalogCategory,
  type Item,
  type MaterialDef,
  type Opening,
  type OpeningKind,
  type RoomType,
} from '@homeset/core';
import { useI18n, type MessageKey } from '../i18n';
import { registry } from '../registry';
import { useEditor, type EditorStore } from './store';

function NumField({ label, value, onChange, onDone, min = 0, max = 100000, step = 10 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onDone?: () => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => setText(String(Math.round(value))), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        onBlur={() => {
          setText(String(Math.round(value)));
          onDone?.();
        }}
      />
    </label>
  );
}

function Swatches({ materials, value, onPick }: { materials: MaterialDef[]; value?: string; onPick: (id: string) => void }) {
  const { lang } = useI18n();
  return (
    <div className="swatches">
      {materials.map((m) => (
        <button
          key={m.id}
          className={`swatch ${m.id === value ? 'on' : ''}`}
          title={localize(m.name, lang)}
          aria-label={localize(m.name, lang)}
          style={{ background: m.pattern === 'plain' ? m.color : `linear-gradient(135deg, ${m.color} 60%, ${m.accentColor ?? m.color})` }}
          onClick={() => onPick(m.id)}
        />
      ))}
    </div>
  );
}

const CATEGORIES: CatalogCategory[] = ['living', 'dining', 'bedroom', 'study', 'kitchen', 'bathroom', 'decor'];

function Catalog({ store }: { store: EditorStore }) {
  const { t, lang } = useI18n();
  const state = useEditor(store);
  const [cat, setCat] = useState<CatalogCategory>('living');
  const items = registry.itemsByCategory().get(cat) ?? [];
  return (
    <section className="panel">
      <h3>{t('panel.catalog')}</h3>
      <div className="catalog-cats">
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)}>
            {t(`cat.${c}` as MessageKey)}
          </button>
        ))}
      </div>
      <div className="catalog-items">
        {items.map((item) => (
          <button
            key={item.id}
            className={`catalog-item ${state.placing === item.id ? 'on' : ''}`}
            onClick={() => store.setPlacing(state.placing === item.id ? null : item.id)}
          >
            <b>{localize(item.name, lang)}</b>
            <small>
              {item.size.w} × {item.size.d} mm
              {item.tags?.includes('scan') && <span className="scan-tag">{t('catalog.scan')}</span>}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SidePanel({ store, onRemoveUnderlay }: { store: EditorStore; onRemoveUnderlay: () => void }) {
  const state = useEditor(store);
  const { t, lang } = useI18n();
  const level = state.model.levels.find((l) => l.id === state.levelId)!;
  const levelId = level.id;
  const sel = state.selection;
  const seal = () => store.seal();
  const region = REGIONS[state.model.region];

  let props: React.ReactNode = null;

  if (sel?.kind === 'wall') {
    const wall = level.walls.find((w) => w.id === sel.id);
    if (wall) {
      const length = dist(wall.a, wall.b);
      props = (
        <>
          <NumField
            label={t('prop.length')}
            value={length}
            min={100}
            onChange={(v) => {
              const to = add(wall.a, scale(normalize(sub(wall.b, wall.a)), v)).map(Math.round) as [number, number];
              store.dispatch({ type: 'vertex/move', levelId, from: wall.b, to }, { mergeKey: `len:${wall.id}` });
            }}
            onDone={seal}
          />
          <div className="grid2">
            <NumField label={t('prop.thickness')} value={wall.thickness} min={50} max={600} onChange={(v) => store.dispatch({ type: 'wall/update', levelId, id: wall.id, patch: { thickness: v } }, { mergeKey: `th:${wall.id}` })} onDone={seal} />
            <NumField label={t('prop.height')} value={wall.height ?? level.height} min={300} max={6000} onChange={(v) => store.dispatch({ type: 'wall/update', levelId, id: wall.id, patch: { height: v } }, { mergeKey: `h:${wall.id}` })} onDone={seal} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!wall.structural} onChange={(e) => store.dispatch({ type: 'wall/update', levelId, id: wall.id, patch: { structural: e.target.checked } })} />
            {t('prop.structural')}
          </label>
        </>
      );
    }
  } else if (sel?.kind === 'opening') {
    const o = level.openings.find((x) => x.id === sel.id);
    if (o) {
      const patch = (p: Partial<Omit<Opening, 'id'>>, key: string) =>
        store.dispatch({ type: 'opening/update', levelId, id: o.id, patch: p }, { mergeKey: `${key}:${o.id}` });
      props = (
        <>
          <label className="field">
            <span>{t('prop.type')}</span>
            <select className="input" value={o.kind} onChange={(e) => store.dispatch({ type: 'opening/update', levelId, id: o.id, patch: { kind: e.target.value as OpeningKind } })}>
              {(['door', 'sliding-door', 'window', 'opening'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`tool.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid2">
            <NumField label={t('prop.width')} value={o.width} min={300} max={6000} onChange={(v) => patch({ width: v }, 'w')} onDone={seal} />
            <NumField label={t('prop.height')} value={o.height} min={300} max={3500} onChange={(v) => patch({ height: v }, 'h')} onDone={seal} />
          </div>
          {o.kind === 'window' && <NumField label={t('prop.sill')} value={o.sill} max={2500} onChange={(v) => patch({ sill: v }, 's')} onDone={seal} />}
          {o.kind === 'door' && (
            <>
              <label className="check">
                <input type="checkbox" checked={!!o.flip} onChange={(e) => store.dispatch({ type: 'opening/update', levelId, id: o.id, patch: { flip: e.target.checked } })} />
                {t('prop.flip')}
              </label>
              <label className="check">
                <input type="checkbox" checked={!!o.mirror} onChange={(e) => store.dispatch({ type: 'opening/update', levelId, id: o.id, patch: { mirror: e.target.checked } })} />
                {t('prop.mirror')}
              </label>
            </>
          )}
        </>
      );
    }
  } else if (sel?.kind === 'room') {
    const room = level.rooms.find((r) => r.id === sel.id);
    if (room) {
      props = (
        <>
          <label className="field">
            <span>{t('prop.name')}</span>
            <input className="input" value={room.name} onChange={(e) => store.dispatch({ type: 'room/update', levelId, id: room.id, patch: { name: e.target.value } }, { mergeKey: `name:${room.id}` })} onBlur={seal} />
          </label>
          <label className="field">
            <span>{t('prop.type')}</span>
            <select
              className="input"
              value={room.type}
              onChange={(e) => {
                const type = e.target.value as RoomType;
                const isDefaultName = /^Room \d+$/.test(room.name);
                store.dispatch({
                  type: 'room/update',
                  levelId,
                  id: room.id,
                  patch: {
                    type,
                    ...(room.floorMaterial ? {} : { floorMaterial: FLOOR_BY_ROOM_TYPE[type] ?? level.defaultFloorMaterial }),
                    ...(isDefaultName ? { name: t(`room.${type}` as MessageKey) } : {}),
                  },
                });
              }}
            >
              {RoomTypeSchema.options.map((rt) => (
                <option key={rt} value={rt}>
                  {t(`room.${rt}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <div className="muted small">
            {t('prop.area')}: <b>{formatArea(area(room.polygon))}</b>
          </div>
          <div className="field">
            <span>{t('prop.floor')}</span>
            <Swatches materials={registry.materialsFor('floor')} value={room.floorMaterial ?? level.defaultFloorMaterial} onPick={(id) => store.dispatch({ type: 'room/update', levelId, id: room.id, patch: { floorMaterial: id } })} />
          </div>
          <div className="field">
            <span>{t('prop.walls')}</span>
            <Swatches materials={registry.materialsFor('wall')} value={room.wallMaterial ?? level.defaultWallMaterial} onPick={(id) => store.dispatch({ type: 'room/update', levelId, id: room.id, patch: { wallMaterial: id } })} />
          </div>
        </>
      );
    }
  } else if (sel?.kind === 'item') {
    const item = level.items.find((i) => i.id === sel.id);
    const def = item && registry.item(item.catalogId);
    if (item && def) {
      const price = def.price?.[region.currency];
      const patch = (p: Partial<Omit<Item, 'id'>>, key: string) => store.dispatch({ type: 'item/update', levelId, id: item.id, patch: p }, { mergeKey: `${key}:${item.id}` });
      props = (
        <>
          <div>
            <b>{localize(def.name, lang)}</b>
            {price !== undefined && <div className="muted small">{formatMoney(price, state.model.region)}</div>}
          </div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => store.dispatch({ type: 'item/update', levelId, id: item.id, patch: { rotation: (item.rotation + 270) % 360 } })}>
              ⟲ 90°
            </button>
            <button className="btn btn-sm" onClick={() => store.dispatch({ type: 'item/update', levelId, id: item.id, patch: { rotation: (item.rotation + 90) % 360 } })}>
              ⟳ 90°
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                const id = createId('itm');
                store.dispatch({ type: 'item/add', levelId, item: { ...item, id, position: [item.position[0] + 300, item.position[1] + 300] } });
                store.select({ kind: 'item', id });
              }}
            >
              {t('prop.duplicate')}
            </button>
          </div>
          <NumField label={t('prop.rotation')} value={item.rotation} max={359} step={5} onChange={(v) => patch({ rotation: v }, 'rot')} onDone={seal} />
          <div className="grid2">
            <NumField label={t('prop.width')} value={item.width ?? def.size.w} min={50} max={8000} onChange={(v) => patch({ width: v }, 'w')} onDone={seal} />
            <NumField label={t('prop.depth')} value={item.depth ?? def.size.d} min={10} max={8000} onChange={(v) => patch({ depth: v }, 'd')} onDone={seal} />
            <NumField label={t('prop.height')} value={item.height ?? def.size.h} min={5} max={4000} onChange={(v) => patch({ height: v }, 'h')} onDone={seal} />
            <NumField label={t('prop.elevation')} value={item.elevation} max={3000} onChange={(v) => patch({ elevation: v }, 'el')} onDone={seal} />
          </div>
        </>
      );
    }
  }

  const totalArea = level.rooms.reduce((s, r) => s + area(r.polygon), 0);
  const u = level.underlay;

  return (
    <>
      {sel && props && (
        <section className="panel">
          <div className="row">
            <h3>{t('panel.properties')}</h3>
            <div className="spacer" />
            {sel.kind !== 'room' && (
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => store.deleteSelection()}>
                {t('action.delete')}
              </button>
            )}
          </div>
          {props}
        </section>
      )}

      {!sel && state.tool === 'wall' && (
        <section className="panel">
          <h3>{t('prop.wall')}</h3>
          <NumField label={t('prop.thickness')} value={state.wallThickness} min={50} max={600} onChange={(v) => store.setWallThickness(v)} />
          <div className="row">
            {[100, 150, 200, 230].map((v) => (
              <button key={v} className={`chip ${state.wallThickness === v ? 'on' : ''}`} onClick={() => store.setWallThickness(v)}>
                {v}
              </button>
            ))}
          </div>
        </section>
      )}

      <Catalog store={store} />

      {!sel && (
        <section className="panel">
          <h3>{t('level.title')}</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{level.rooms.length}</b>
              <span>{t('summary.rooms')}</span>
            </div>
            <div className="stat">
              <b>{Math.round(totalArea / 92903.04).toLocaleString('en')}</b>
              <span>sq ft · {t('summary.area')}</span>
            </div>
          </div>
          <NumField label={t('level.height')} value={level.height} min={2200} max={6000} onChange={(v) => store.dispatch({ type: 'level/update', levelId, patch: { height: v } }, { mergeKey: 'lvl-h' })} onDone={seal} />
          <div className="field">
            <span>{t('prop.floor')}</span>
            <Swatches materials={registry.materialsFor('floor')} value={level.defaultFloorMaterial} onPick={(id) => store.dispatch({ type: 'level/update', levelId, patch: { defaultFloorMaterial: id } })} />
          </div>
          <div className="field">
            <span>{t('prop.walls')}</span>
            <Swatches materials={registry.materialsFor('wall')} value={level.defaultWallMaterial} onPick={(id) => store.dispatch({ type: 'level/update', levelId, patch: { defaultWallMaterial: id } })} />
          </div>
          {u && (
            <>
              <div className="section-title">{t('level.underlay')}</div>
              <label className="check">
                <input type="checkbox" checked={u.visible} onChange={(e) => store.dispatch({ type: 'underlay/update', levelId, patch: { visible: e.target.checked } })} />
                {t('level.show')}
              </label>
              <label className="field">
                <span>{t('level.opacity')}</span>
                <input type="range" min={0.1} max={1} step={0.05} value={u.opacity} onChange={(e) => store.dispatch({ type: 'underlay/update', levelId, patch: { opacity: Number(e.target.value) } }, { mergeKey: 'opacity' })} onPointerUp={seal} />
              </label>
              <button className="btn btn-sm btn-danger" onClick={onRemoveUnderlay}>
                {t('level.remove')}
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}

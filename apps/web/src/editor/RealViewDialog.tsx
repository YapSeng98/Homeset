import { useRef, useState } from 'react';
import type { HomeModel, Panorama } from '@rumah3d/core';
import type { HouseViewer } from '@rumah3d/viewer3d';
import { api } from '../api';
import { useI18n } from '../i18n';
import { PanoramaView } from '../components/PanoramaView';
import type { EditorStore } from './store';

// Measured on an Apple M2 for a 9-room apartment: quick ≈ 3 min, standard ≈ 14 min (91 s per room), high ≈ 1 hour.
// Production will move these renders to cloud GPU workers.
const QUALITY = {
  quick: { samples: 16, width: 1024 },
  standard: { samples: 48, width: 1536 },
  high: { samples: 128, width: 2048 },
} as const;
type Quality = keyof typeof QUALITY;

type Phase =
  | { phase: 'setup' }
  | { phase: 'rendering'; index: number; total: number; room: string; progress: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

/** Renders a photoreal 360° panorama in every room and saves them to the project. */
export function RealViewDialog({
  projectId,
  store,
  getViewer,
  onClose,
}: {
  projectId: string;
  store: EditorStore;
  getViewer: () => HouseViewer | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const level = store.level;
  const [quality, setQuality] = useState<Quality>('standard');
  const [state, setState] = useState<Phase>({ phase: 'setup' });
  const [preview, setPreview] = useState<HomeModel | null>(null);
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    const viewer = getViewer();
    if (!viewer) return;
    abort.current = new AbortController();
    const { samples, width } = QUALITY[quality];
    const rooms = level.rooms;
    const made: Panorama[] = [];
    try {
      for (const [index, room] of rooms.entries()) {
        setState({ phase: 'rendering', index, total: rooms.length, room: room.name, progress: 0 });
        const shot = await viewer.renderPanorama(room.id, {
          samples,
          width,
          signal: abort.current.signal,
          onProgress: (progress) => setState({ phase: 'rendering', index, total: rooms.length, room: room.name, progress }),
        });
        const blob = await (await fetch(shot.dataUrl)).blob();
        const asset = await api.uploadAsset(projectId, new File([blob], `real-view-${room.id}.jpg`, { type: 'image/jpeg' }));
        made.push({ roomId: room.id, url: asset.url, position: shot.position, height: shot.height });
      }
      store.dispatch({ type: 'panorama/setAll', levelId: level.id, panoramas: made });
      setPreview(store.getState().model);
      setState({ phase: 'done' });
    } catch (err) {
      const e = err as Error;
      setState(e.name === 'AbortError' ? { phase: 'setup' } : { phase: 'error', message: e.message });
    }
  };

  const rendering = state.phase === 'rendering';
  return (
    <div className="modal-back" onClick={rendering ? undefined : onClose}>
      <div className="modal" style={{ width: preview ? 'min(1100px, 100%)' : undefined }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('real.title')}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{t('real.title')}</h2>
          {!rendering && (
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              {t('action.close')}
            </button>
          )}
        </div>
        <div className="modal-body">
          {state.phase === 'setup' && (
            <>
              <p className="muted" style={{ margin: 0 }}>
                {t('real.body')}
              </p>
              <label className="field">
                <span>{t('real.quality')}</span>
                <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                  <option value="quick">{t('real.quick')}</option>
                  <option value="standard">{t('real.standard')}</option>
                  <option value="high">{t('real.high')}</option>
                </select>
              </label>
              <div className="muted small">
                {t('summary.rooms')}: {level.rooms.map((r) => r.name).join(', ')}
              </div>
            </>
          )}
          {state.phase === 'rendering' && (
            <>
              <b className="small">
                {t('real.progress', { room: state.room, i: state.index + 1, n: state.total, pct: Math.round(state.progress * 100) })}
              </b>
              <div className="bar">
                <i style={{ width: `${((state.index + state.progress) / state.total) * 100}%` }} />
              </div>
              <span className="muted small">{t('photo.hint')}</span>
            </>
          )}
          {state.phase === 'error' && <p className="error">{state.message}</p>}
          {state.phase === 'done' && preview && (
            <>
              <p style={{ margin: 0 }}>{t('real.done')}</p>
              <div style={{ position: 'relative', height: 'min(60vh, 520px)', borderRadius: 10, overflow: 'hidden' }}>
                <PanoramaView model={preview} />
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          {state.phase === 'rendering' ? (
            <button className="btn" onClick={() => abort.current?.abort()}>
              {t('action.cancel')}
            </button>
          ) : state.phase === 'done' ? (
            <button className="btn btn-primary" onClick={onClose}>
              {t('action.close')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={level.rooms.length === 0}>
              {t('real.start')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

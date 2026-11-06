import { useRef, useState } from 'react';
import type { HouseViewer } from '@homeset/viewer3d';
import { useI18n } from '../i18n';

type Phase =
  | { phase: 'idle' }
  | { phase: 'rendering'; progress: number }
  | { phase: 'done'; url: string }
  | { phase: 'error'; message: string };

/** Path-traced listing photos of the current 3D view. */
export function PhotoStudio({ getViewer, fileName }: { getViewer: () => HouseViewer | null; fileName: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<Phase>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    const viewer = getViewer();
    if (!viewer) return;
    abort.current = new AbortController();
    setState({ phase: 'rendering', progress: 0 });
    try {
      const url = await viewer.renderPhoto({
        // ~2.5 minutes on an Apple M2 at 1080p; despeckle + denoise clean up the rest.
        samples: 96,
        signal: abort.current.signal,
        onProgress: (progress) => setState({ phase: 'rendering', progress }),
      });
      setState({ phase: 'done', url });
    } catch (err) {
      const e = err as Error;
      setState(e.name === 'AbortError' ? { phase: 'idle' } : { phase: 'error', message: e.message });
    }
  };

  return (
    <>
      {state.phase !== 'rendering' && (
        <button className="btn photo-btn" onClick={start} title={t('photo.hint')}>
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {t('photo.button')}
        </button>
      )}
      {state.phase === 'rendering' && (
        <div className="floating photo-progress">
          <div className="row">
            <b className="small">{t('photo.rendering', { pct: Math.round(state.progress * 100) })}</b>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>
              {t('action.cancel')}
            </button>
          </div>
          <div className="bar">
            <i style={{ width: `${state.progress * 100}%` }} />
          </div>
          <span className="muted small">{t('photo.hint')}</span>
        </div>
      )}
      {state.phase === 'error' && (
        <div className="floating photo-progress">
          <span className="error">{state.message}</span>
          <button className="btn btn-sm" onClick={() => setState({ phase: 'idle' })}>
            {t('action.close')}
          </button>
        </div>
      )}
      {state.phase === 'done' && (
        <div className="modal-back" onClick={() => setState({ phase: 'idle' })}>
          <div className="modal" style={{ width: 'min(1100px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('photo.ready')}>
            <div className="modal-head">
              <h2 style={{ fontSize: 17 }}>{t('photo.ready')}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setState({ phase: 'idle' })}>
                {t('action.close')}
              </button>
            </div>
            <div className="modal-body">
              <img src={state.url} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            </div>
            <div className="modal-foot">
              <a className="btn btn-primary" href={state.url} download={`${fileName.replace(/[^\w-]+/g, '-')}.jpg`}>
                {t('photo.download')}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

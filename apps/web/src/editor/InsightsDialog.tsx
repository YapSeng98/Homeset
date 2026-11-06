import { useEffect, useState } from 'react';
import type { HomeModel } from '@rumah3d/core';
import { api, type Insights } from '../api';
import { useI18n } from '../i18n';
import { Icons } from '../components/Icons';
import { waChatUrl } from '../components/whatsapp';
import { ShareBox } from './PublishDialog';

export function InsightsDialog({ projectId, slug, model, onClose }: { projectId: string; slug: string | null; model: HomeModel; onClose: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.insights(projectId).then(setData, (e: Error) => setError(e.message));
  }, [projectId]);

  const roomName = (id: string) => model.levels.flatMap((l) => l.rooms).find((r) => r.id === id)?.name ?? '—';
  const maxSeconds = Math.max(1, ...(data?.analytics?.rooms.map((r) => r.seconds) ?? [1]));

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('insights.title')}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{t('insights.title')}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {t('action.close')}
          </button>
        </div>
        <div className="modal-body">
          {!slug && <p className="muted">{t('insights.notPublished')}</p>}
          {error && <p className="error">{error}</p>}
          {slug && <ShareBox path={`/t/${slug}`} title={model.name} />}
          {data?.analytics && (
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="stat">
                <b>{data.analytics.views}</b>
                <span>{t('insights.views')}</span>
              </div>
              <div className="stat">
                <b>{data.analytics.sessions}</b>
                <span>{t('insights.sessions')}</span>
              </div>
              <div className="stat">
                <b>{data.analytics.leads}</b>
                <span>{t('insights.leads')}</span>
              </div>
            </div>
          )}
          {data?.analytics && data.analytics.rooms.length > 0 && (
            <>
              <div className="section-title">{t('insights.rooms')}</div>
              {data.analytics.rooms.map((r) => (
                <div key={r.roomId} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 56px', gap: 10, alignItems: 'center' }}>
                  <span className="small">{roomName(r.roomId)}</span>
                  <div className="bar">
                    <i style={{ width: `${(r.seconds / maxSeconds) * 100}%` }} />
                  </div>
                  <span className="small muted" style={{ textAlign: 'right' }}>
                    {r.seconds >= 60 ? `${Math.floor(r.seconds / 60)}m ${r.seconds % 60}s` : `${r.seconds}s`}
                  </span>
                </div>
              ))}
            </>
          )}
          {slug && (
            <>
              <div className="section-title">{t('insights.leads')}</div>
              {data && data.leads.length === 0 && <p className="muted small">{t('insights.noLeads')}</p>}
              {data?.leads.map((l) => (
                <div className="lead" key={l.id}>
                  <div className="row">
                    <b>{l.name}</b>
                    <span className="muted small">{new Date(l.createdAt.endsWith('Z') ? l.createdAt : `${l.createdAt}Z`).toLocaleString()}</span>
                    <div className="spacer" />
                    <a className="btn btn-wa btn-sm" href={waChatUrl(l.phone, model.region, `Hi ${l.name}, thanks for your enquiry about ${model.name}.`)} target="_blank" rel="noreferrer">
                      <Icons.whatsapp /> {l.phone}
                    </a>
                  </div>
                  {l.email && <span className="small muted">{l.email}</span>}
                  {l.message && <span className="small">{l.message}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

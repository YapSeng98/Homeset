import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { formatMoney, randomString, REGIONS } from '@homeset/core';
import type { HouseViewer, PanoramaViewer, ViewMode } from '@homeset/viewer3d';
import { api, type PublicTour } from '../api';
import { BROWSER_ONLY } from '../env';
import { LangSwitcher, useI18n } from '../i18n';
import { Icons } from '../components/Icons';
import { LogoMark } from '../components/Logo';
import { Viewer3D } from '../components/Viewer3D';
import { PanoramaView, panoramaStops } from '../components/PanoramaView';
import { RoomSize } from '../components/RoomSize';

type TourMode = ViewMode | 'real';
import { waChatUrl } from '../components/whatsapp';

/** Tracks time spent per room and sends it in small batches (sendBeacon survives page close). */
function useTourAnalytics(slug: string | undefined, ready: boolean) {
  const session = useMemo(() => `s_${randomString(12)}`, []);
  const totals = useRef(new Map<string, number>());
  const current = useRef<{ id: string; since: number } | null>(null);

  const settle = () => {
    const c = current.current;
    if (!c) return;
    const now = performance.now();
    totals.current.set(c.id, (totals.current.get(c.id) ?? 0) + (now - c.since));
    c.since = now;
  };

  const flush = useCallback(() => {
    if (!slug) return;
    settle();
    const events = [...totals.current.entries()]
      .filter(([, ms]) => ms >= 1000)
      .map(([roomId, ms]) => ({ type: 'room' as const, roomId, seconds: Math.round(ms / 1000) }));
    if (events.length) {
      api.sendEvents(slug, session, events);
      for (const e of events) totals.current.delete(e.roomId);
    }
  }, [slug, session]);

  useEffect(() => {
    if (!slug || !ready) return;
    api.sendEvents(slug, session, [{ type: 'view' }]);
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    const timer = setInterval(flush, 30_000);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      clearInterval(timer);
    };
  }, [slug, ready, session, flush]);

  return (roomId: string | null) => {
    settle();
    current.current = roomId ? { id: roomId, since: performance.now() } : null;
  };
}

export function TourPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useI18n();
  const [tour, setTour] = useState<PublicTour | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mode, setModeState] = useState<TourMode>('orbit');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const viewer = useRef<HouseViewer | null>(null);
  const pano = useRef<PanoramaViewer | null>(null);
  const trackRoom = useTourAnalytics(slug, !!tour);

  useEffect(() => {
    api.publicTour(slug!).then(
      (data) => {
        setTour(data);
        // Open in the photoreal Real View when the agent has created one.
        if (panoramaStops(data.model).length) setModeState('real');
        document.title = data.listing.title;
      },
      () => setNotFound(true),
    );
  }, [slug]);

  const setMode = (next: TourMode) => {
    if (next !== mode && (mode === 'real' || next === 'real')) {
      trackRoom(null);
      setActiveRoom(null);
    }
    setModeState(next);
  };

  if (notFound)
    return (
      <div className="center-msg">
        <p style={{ maxWidth: 420, padding: '0 16px', textAlign: 'center' }}>{t(BROWSER_ONLY ? 'demo.tourMissing' : 'tour.notFound')}</p>
      </div>
    );
  if (!tour)
    return (
      <div className="center-msg">
        <div className="loading">
          <LogoMark />
          <span>{t('tour.loading')}</span>
        </div>
      </div>
    );

  const { listing, agent } = tour;
  const region = REGIONS[tour.region];
  const stops = panoramaStops(tour.model);
  const allRooms = tour.model.levels.flatMap((l) => l.rooms);
  const rooms = mode === 'real' ? allRooms.filter((r) => stops.some((s) => s.id === r.id)) : allRooms;
  const startRoom = (allRooms.find((r) => r.type === 'living' && stops.some((s) => s.id === r.id)) ?? allRooms.find((r) => stops.some((s) => s.id === r.id)))?.id;
  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const disclosure = Object.fromEntries(region.agentDisclosure.map((f) => [f.key, f.label]));

  return (
    <div className="tour">
      {mode === 'real' ? (
        <PanoramaView
          model={tour.model}
          startRoomId={startRoom}
          onReady={(v) => (pano.current = v)}
          onRoomChange={(id) => {
            setActiveRoom(id);
            trackRoom(id);
          }}
        />
      ) : (
        <Viewer3D
          model={tour.model}
          mode={mode}
          onReady={(v) => (viewer.current = v)}
          onRoomChange={(id) => {
            setActiveRoom(id);
            trackRoom(id);
          }}
        />
      )}

      <div className="tour-top">
        <header className="listing-card">
          <span className="eyebrow">{listing.listingType === 'rent' ? t('publish.rent') : t('publish.sale')}</span>
          <h1 title={listing.title}>{listing.title}</h1>
          {listing.price !== undefined && (
            <div className="listing-price">
              {formatMoney(listing.price, tour.region)}
              {listing.listingType === 'rent' && <small>{t('tour.perMonth')}</small>}
            </div>
          )}
          <div className="listing-facts">
            {listing.builtUpSqft !== undefined && (
              <span>
                <Icons.area /> {listing.builtUpSqft.toLocaleString('en')} {t('tour.builtUp')}
              </span>
            )}
            {listing.bedrooms !== undefined && (
              <span>
                <Icons.bed /> {listing.bedrooms} {t('tour.beds')}
              </span>
            )}
            {listing.bathrooms !== undefined && (
              <span>
                <Icons.bath /> {listing.bathrooms} {t('tour.baths')}
              </span>
            )}
            {listing.tenure && <span>{listing.tenure}</span>}
          </div>
          {listing.address && (
            <div className="listing-address">
              <Icons.pin /> {listing.address}
            </div>
          )}
        </header>
        <div className="tour-controls">
          <div className="seg seg-glass tour-modes">
            {stops.length > 0 && (
              <button className={mode === 'real' ? 'on' : ''} onClick={() => setMode('real')}>
                {t('tour.real')}
              </button>
            )}
            <button className={mode === 'orbit' ? 'on' : ''} onClick={() => setMode('orbit')}>
              {t('tour.orbit')}
            </button>
            <button className={mode === 'walk' ? 'on' : ''} onClick={() => setMode('walk')}>
              {t('tour.walk')}
            </button>
          </div>
          <span className="hide-sm">
            <LangSwitcher />
          </span>
          <span className="show-sm">
            <LangSwitcher compact />
          </span>
        </div>
      </div>

      <div className="tour-dock">
        {mode !== 'orbit' && <RoomSize room={allRooms.find((r) => r.id === activeRoom)} />}
        <div className="tour-rooms">
          {rooms.map((r) => (
            <button
              key={r.id}
              className={activeRoom === r.id ? 'on' : ''}
              onClick={() => {
                if (mode === 'real') return void pano.current?.show(r.id);
                viewer.current?.goToRoom(r.id);
                setMode('walk');
              }}
            >
              {r.name}
            </button>
          ))}
        </div>

        <div className="tour-bottom">
          <div className="agent-card">
            <div className="agent-avatar">{initials}</div>
            <div className="agent-meta">
              <b>{agent.name}</b>
              <div>
                {disclosure.agentRegNo}: {agent.agentRegNo}
              </div>
              <div>
                {agent.agencyName} · {disclosure.agencyRegNo}: {agent.agencyRegNo}
              </div>
            </div>
          </div>
          <div className="tour-actions">
            <a className="btn btn-wa btn-lg" href={waChatUrl(agent.phone, tour.region, t('tour.whatsappText', { title: listing.title }))} target="_blank" rel="noreferrer">
              <Icons.whatsapp /> {t('tour.whatsapp')}
            </a>
            <button className="btn btn-primary btn-lg" onClick={() => setLeadOpen(true)}>
              {t('tour.enquire')}
            </button>
          </div>
        </div>
      </div>

      {tour.watermark && <div className="watermark">{t('tour.poweredBy')}</div>}
      {leadOpen && <LeadForm slug={tour.slug} onClose={() => setLeadOpen(false)} />}
    </div>
  );
}

function LeadForm({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: t('tour.leadDefault'), consent: false });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.consent) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendLead(slug, { name: form.name, phone: form.phone, email: form.email || undefined, message: form.message || undefined, consent: true });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('tour.leadTitle')}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{t('tour.leadTitle')}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {t('action.close')}
          </button>
        </div>
        {sent ? (
          <div className="modal-body">
            <p>{t('tour.sent')}</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body">
              <div className="grid2">
                <label className="field">
                  <span>{t('tour.leadName')}</span>
                  <input className="input" required minLength={2} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="field">
                  <span>{t('tour.leadPhone')}</span>
                  <input className="input" required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span>{t('tour.leadEmail')}</span>
                <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="field">
                <span>{t('tour.leadMessage')}</span>
                <textarea className="input" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </label>
              <label className="check">
                <input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                {t('tour.consent')}
              </label>
              {error && <p className="error">{error}</p>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" disabled={busy || !form.consent}>
                {t('tour.send')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

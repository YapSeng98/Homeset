import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { area, REGIONS, sqft, type HomeModel } from '@homeset/core';
import { api, appUrl, type AgentProfile, type Listing } from '../api';
import { BROWSER_ONLY } from '../env';
import { useI18n } from '../i18n';
import { Icons } from '../components/Icons';
import { waShareUrl } from '../components/whatsapp';

const AGENT_KEY = 'homeset.agent';

function savedAgent(): AgentProfile {
  try {
    const raw = localStorage.getItem(AGENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { name: '', phone: '', agentRegNo: '', agencyName: '', agencyRegNo: '' };
}

function listingDefaults(model: HomeModel): Listing {
  const rooms = model.levels.flatMap((l) => l.rooms);
  const total = rooms.filter((r) => r.type !== 'balcony').reduce((s, r) => s + area(r.polygon), 0);
  return {
    title: model.name,
    listingType: 'sale',
    builtUpSqft: total ? Math.round(sqft(total)) : undefined,
    bedrooms: rooms.filter((r) => r.type === 'bedroom' || r.type === 'master').length || undefined,
    bathrooms: rooms.filter((r) => r.type === 'bathroom').length || undefined,
  };
}

export function ShareBox({ path, title }: { path: string; title: string }) {
  const { t } = useI18n();
  const url = appUrl(path);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 264 }).then(setQr, () => setQr(''));
  }, [url]);
  return (
    <>
      <div className="share-link">
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the field is selectable */
            }
          }}
        >
          {copied ? t('action.copied') : t('action.copy')}
        </button>
      </div>
      <div className="qr">
        {qr && <img src={qr} alt={t('publish.qr')} />}
        <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a className="btn btn-wa" href={waShareUrl(t('share.text', { title, url }))} target="_blank" rel="noreferrer">
            <Icons.whatsapp /> {t('publish.whatsapp')}
          </a>
          <a className="btn" href={url} target="_blank" rel="noreferrer">
            {t('publish.view')}
          </a>
          <span className="muted small">{t('publish.qr')}</span>
        </div>
      </div>
      {BROWSER_ONLY && <p className="muted small">{t('demo.shareNote')}</p>}
    </>
  );
}

export function PublishDialog({ projectId, model, onClose, onPublished }: { projectId: string; model: HomeModel; onClose: () => void; onPublished: (slug: string) => void }) {
  const { t } = useI18n();
  const region = REGIONS[model.region];
  const [listing, setListing] = useState<Listing>(() => listingDefaults(model));
  const [agent, setAgent] = useState<AgentProfile>(savedAgent);
  const [published, setPublished] = useState<{ path: string } | null>(null);
  const [existing, setExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getTourInfo(projectId).then(({ tour }) => {
      if (!tour) return;
      setExisting(true);
      setListing({ ...tour.listing, builtUpSqft: tour.listing.builtUpSqft });
      setAgent(tour.agent);
    }, () => {});
  }, [projectId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Publish exactly what is on screen, even if autosave hasn't run yet.
      await api.saveProject(projectId, { model });
      const res = await api.publish(projectId, listing, agent);
      try {
        localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
      } catch {
        /* storage unavailable */
      }
      setPublished({ path: res.path });
      onPublished(res.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => (v === '' ? undefined : Number(v));
  const L = <K extends keyof Listing>(k: K, v: Listing[K]) => setListing((s) => ({ ...s, [k]: v }));
  const A = (k: keyof AgentProfile, v: string) => setAgent((s) => ({ ...s, [k]: v }));

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('publish.title')}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{published ? t('publish.done') : t('publish.title')}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {t('action.close')}
          </button>
        </div>
        {published ? (
          <div className="modal-body">
            <ShareBox path={published.path} title={listing.title} />
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body">
              <div className="section-title">{t('publish.listing')}</div>
              <label className="field">
                <span>{t('publish.titleField')}</span>
                <input className="input" required minLength={3} value={listing.title} onChange={(e) => L('title', e.target.value)} />
              </label>
              <div className="grid2">
                <label className="field">
                  <span>{t('publish.type')}</span>
                  <select className="input" value={listing.listingType} onChange={(e) => L('listingType', e.target.value as Listing['listingType'])}>
                    <option value="sale">{t('publish.sale')}</option>
                    <option value="rent">{t('publish.rent')}</option>
                  </select>
                </label>
                <label className="field">
                  <span>
                    {t('publish.price')} ({region.currencySymbol})
                  </span>
                  <input className="input" type="number" min={0} value={listing.price ?? ''} onChange={(e) => L('price', num(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t('publish.builtUp')}</span>
                  <input className="input" type="number" min={0} value={listing.builtUpSqft ?? ''} onChange={(e) => L('builtUpSqft', num(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t('publish.tenure')}</span>
                  <input className="input" value={listing.tenure ?? ''} placeholder={model.region === 'SG' ? '99-year leasehold' : 'Freehold'} onChange={(e) => L('tenure', e.target.value || undefined)} />
                </label>
                <label className="field">
                  <span>{t('publish.beds')}</span>
                  <input className="input" type="number" min={0} max={20} value={listing.bedrooms ?? ''} onChange={(e) => L('bedrooms', num(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t('publish.baths')}</span>
                  <input className="input" type="number" min={0} max={20} value={listing.bathrooms ?? ''} onChange={(e) => L('bathrooms', num(e.target.value))} />
                </label>
              </div>
              <label className="field">
                <span>{t('publish.address')}</span>
                <input className="input" value={listing.address ?? ''} onChange={(e) => L('address', e.target.value || undefined)} />
              </label>

              <div className="section-title">{t('publish.agent')}</div>
              <div className="grid2">
                <label className="field">
                  <span>{t('publish.agentName')}</span>
                  <input className="input" required value={agent.name} onChange={(e) => A('name', e.target.value)} />
                </label>
                <label className="field">
                  <span>{t('publish.phone')}</span>
                  <input className="input" required inputMode="tel" placeholder={`+${region.phoneCountryCode} …`} value={agent.phone} onChange={(e) => A('phone', e.target.value)} />
                </label>
                {region.agentDisclosure.map((f) => (
                  <label className="field" key={f.key}>
                    <span>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </span>
                    <input className="input" required={f.required} placeholder={f.example} value={agent[f.key as keyof AgentProfile] ?? ''} onChange={(e) => A(f.key as keyof AgentProfile, e.target.value)} />
                  </label>
                ))}
              </div>
              {error && <p className="error">{error}</p>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={onClose}>
                {t('action.cancel')}
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {existing ? t('publish.update') : t('publish.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

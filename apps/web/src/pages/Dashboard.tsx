import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lang, Region } from '@homeset/core';
import { api, type ProjectSummary } from '../api';
import { BROWSER_ONLY } from '../env';
import { LangSwitcher, useI18n, type MessageKey } from '../i18n';
import { Icons } from '../components/Icons';
import { Logo } from '../components/Logo';
import { sampleApartment } from '../templates';

const STEPS: [keyof typeof Icons, MessageKey][] = [
  ['plan', 'home.step1'],
  ['cube', 'home.step2'],
  ['pano', 'home.step3'],
  ['share', 'home.step4'],
];

/** "2 hours ago", "yesterday", in the reader's language. */
function timeAgo(iso: string, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(lang === 'zh' ? 'zh-CN' : lang, { numeric: 'auto' });
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return rtf.format(0, 'second');
}

export function Dashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [region, setRegion] = useState<Region>('MY');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listProjects().then(setProjects, (e: Error) => setError(e.message));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject(name.trim(), region);
      navigate(`/p/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const trySample = async () => {
    setBusy(true);
    try {
      const title = `Sample 3-bedroom (${region})`;
      const p = await api.createProject(title, region);
      await api.saveProject(p.id, { model: sampleApartment(title, region) });
      navigate(`/p/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const startNew = () => {
    nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameRef.current?.focus({ preventScroll: true });
  };

  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = async (id: string) => {
    if (confirming !== id) return setConfirming(id);
    await api.deleteProject(id);
    setConfirming(null);
    setProjects((ps) => ps?.filter((p) => p.id !== id) ?? null);
  };

  return (
    <>
      <header className="topbar">
        <Logo />
        <span className="muted small hide-sm topbar-tagline">{t('app.tagline')}</span>
        <div className="spacer" />
        <LangSwitcher />
      </header>
      <main className="dash">
        <section className="hero">
          <div>
            <span className="eyebrow">{t('home.eyebrow')}</span>
            <h1 className="display">{t('home.title')}</h1>
            <p className="lede">{t('home.body')}</p>
            <div className="row hero-actions">
              <button className="btn btn-accent btn-lg" onClick={startNew}>
                <Icons.plus /> {t('action.new')}
              </button>
              <button className="btn btn-lg" onClick={trySample} disabled={busy}>
                {t('dashboard.sample')}
              </button>
            </div>
          </div>
          <ol className="steps">
            {STEPS.map(([icon, key], i) => {
              const Icon = Icons[icon];
              return (
                <li key={key}>
                  <div className="step-top">
                    <span className="step-icon">
                      <Icon />
                    </span>
                    <span className="step-n">0{i + 1}</span>
                  </div>
                  <b>{t(key)}</b>
                </li>
              );
            })}
          </ol>
        </section>

        {BROWSER_ONLY && <p className="notice">{t('demo.note')}</p>}

        <div className="section-head">
          <h2>{t('dashboard.title')}</h2>
          {projects && projects.length > 0 && <span className="count">{projects.length}</span>}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="cards">
          <form className="card new-card" onSubmit={create}>
            <h3>
              <Icons.plus /> {t('action.new')}
            </h3>
            <label className="field">
              <span>{t('dashboard.name')}</span>
              <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('dashboard.namePlaceholder')} />
            </label>
            <label className="field">
              <span>{t('dashboard.region')}</span>
              <select className="input" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
                <option value="MY">{t('region.MY')}</option>
                <option value="SG">{t('region.SG')}</option>
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy || !name.trim()}>
              {t('action.create')}
            </button>
          </form>
          {projects?.map((p) => (
            <article className="card project-card" key={p.id}>
              <div className="card-thumb" onClick={() => navigate(`/p/${p.id}`)}>
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" />
                ) : (
                  <span className="card-thumb-empty">
                    <Icons.cube />
                  </span>
                )}
                <span className={`badge ${p.tourSlug ? 'badge-live' : 'badge-draft'}`}>{p.tourSlug ? t('dashboard.published') : t('dashboard.draft')}</span>
              </div>
              <div className="card-body">
                <div className="card-title" onClick={() => navigate(`/p/${p.id}`)} title={p.name}>
                  {p.name}
                </div>
                <div className="card-meta">
                  <span>{t(`region.${p.region}`)}</span>
                  <i />
                  <span>{t('dashboard.edited', { time: timeAgo(p.updatedAt, lang) })}</span>
                </div>
              </div>
              <div className="card-foot">
                <button className="btn btn-sm" onClick={() => navigate(`/p/${p.id}`)}>
                  {t('dashboard.open')}
                </button>
                <div className="spacer" />
                {confirming === p.id && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                    {t('action.cancel')}
                  </button>
                )}
                <button
                  className={`btn btn-sm btn-danger ${confirming === p.id ? '' : 'btn-ghost'}`}
                  title={confirming === p.id ? t('dashboard.confirmDelete') : undefined}
                  onClick={() => remove(p.id)}
                >
                  {t('action.delete')}
                  {confirming === p.id ? '?' : ''}
                </button>
              </div>
            </article>
          ))}
        </div>
        {projects && projects.length === 0 && <p className="empty-hero">{t('dashboard.empty')}</p>}
      </main>
    </>
  );
}

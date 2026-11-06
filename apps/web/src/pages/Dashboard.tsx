import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Region } from '@rumah3d/core';
import { api, type ProjectSummary } from '../api';
import { LangSwitcher, useI18n } from '../i18n';
import { Logo } from '../components/Logo';
import { sampleApartment } from '../templates';

export function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [region, setRegion] = useState<Region>('MY');
  const [busy, setBusy] = useState(false);

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
        <span className="muted small hide-sm">{t('app.tagline')}</span>
        <div className="spacer" />
        <LangSwitcher />
      </header>
      <main className="dash">
        <div className="dash-head">
          <div>
            <h1>{t('dashboard.title')}</h1>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="cards">
          <form className="card new-card" onSubmit={create}>
            <h3>{t('action.new')}</h3>
            <label className="field">
              <span>{t('dashboard.name')}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('dashboard.namePlaceholder')} />
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={trySample} disabled={busy}>
              {t('dashboard.sample')}
            </button>
          </form>
          {projects?.map((p) => (
            <article className="card" key={p.id}>
              <div className="card-thumb" onClick={() => navigate(`/p/${p.id}`)}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <span>3D</span>}
              </div>
              <div className="card-body">
                <div className="card-title" onClick={() => navigate(`/p/${p.id}`)}>
                  {p.name}
                </div>
                <div className="row">
                  <span className={`badge ${p.tourSlug ? 'badge-live' : 'badge-draft'}`}>
                    {p.tourSlug ? t('dashboard.published') : t('dashboard.draft')}
                  </span>
                  <span className="muted small">{t(`region.${p.region}`)}</span>
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
              </div>
            </article>
          ))}
        </div>
        {projects && projects.length === 0 && <p className="empty-hero">{t('dashboard.empty')}</p>}
      </main>
    </>
  );
}

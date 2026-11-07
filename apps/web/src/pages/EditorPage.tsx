import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Command, HomeModel } from '@homeset/core';
import type { HouseViewer } from '@homeset/viewer3d';
import { api, type Project } from '../api';
import { TEST_HOOKS } from '../env';
import { LangSwitcher, useI18n, type MessageKey } from '../i18n';
import { Icons } from '../components/Icons';
import { Viewer3D } from '../components/Viewer3D';
import { RoomSize } from '../components/RoomSize';
import { EditorStore, useEditor, type Tool, type ViewKind } from '../editor/store';
import { PlanCanvas } from '../editor/PlanCanvas';
import { SidePanel } from '../editor/SidePanel';
import { PublishDialog } from '../editor/PublishDialog';
import { InsightsDialog } from '../editor/InsightsDialog';
import { PhotoStudio } from '../editor/PhotoStudio';
import { RealViewDialog } from '../editor/RealViewDialog';
import { sampleApartment } from '../templates';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [store, setStore] = useState<EditorStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProject(id!).then(
      (p) => {
        const editorStore = new EditorStore(p.model);
        if (TEST_HOOKS) (window as unknown as { __store?: EditorStore }).__store = editorStore;
        setProject(p);
        setStore(editorStore);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);

  if (error) return <div className="center-msg">{error}</div>;
  if (!project || !store) return <div className="center-msg">…</div>;
  return <Editor project={project} store={store} />;
}

const TOOLS: Tool[] = ['select', 'wall', 'door', 'sliding-door', 'window', 'opening'];

/** Copies a template's level into the current level as one undoable step. */
function templateCommands(levelId: string, template: HomeModel): Command {
  const src = template.levels[0]!;
  return {
    type: 'batch',
    commands: [
      ...src.walls.map((wall): Command => ({ type: 'wall/add', levelId, wall })),
      ...src.openings.map((opening): Command => ({ type: 'opening/add', levelId, opening })),
      { type: 'room/setAll', levelId, rooms: src.rooms },
      ...src.items.map((item): Command => ({ type: 'item/add', levelId, item })),
    ],
  };
}

function useAutosave(store: EditorStore, projectId: string) {
  useEffect(() => {
    let saved = store.getState().model; // last model the server has
    let seen = saved; // last model this hook reacted to
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = async () => {
      const model = store.getState().model;
      if (model === saved) return store.setSave('saved');
      store.setSave('saving');
      try {
        await api.saveProject(projectId, { model });
        saved = model;
        store.setSave(store.getState().model === model ? 'saved' : 'unsaved');
      } catch {
        store.setSave('error');
        timer = setTimeout(save, 4000);
      }
    };
    // React to model edits only, not to selection, tool, view or save-status changes.
    const unsub = store.subscribe(() => {
      const model = store.getState().model;
      if (model === seen) return;
      seen = model;
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    });
    // Warn before leaving only when the server is missing changes.
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (store.getState().model !== saved) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('beforeunload', beforeUnload);
      if (store.getState().model !== saved) void api.saveProject(projectId, { model: store.getState().model });
    };
  }, [store, projectId]);
}

async function thumbnailFrom(viewer: HouseViewer): Promise<string> {
  const src = viewer.capture('image/jpeg', 0.85);
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = Math.round((480 * img.height) / img.width);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function Editor({ project, store }: { project: Project; store: EditorStore }) {
  const state = useEditor(store);
  const { t } = useI18n();
  const level = state.model.levels.find((l) => l.id === state.levelId)!;
  const [publishing, setPublishing] = useState(false);
  const [insights, setInsights] = useState(false);
  const [realView, setRealView] = useState(false);
  const [slug, setSlug] = useState(project.tourSlug);
  const [sideOpen, setSideOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HouseViewer | null>(null);

  useAutosave(store, project.id);

  // Undo / redo everywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // Refresh the project thumbnail each time the 3D view is opened.
  useEffect(() => {
    if (state.view !== 'orbit' || level.walls.length === 0) return;
    const timer = setTimeout(async () => {
      if (!viewerRef.current) return;
      try {
        await api.saveProject(project.id, { thumbnail: await thumbnailFrom(viewerRef.current) });
      } catch {
        /* thumbnail is best-effort */
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [state.view, project.id, level.walls.length]);

  const upload = async (file: File) => {
    setUploadError(null);
    try {
      const asset = await api.uploadAsset(project.id, file);
      const img = new Image();
      img.src = asset.url;
      await img.decode();
      // First guess: the drawing is ~15 m wide. "Set scale" corrects it.
      store.dispatch({
        type: 'underlay/set',
        levelId: level.id,
        underlay: { url: asset.url, pixelWidth: img.naturalWidth, pixelHeight: img.naturalHeight, mmPerPixel: 15000 / img.naturalWidth, offset: [0, 0], opacity: 0.55, visible: true },
      });
      store.setView('plan');
      store.setTool('calibrate');
      store.requestFit();
    } catch (e) {
      setUploadError((e as Error).message);
    }
  };

  const isEmpty = level.walls.length === 0 && !level.underlay;
  const saveLabel: Record<typeof state.save, MessageKey> = { saved: 'save.saved', saving: 'save.saving', unsaved: 'save.unsaved', error: 'save.error' };

  return (
    <div className="editor">
      <header className="topbar">
        <Link to="/" className="btn btn-ghost btn-icon" aria-label={t('nav.projects')}>
          <Icons.back />
        </Link>
        <input
          className="input hide-sm"
          style={{ maxWidth: 260, fontWeight: 600, border: 'none', background: 'transparent' }}
          value={state.model.name}
          onChange={(e) => store.dispatch({ type: 'model/rename', name: e.target.value }, { mergeKey: 'rename' })}
          onBlur={() => store.seal()}
          aria-label="Project name"
        />
        <span className={`small ${state.save === 'error' ? 'error' : 'muted'}`} style={{ minWidth: 64 }}>
          {t(saveLabel[state.save])}
        </span>
        <button className="btn btn-ghost btn-icon" disabled={!state.canUndo} onClick={() => store.undo()} aria-label="Undo">
          <Icons.undo />
        </button>
        <button className="btn btn-ghost btn-icon" disabled={!state.canRedo} onClick={() => store.redo()} aria-label="Redo">
          <Icons.redo />
        </button>
        <div className="spacer" />
        <div className="seg" role="tablist">
          {(['plan', 'orbit', 'walk'] as ViewKind[]).map((v) => (
            <button key={v} role="tab" className={state.view === v ? 'on' : ''} onClick={() => store.setView(v)} disabled={v !== 'plan' && level.walls.length === 0}>
              {t(`view.${v}` as MessageKey)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn hide-sm" onClick={() => setInsights(true)}>
          {t('insights.button')}
        </button>
        <button className="btn btn-primary" onClick={() => setPublishing(true)} disabled={level.walls.length === 0}>
          {t('publish.button')}
        </button>
        <span className="hide-sm">
          <LangSwitcher />
        </span>
        <button className="btn btn-ghost btn-icon show-sm" onClick={() => setSideOpen((o) => !o)} aria-label="Panel">
          <Icons.panel />
        </button>
      </header>

      <div className="editor-main">
        <nav className="toolrail" aria-label="Tools">
          {TOOLS.map((tool) => {
            const Icon = Icons[tool];
            return (
              <button
                key={tool}
                className={`tool ${state.tool === tool && !state.placing && state.view === 'plan' ? 'on' : ''}`}
                onClick={() => {
                  store.setView('plan');
                  store.setTool(tool);
                }}
                title={t(`tool.${tool}` as MessageKey)}
              >
                <Icon />
                {t(`tool.${tool}` as MessageKey)}
              </button>
            );
          })}
          <div className="tool-sep" />
          <button className="tool" onClick={() => fileRef.current?.click()} title={t('tool.upload')}>
            <Icons.upload />
            {t('tool.upload')}
          </button>
          <button
            className={`tool ${state.tool === 'calibrate' ? 'on' : ''}`}
            disabled={!level.underlay}
            onClick={() => {
              store.setView('plan');
              store.setTool('calibrate');
            }}
            title={t('tool.calibrate')}
          >
            <Icons.calibrate />
            {t('tool.calibrate')}
          </button>
          <button className="tool" onClick={() => (state.view === 'plan' ? store.requestFit() : viewerRef.current?.frameAll())} title="Fit">
            <Icons.fit />
            Fit
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </nav>

        <div className="stage">
          {state.view === 'plan' ? (
            <PlanCanvas store={store} />
          ) : (
            <>
              <Viewer3D
                model={state.model}
                mode={state.view === 'walk' ? 'walk' : 'orbit'}
                onReady={(v) => (viewerRef.current = v)}
                onRoomChange={setActiveRoom}
              />
              {state.view === 'walk' && <RoomSize room={level.rooms.find((r) => r.id === activeRoom)} />}
              <div className="room-chips">
                {level.rooms.map((r) => (
                  <button
                    key={r.id}
                    className={activeRoom === r.id ? 'on' : ''}
                    onClick={() => {
                      store.setView('walk');
                      setTimeout(() => viewerRef.current?.goToRoom(r.id), 0);
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
              <div className="stage-actions">
                <button className="btn" onClick={() => setRealView(true)} title={t('real.body')}>
                  <b style={{ color: 'var(--brand)' }}>360°</b> {t('real.button')}
                </button>
                <PhotoStudio getViewer={() => viewerRef.current} fileName={state.model.name} />
              </div>
              <div className="hintbar">{state.view === 'walk' ? t('hint.walk') : t('hint.orbit')}</div>
            </>
          )}

          {isEmpty && state.view === 'plan' && state.tool === 'select' && !state.placing && (
            <div className="empty-stage">
              <div className="empty-box">
                <h2 style={{ fontSize: 18 }}>{t('empty.title')}</h2>
                <p>{t('empty.body')}</p>
                <button className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()}>
                  <Icons.upload /> {t('empty.upload')}
                </button>
                <button className="btn" onClick={() => store.setTool('wall')}>
                  {t('empty.draw')}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    store.dispatch(templateCommands(level.id, sampleApartment(state.model.name, state.model.region)));
                    store.requestFit();
                  }}
                >
                  {t('empty.sample')}
                </button>
                {uploadError && <p className="error">{uploadError}</p>}
              </div>
            </div>
          )}
          {!isEmpty && uploadError && (
            <div className="floating" style={{ top: 12, left: 12 }}>
              <span className="error">{uploadError}</span>
            </div>
          )}
        </div>

        <aside className={`side ${sideOpen ? 'open' : ''}`}>
          <SidePanel store={store} onRemoveUnderlay={() => store.dispatch({ type: 'underlay/set', levelId: level.id, underlay: undefined })} />
        </aside>
      </div>

      {publishing && (
        <PublishDialog
          projectId={project.id}
          model={state.model}
          onClose={() => setPublishing(false)}
          onPublished={(s) => setSlug(s)}
        />
      )}
      {insights && <InsightsDialog projectId={project.id} slug={slug} model={state.model} onClose={() => setInsights(false)} />}
      {realView && <RealViewDialog projectId={project.id} store={store} getViewer={() => viewerRef.current} onClose={() => setRealView(false)} />}
    </div>
  );
}

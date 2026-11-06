import { useEffect, useRef } from 'react';
import type { HomeModel } from '@homeset/core';
import { HouseViewer, type ViewMode } from '@homeset/viewer3d';
import { TEST_HOOKS } from '../env';
import { registry } from '../registry';

interface Props {
  model: HomeModel;
  mode: ViewMode;
  onRoomChange?: (roomId: string | null) => void;
  onReady?: (viewer: HouseViewer) => void;
}

/** React wrapper around the framework-free HouseViewer. */
export function Viewer3D({ model, mode, onRoomChange, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewer = useRef<HouseViewer | null>(null);
  const roomCb = useRef(onRoomChange);
  roomCb.current = onRoomChange;

  useEffect(() => {
    const v = new HouseViewer(ref.current!, { registry, onRoomChange: (id) => roomCb.current?.(id) });
    viewer.current = v;
    if (TEST_HOOKS) (window as unknown as { __viewer?: HouseViewer }).__viewer = v;
    v.setModel(model);
    v.setMode(mode);
    onReady?.(v);
    return () => {
      v.dispose();
      viewer.current = null;
    };
    // The viewer lives for the component's lifetime; model and mode are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewer.current?.setModel(model);
  }, [model]);

  useEffect(() => {
    if (viewer.current && viewer.current.viewMode !== mode) viewer.current.setMode(mode);
  }, [mode]);

  return <div ref={ref} className="stage-3d" />;
}

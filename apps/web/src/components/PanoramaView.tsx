import { useEffect, useRef } from 'react';
import type { HomeModel } from '@rumah3d/core';
import { PanoramaViewer, type PanoramaStop } from '@rumah3d/viewer3d';

/** Stops for every room that has a Real View panorama. */
export function panoramaStops(model: HomeModel): PanoramaStop[] {
  return model.levels.flatMap((level) =>
    (level.panoramas ?? []).map((p) => ({
      id: p.roomId,
      name: level.rooms.find((r) => r.id === p.roomId)?.name ?? '',
      url: p.url,
      position: p.position,
      height: p.height,
    })),
  );
}

interface Props {
  model: HomeModel;
  startRoomId?: string;
  onRoomChange?: (roomId: string) => void;
  onReady?: (viewer: PanoramaViewer) => void;
}

/** React wrapper around the framework-free PanoramaViewer ("Real View"). */
export function PanoramaView({ model, startRoomId, onRoomChange, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const roomCb = useRef(onRoomChange);
  roomCb.current = onRoomChange;

  useEffect(() => {
    const level = model.levels[0]!;
    const stops = panoramaStops(model);
    if (!stops.length) return;
    const viewer = new PanoramaViewer(ref.current!, {
      stops,
      walls: level.walls,
      openings: level.openings,
      rooms: level.rooms,
      levelHeight: level.height,
      onStopChange: (id) => roomCb.current?.(id),
    });
    void viewer.show(stops.some((s) => s.id === startRoomId) ? startRoomId! : stops[0]!.id);
    onReady?.(viewer);
    return () => viewer.dispose();
    // Recreate only when the model changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  return <div ref={ref} className="stage-3d" />;
}

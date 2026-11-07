import { area, formatArea, rectangleSize, type Room } from '@homeset/core';

/** e.g. "3.6 × 3.2 m · 124 sq ft (11.5 m²)". L-shaped rooms show the area only. */
export function roomSizeText(room: Room): string {
  const dims = rectangleSize(room.polygon);
  const m = (mm: number) => (mm / 1000).toFixed(1);
  return `${dims ? `${m(dims[0])} × ${m(dims[1])} m · ` : ''}${formatArea(area(room.polygon))}`;
}

/** The room you are standing in and its real size, shown while walking through. */
export function RoomSize({ room }: { room: Room | undefined }) {
  if (!room) return null;
  return (
    <div className="room-size" aria-live="polite">
      <strong>{room.name}</strong>
      <span>{roomSizeText(room)}</span>
    </div>
  );
}

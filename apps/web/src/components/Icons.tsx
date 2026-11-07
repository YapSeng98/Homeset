const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icons = {
  select: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M5 3l14 8-6 2-3 6z" />
    </svg>
  ),
  wall: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M4 20V6h16" strokeWidth={4} />
    </svg>
  ),
  door: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M4 20h16M6 20V6M6 6a14 14 0 0 1 14 14" />
    </svg>
  ),
  'sliding-door': () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M3 20h18M4 9h10M10 15h10" />
      <path d="M17 6l3 3-3 3" />
    </svg>
  ),
  window: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <rect x="3" y="9" width="18" height="6" />
      <path d="M3 12h18" />
    </svg>
  ),
  opening: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M2 12h5M17 12h5" strokeWidth={4} />
      <path d="M8 12h8" strokeDasharray="2 2" />
    </svg>
  ),
  calibrate: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M3 17L17 3l4 4L7 21z" />
      <path d="M7 13l2 2M10 10l2 2M13 7l2 2" />
    </svg>
  ),
  upload: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  ),
  fit: () => (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  undo: () => (
    <svg viewBox="0 0 24 24" {...s} width={18} height={18}>
      <path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" />
    </svg>
  ),
  redo: () => (
    <svg viewBox="0 0 24 24" {...s} width={18} height={18}>
      <path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2" />
    </svg>
  ),
  back: () => (
    <svg viewBox="0 0 24 24" {...s} width={18} height={18}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  panel: () => (
    <svg viewBox="0 0 24 24" {...s} width={18} height={18}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </svg>
  ),
  area: () => (
    <svg viewBox="0 0 24 24" {...s} width={15} height={15} aria-hidden>
      <path d="M4 9V4h5M20 15v5h-5M4 4l16 16" />
    </svg>
  ),
  bed: () => (
    <svg viewBox="0 0 24 24" {...s} width={15} height={15} aria-hidden>
      <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M6 9V6h5v3M13 9V6h5v3" />
    </svg>
  ),
  bath: () => (
    <svg viewBox="0 0 24 24" {...s} width={15} height={15} aria-hidden>
      <path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2" />
    </svg>
  ),
  pin: () => (
    <svg viewBox="0 0 24 24" {...s} width={15} height={15} aria-hidden>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  plan: () => (
    <svg viewBox="0 0 24 24" {...s} aria-hidden>
      <path d="M3 4h18v16H3zM3 12h8V4M11 16v4M15 4v6h6" />
    </svg>
  ),
  cube: () => (
    <svg viewBox="0 0 24 24" {...s} aria-hidden>
      <path d="M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10" />
    </svg>
  ),
  pano: () => (
    <svg viewBox="0 0 24 24" {...s} aria-hidden>
      <ellipse cx="12" cy="12" rx="9" ry="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  ),
  share: () => (
    <svg viewBox="0 0 24 24" {...s} aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" {...s} width={16} height={16} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  whatsapp: () => (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z" />
    </svg>
  ),
};

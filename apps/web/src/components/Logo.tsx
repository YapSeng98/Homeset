import { Link } from 'react-router-dom';

/** House outline on an evergreen tile, with a brass door. */
export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M8 15.2 16 8.6l8 6.6" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6 13.6V23.4h10.8V13.6" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14.1" y="17.2" width="3.8" height="6.2" rx="1" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo">
      <LogoMark />
      <span className="logo-word">Homeset</span>
    </Link>
  );
}

import { Link } from 'react-router-dom';

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden>
      <path d="M4 15 16 5l12 10v12H4z" fill="var(--brand)" />
      <path d="M12 27v-8h8v8" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo">
      <LogoMark />
      rumah3d
    </Link>
  );
}

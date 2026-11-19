'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';

const LINKS = [
  { href: '/', label: 'Run' },
  { href: '/results', label: 'Results' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/dashboard', label: 'Dashboard' },
];

export default function Nav() {
  const path = usePathname() || '/';
  if (path === '/login') {
    return (
      <header className="topbar">
        <div className="wrap">
          <span className="wordmark">
            SPRINTO <span>· Outreach Desk</span>
          </span>
        </div>
      </header>
    );
  }
  return (
    <header className="topbar">
      <div className="wrap">
        <Link href="/" className="wordmark" aria-label="Sprinto Outreach Desk, home">
          SPRINTO <span>· Outreach Desk</span>
        </Link>
        <nav className="navlinks" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/#run" className="btn btn-on-plum btn-small btn-cta">
          <Icon name="play" /> Run a list
        </Link>
      </div>
    </header>
  );
}

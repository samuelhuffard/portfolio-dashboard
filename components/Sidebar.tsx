'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PortfolioRole } from '@/lib/rbac';

type NavItem = {
  href: string;
  label: string | Record<PortfolioRole, string>;
  roles: PortfolioRole[];
};

const links: NavItem[] = [
  { href: '/', label: 'Command', roles: ['FundManager'] },
  { href: '/holdings', label: 'Positions', roles: ['FundManager'] },
  { href: '/investors', label: { FundManager: 'Investors', Client: 'My Investment' }, roles: ['FundManager', 'Client'] },
  { href: '/agents', label: 'Agents', roles: ['FundManager'] },
  { href: '/portfolio-manager', label: 'Agent 4', roles: ['FundManager'] },
  { href: '/research', label: 'Labs', roles: ['FundManager'] },
];

/**
 * A deliberately quiet, traditional portal header. The file keeps its historical
 * name so existing imports remain stable while navigation moves from the terminal
 * sidebar to a top-level client portal.
 */
export default function Sidebar({ role }: { role: PortfolioRole }) {
  const pathname = usePathname();
  const visibleLinks = links.filter((link) => link.roles.includes(role));

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(252,252,249,.94)] backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-[1540px] items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Link href={role === 'Client' ? '/investors' : '/'} className="flex shrink-0 items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-[var(--ink)] font-serif text-sm font-semibold text-white">PM</span>
          <span className="hidden sm:block">
            <span className="block font-serif text-lg font-semibold leading-none tracking-[-0.025em] text-[var(--ink)]">Portfolio Manager</span>
            <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Private wealth office</span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="ml-auto flex items-center gap-1 overflow-x-auto">
          {visibleLinks.map((link) => {
            const active = pathname === link.href;
            const label = typeof link.label === 'string' ? link.label : link.label[role];
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative whitespace-nowrap px-2.5 py-5 text-sm transition-colors sm:px-3 ${
                  active ? 'font-semibold text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {label}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[var(--forest)]" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-1 shrink-0 border-l border-[var(--line)] pl-3">
          <UserButton />
        </div>
      </div>
    </header>
  );
}

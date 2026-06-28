'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { PortfolioRole } from '@/lib/rbac';

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 2l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function HoldingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

function RecommendationsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18.7 8 13 13.7 9 9.7 3.7 15" />
    </svg>
  );
}

function NewsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M16 4h2a2 2 0 0 1 2 2v12" />
      <path d="M8 8h6M8 12h6M8 16h4" />
    </svg>
  );
}

function StrategyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="8" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="12" cy="6" r="2.5" />
      <path d="M3 19c0-2.5 1.5-4 3-4s3 1.5 3 4M15 19c0-2.5 1.5-4 3-4s3 1.5 3 4M9 19c0-2.5 1.5-4 3-4s3 1.5 3 4" />
    </svg>
  );
}

function InvestorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v2M12 15v2M9.5 9.5c0-1 .9-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.1-5 1.4-5 3.6 0 1 1 1.6 2.5 1.6s2.5-.5 2.5-1.5" />
    </svg>
  );
}

function ApprovalsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" />
      <path d="m7 12 3 3 7-7" />
    </svg>
  );
}

function ResearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CompareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13a9 9 0 1 0 2.13-6.36L3 8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const links: Array<{
  href: string;
  label: string | Record<PortfolioRole, string>;
  Icon: (props: { className?: string }) => React.ReactNode;
  code: string;
  roles: PortfolioRole[];
}> = [
  { href: '/', label: 'Command', Icon: HomeIcon, code: '01', roles: ['FundManager'] },
  { href: '/holdings', label: 'Positions', Icon: HoldingsIcon, code: '02', roles: ['FundManager'] },
  {
    href: '/recommendations',
    label: { FundManager: 'Signals', Client: 'Client Signals' },
    Icon: RecommendationsIcon,
    code: '03',
    roles: ['FundManager', 'Client'],
  },
  { href: '/research', label: 'Analyst Lab', Icon: ResearchIcon, code: '04', roles: ['FundManager'] },
  { href: '/compare', label: 'Comps', Icon: CompareIcon, code: '05', roles: ['FundManager'] },
  { href: '/history', label: 'Archive', Icon: HistoryIcon, code: '06', roles: ['FundManager'] },
  { href: '/news', label: 'Catalysts', Icon: NewsIcon, code: '07', roles: ['FundManager', 'Client'] },
  { href: '/strategy', label: 'Mandate', Icon: StrategyIcon, code: '08', roles: ['FundManager'] },
  { href: '/agents', label: 'Agents', Icon: AgentsIcon, code: '09', roles: ['FundManager'] },
  { href: '/approvals', label: 'Approvals', Icon: ApprovalsIcon, code: '10', roles: ['FundManager'] },
  {
    href: '/investors',
    label: { FundManager: 'Investors', Client: 'My Investment' },
    Icon: InvestorsIcon,
    code: '11',
    roles: ['FundManager', 'Client'],
  },
];

export default function Sidebar({ role }: { role: PortfolioRole }) {
  const pathname = usePathname();
  const visibleLinks = links.filter((link) => link.roles.includes(role));

  return (
    <>
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:flex-col border-r border-white/10 bg-[#05080d]/92 px-5 py-6 text-slate-100 shadow-[22px_0_80px_rgba(0,0,0,.34)] backdrop-blur-xl">
        <div className="mb-7 border-b border-white/10 pb-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center border border-emerald-300/40 bg-emerald-300/10 text-lg font-black text-emerald-200 shadow-[0_0_36px_rgba(0,255,178,.18)]">
              PM
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/70">Private Desk</p>
              <p className="text-lg font-semibold tracking-tight text-white">Portfolio OS</p>
            </div>
            <div className="ml-auto">
              <UserButton />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <div className="border border-white/10 bg-white/[0.03] p-2">
              <p className="text-slate-500">Mode</p>
              <p className="mt-1 text-emerald-300">{role === 'FundManager' ? 'Manager' : 'Client'}</p>
            </div>
            <div className="border border-white/10 bg-white/[0.03] p-2">
              <p className="text-slate-500">Desk</p>
              <p className="mt-1 text-amber-200">AI + Quant</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {visibleLinks.map(({ href, label, Icon, code }) => {
            const active = pathname === href;
            const resolvedLabel = typeof label === 'string' ? label : label[role];
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 overflow-hidden border px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-emerald-300/35 bg-emerald-300/[0.08] text-white shadow-[0_0_32px_rgba(0,255,178,.09)]'
                    : 'border-white/5 bg-white/[0.025] text-slate-400 hover:border-cyan-200/20 hover:bg-cyan-200/[0.04] hover:text-slate-100'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-y-0 left-0 w-1 bg-emerald-300"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10 w-7 font-mono text-[10px] text-slate-500">{code}</span>
                <Icon className={`relative z-10 h-4 w-4 ${active ? 'text-emerald-300' : 'text-slate-500 group-hover:text-cyan-200'}`} />
                <span className="relative z-10">{resolvedLabel}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border border-amber-200/15 bg-amber-200/[0.04] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-200/70">Risk Console</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Recommendations become approval-gated MCP execution requests. Dashboard APIs never place orders.
          </p>
        </div>
      </aside>

      <nav className="fixed inset-x-2 bottom-2 z-50 grid grid-cols-4 gap-1 border border-white/10 bg-[#05080d]/95 p-2 shadow-[0_18px_60px_rgba(0,0,0,.55)] backdrop-blur-xl lg:hidden">
        {visibleLinks.map(({ href, label, Icon }) => {
          const active = pathname === href;
          const resolvedLabel = typeof label === 'string' ? label : label[role];
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-1 px-2 py-2 text-[10px] ${active ? 'bg-emerald-300/10 text-emerald-200' : 'text-slate-500'}`}>
              <Icon className="h-4 w-4" />
              <span className="truncate">{resolvedLabel}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

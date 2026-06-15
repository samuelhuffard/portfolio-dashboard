'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

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

const links = [
  { href: '/', label: 'Command', Icon: HomeIcon, code: '01' },
  { href: '/holdings', label: 'Positions', Icon: HoldingsIcon, code: '02' },
  { href: '/recommendations', label: 'Signals', Icon: RecommendationsIcon, code: '03' },
  { href: '/research', label: 'Analyst Lab', Icon: ResearchIcon, code: '04' },
  { href: '/compare', label: 'Comps', Icon: CompareIcon, code: '05' },
  { href: '/history', label: 'Archive', Icon: HistoryIcon, code: '06' },
  { href: '/news', label: 'Catalysts', Icon: NewsIcon, code: '07' },
  { href: '/strategy', label: 'Mandate', Icon: StrategyIcon, code: '08' },
];

export default function Sidebar() {
  const pathname = usePathname();

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
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <div className="border border-white/10 bg-white/[0.03] p-2">
              <p className="text-slate-500">Mode</p>
              <p className="mt-1 text-emerald-300">Live</p>
            </div>
            <div className="border border-white/10 bg-white/[0.03] p-2">
              <p className="text-slate-500">Desk</p>
              <p className="mt-1 text-amber-200">AI + Quant</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {links.map(({ href, label, Icon, code }) => {
            const active = pathname === href;
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
                <span className="relative z-10">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border border-amber-200/15 bg-amber-200/[0.04] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-200/70">Risk Console</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Recommendations are research signals only. Execution stays manual.
          </p>
        </div>
      </aside>

      <nav className="fixed inset-x-2 bottom-2 z-50 grid grid-cols-4 gap-1 border border-white/10 bg-[#05080d]/95 p-2 shadow-[0_18px_60px_rgba(0,0,0,.55)] backdrop-blur-xl lg:hidden">
        {links.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-1 px-2 py-2 text-[10px] ${active ? 'bg-emerald-300/10 text-emerald-200' : 'text-slate-500'}`}>
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

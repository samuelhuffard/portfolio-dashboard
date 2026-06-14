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

const links = [
  { href: '/', label: 'Overview', Icon: HomeIcon },
  { href: '/holdings', label: 'Holdings', Icon: HoldingsIcon },
  { href: '/recommendations', label: 'Recommendations', Icon: RecommendationsIcon },
  { href: '/news', label: 'News', Icon: NewsIcon },
  { href: '/strategy', label: 'Strategy', Icon: StrategyIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-56 bg-slate-900 text-slate-100 px-4 py-6">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900">
            P
          </div>
          <span className="font-semibold text-lg tracking-tight">Portfolio</span>
        </div>

        <nav className="flex flex-col gap-1">
          {links.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 bg-slate-800 rounded-lg"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className={`relative z-10 w-4 h-4 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className={`relative z-10 ${active ? 'text-white' : 'text-slate-300'}`}>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-slate-900 border-t border-slate-800 flex justify-around py-2">
        {links.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 px-2 py-1 text-[11px]">
              <Icon className={`w-5 h-5 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className={active ? 'text-white' : 'text-slate-400'}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

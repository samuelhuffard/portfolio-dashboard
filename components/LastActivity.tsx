'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 45_000;

type ActivityPayload = {
  activity: { job: string; label: string; ts: string; ok: boolean; durationMs?: number; error?: string; skippedHoliday?: string } | null;
  scanRunning: boolean;
  syncRunning: boolean;
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms)) return '';
  const s = ms / 1000;
  if (s < 5) return 'just now';
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Sidebar panel replacing the static "Risk Console" blurb. PM runs as scheduled
// jobs on the Jetson rather than a 24/7 loop (unlike Athena, whose ActivityBar
// rotates live events at the top of every page), so instead of a rotating feed
// this shows the single most-recently-finished job — the honest "last thing
// the system did" for a cron-driven system.
export default function LastActivity() {
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/activity');
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (alive) {
          setData(json);
          setOffline(false);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const running = data?.scanRunning || data?.syncRunning;
  const runningLabel = data?.scanRunning ? 'Research scan' : data?.syncRunning ? 'Holdings sync' : '';
  const activity = data?.activity;

  let dot = 'bg-slate-500';
  let heading = 'No activity yet';
  let detail = '';
  if (offline) {
    dot = 'bg-rose-400';
    heading = 'Offline';
    detail = "Can't reach the Jetson.";
  } else if (running) {
    dot = 'bg-emerald-300 animate-pulse';
    heading = `${runningLabel} — running`;
    detail = 'In progress now.';
  } else if (activity) {
    dot = activity.ok ? 'bg-emerald-300' : 'bg-rose-400';
    heading = activity.label;
    detail = activity.skippedHoliday
      ? `Skipped — ${activity.skippedHoliday}`
      : activity.ok
        ? `Completed ${timeAgo(activity.ts)}`
        : `Failed ${timeAgo(activity.ts)}${activity.error ? ` — ${activity.error}` : ''}`;
  }

  return (
    <div className="mt-auto border border-amber-200/15 bg-amber-200/[0.04] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-200/70">Last Activity</p>
      <div className="mt-2 flex items-start gap-2">
        <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-200">{heading}</p>
          {detail && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { AGENTS } from '@/lib/agents';
import type { ChatMessage } from '@/lib/agentChat';
import type { AgentBook } from '@/lib/agent-books';

function agentLabel(id: string, name: string): string {
  if (name) return name;
  const n = id.split('-')[1];
  return `Agent ${n}`;
}

function fmtUsd(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function AgentBookPanel({ agentId }: { agentId: string }) {
  const [book, setBook] = useState<AgentBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBook(null);
    setError(null);
    fetch(`/api/agents/${agentId}/book`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setBook(json.book);
      })
      .catch((err) => setError(err.message));
  }, [agentId]);

  if (error) return null; // non-critical panel — chat is the primary surface, fail quiet
  if (!book) return <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">Loading book...</p>;

  return (
    <div className="terminal-panel space-y-3 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Attributed Book</p>
      <div className="flex flex-wrap gap-4 font-mono text-xs">
        <span className="text-slate-400">
          Unrealized: <span className={book.unrealizedGain >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtUsd(book.unrealizedGain)}</span>
        </span>
        <span className="text-slate-400">
          Realized: <span className={book.realizedGain >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtUsd(book.realizedGain)}</span>
        </span>
        <span className="text-slate-400">
          Win rate: <span className="text-slate-200">{book.winRatePct != null ? `${book.winRatePct}%` : '—'}</span> ({book.closedTradeCount} closed)
        </span>
      </div>
      {book.positions.length > 0 && (
        <div className="space-y-1">
          {book.positions.map((p) => (
            <div key={p.ticker} className="flex justify-between font-mono text-xs text-slate-400">
              <span>{p.ticker} · {p.sharesOpen} sh</span>
              <span className={(p.unrealizedGain ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtUsd(p.unrealizedGain)}</span>
            </div>
          ))}
        </div>
      )}
      {book.positions.length === 0 && <p className="font-mono text-xs text-slate-500">No open positions attributed to this agent yet.</p>}
    </div>
  );
}

export default function AgentsPage() {
  const [activeId, setActiveId] = useState(AGENTS[0].id);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/agents/${activeId}/chat`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setHistory(json.history ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, sending]);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    setHistory((h) => [...h, { role: 'user', content: message, ts: new Date().toISOString() }]);

    try {
      const res = await fetch(`/api/agents/${activeId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setHistory((h) => [...h, { role: 'assistant', content: json.reply, ts: new Date().toISOString() }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (clearing || sending) return;
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${activeId}/chat`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-2.5rem)] max-w-4xl flex-col gap-4 lg:h-[calc(100vh-5.5rem)]">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Independent Desks</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Agents</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Three fully independent research agents — separate watchlists, spreadsheets, and memory. No
          personality assigned yet; each one will be named after its investment philosophy later.
        </p>
      </div>

      <div className="flex gap-2 border border-white/10 bg-white/[0.02] p-2">
        {AGENTS.map((a) => {
          const active = a.id === activeId;
          return (
            <button
              key={a.id}
              onClick={() => setActiveId(a.id)}
              className={`flex-1 border px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] transition-colors ${
                active
                  ? 'border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-200'
                  : 'border-white/5 bg-transparent text-slate-500 hover:border-cyan-200/20 hover:text-slate-200'
              }`}
            >
              {agentLabel(a.id, a.name)}
            </button>
          );
        })}
        <button
          onClick={clearChat}
          disabled={clearing || sending || history.length === 0}
          className="border border-red-300/25 bg-red-300/[0.04] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200/80 transition-colors hover:border-red-300/40 hover:bg-red-300/[0.08] disabled:opacity-40"
        >
          {clearing ? 'Clearing...' : 'Clear chat'}
        </button>
      </div>

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <AgentBookPanel agentId={activeId} />

      <div className="terminal-panel flex flex-1 flex-col overflow-hidden p-0">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {loading ? (
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading...</p>
          ) : history.length === 0 ? (
            <p className="font-mono text-sm text-slate-500">
              No conversation yet with {agentLabel(activeId, AGENTS.find((a) => a.id === activeId)?.name ?? '')}. Ask it about
              its watchlist, recent recommendations, or track record.
            </p>
          ) : (
            history.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap border px-4 py-3 text-sm leading-6 ${
                    m.role === 'user'
                      ? 'border-cyan-200/25 bg-cyan-200/[0.06] text-slate-100'
                      : 'border-emerald-300/25 bg-emerald-300/[0.05] text-slate-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-200/70">Thinking...</p>}
        </div>

        <div className="flex items-end gap-3 border-t border-white/10 p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={`Message ${agentLabel(activeId, AGENTS.find((a) => a.id === activeId)?.name ?? '')}...`}
            className="flex-1 resize-none border border-white/10 bg-black/30 p-3 font-mono text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

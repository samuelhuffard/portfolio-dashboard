"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CashFlow } from "@/lib/portfolio-chart";
import type { Holding, PerformanceRow } from "@/lib/sheets";

export interface PortfolioResponse {
  holdings: Holding[];
  cash: number | null;
  lastSynced: string | null;
  performance: PerformanceRow[];
  cashFlows: CashFlow[];
  totals: {
    totalValue: number;
    totalMarketValue: number;
    totalCostBasis: number;
    totalGainLoss: number;
    totalGainLossPct: number | null;
  };
}

interface PortfolioState {
  data: PortfolioResponse | null;
  error: string | null;
  loading: boolean;
}

const PortfolioContext = createContext<PortfolioState>({
  data: null,
  error: null,
  loading: true,
});

export const REFRESH_INTERVAL_MS = 300_000;

/**
 * Hoists the `/api/portfolio` read to the shell so the header's sync block, the
 * context strip's as-of date and the screens that need holdings all read one
 * response instead of issuing the same request several times per page.
 *
 * Screens backed by other endpoints (investors, agents, research) keep their
 * own fetches.
 */
export function PortfolioProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<PortfolioState>({ data: null, error: null, loading: enabled });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let active = true;

    function load() {
      fetch("/api/portfolio")
        .then((res) => res.json())
        .then((json) => {
          if (!active) return;
          if (json.error) setState({ data: null, error: json.error, loading: false });
          else setState({ data: json, error: null, loading: false });
        })
        .catch((err: unknown) => {
          if (!active) return;
          setState({
            data: null,
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        });
    }

    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled]);

  return <PortfolioContext.Provider value={state}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioState {
  return useContext(PortfolioContext);
}

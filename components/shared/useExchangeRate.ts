"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentExchangeRate } from "@/app/dashboard/settings/services/exchange-rate.services";

interface ExchangeRateState {
  rate: number | null;
  effectiveAt: string | null;
  isLoading: boolean;
  error: string | null;
}

let cached: {
  rate: number | null;
  effectiveAt: string | null;
  at: number;
} | null = null;

const CACHE_MS = 60_000;

async function fetchCurrentRate() {
  const result = await getCurrentExchangeRate();

  return {
    rate: result.rate != null ? Number(result.rate) : null,
    effectiveAt: result.effectiveAt ?? null,
  };
}

export function useExchangeRate() {
  const [state, setState] = useState<ExchangeRateState>(() => ({
    rate: cached?.rate ?? null,
    effectiveAt: cached?.effectiveAt ?? null,
    isLoading: !cached,
    error: null,
  }));

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));

    try {
      const data = await fetchCurrentRate();
      cached = { ...data, at: Date.now() };
      setState({ ...data, isLoading: false, error: null });
      return data.rate;
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : "تعذر جلب سعر الصرف",
      }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (cached && Date.now() - cached.at < CACHE_MS) return;

    let active = true;

    fetchCurrentRate()
      .then((data) => {
        cached = { ...data, at: Date.now() };
        if (active) setState({ ...data, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (active) {
          setState((current) => ({
            ...current,
            isLoading: false,
            error:
              error instanceof Error ? error.message : "تعذر جلب سعر الصرف",
          }));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { ...state, refresh };
}

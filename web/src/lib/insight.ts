import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/** The AI headline from the spending-insights function (cached on the server until your data or the day changes). */
export type InsightResponse = {
  period: { key: string; from: string; to: string; daysElapsed: number; daysTotal: number; ongoing: boolean };
  totals: { thisPeriod: number; sameTimeLastPeriod: number; lastPeriodFull: number; projectedThisPeriod: number | null };
  headline: string;
  detail: string;
  highlights: { text: string; tone: "up" | "down" | "neutral" }[];
  tip: string | null;
  generatedAt: string | null;
};

/** Loads the insight on mount; `load(true)` asks the server for a fresh one. */
export function useInsight() {
  const [result, setResult] = useState<InsightResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke<InsightResponse>("spending-insights", {
      body: { refresh },
    });
    if (invokeError || !data || typeof data.headline !== "string") setError("Couldn't load your insight. Please try again.");
    else setResult(data);
    setBusy(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { result, busy, error, load };
}

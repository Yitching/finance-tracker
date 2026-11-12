import { useEffect, useState } from "react";

const COMMON = [30, 60, 90, 120, 144, 165];

/** 1000 / median frame time, snapped to a common refresh rate when it's within 8%. */
export function framesPerSecond(deltas: number[]): number | null {
  const ok = deltas.filter((d) => d > 2 && d < 100).sort((a, b) => a - b);
  if (ok.length < 10) return null;
  const median = ok[Math.floor(ok.length / 2)];
  const fps = 1000 / median;
  const near = COMMON.find((r) => Math.abs(fps - r) / r < 0.08);
  return near ?? Math.round(fps);
}

/** Whether we're running as the installed app rather than a browser tab. */
export const isInstalledApp = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Measures how often the screen actually draws for this page, refreshed every
 * couple of seconds while the component is on screen. null until measured.
 */
export function useFrameRate() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let deltas: number[] = [];
    const tick = (t: number) => {
      if (last) deltas.push(t - last);
      last = t;
      if (deltas.length >= 90) {
        setFps(framesPerSecond(deltas));
        deltas = [];
      }
      raf = requestAnimationFrame(tick);
    };
    // Measure only while visible: hidden tabs are throttled and would read low.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      last = 0;
      deltas = [];
      if (document.visibilityState === "visible") raf = requestAnimationFrame(tick);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return fps;
}

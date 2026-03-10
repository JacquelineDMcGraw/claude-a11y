import { spawn, execFileSync } from "node:child_process";

/**
 * Convert words-per-minute to spd-say percentage (-100 to +100).
 * spd-say treats 0 as normal speed (~170 WPM). The scale is roughly
 * linear: +100 is about double speed, -100 is about half.
 */
export function wpmToSpdRate(wpm: number): number {
  const baseline = 170;
  const pct = Math.round(((wpm - baseline) / baseline) * 100);
  return Math.max(-100, Math.min(100, pct));
}

/**
 * Speak text using Linux speech-dispatcher (`spd-say`) or `espeak` fallback.
 * Fire-and-forget: detached + unref.
 */
export function speakLinux(text: string, rate: number): void {
  const engine = detectLinuxEngine();
  if (engine === "spd-say") {
    const spdRate = wpmToSpdRate(rate);
    const child = spawn("spd-say", ["-r", String(spdRate), "--", text], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } else {
    const child = spawn("espeak", ["-s", String(rate), "--", text], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
}

let cachedEngine: "spd-say" | "espeak" | null = null;

function detectLinuxEngine(): "spd-say" | "espeak" {
  if (cachedEngine) return cachedEngine;
  try {
    execFileSync("which", ["spd-say"], { stdio: "ignore" });
    cachedEngine = "spd-say";
  } catch {
    cachedEngine = "espeak";
  }
  return cachedEngine;
}

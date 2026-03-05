import { spawn, execFileSync } from "node:child_process";

/**
 * Speak text using Linux speech-dispatcher (`spd-say`) or `espeak` fallback.
 * Fire-and-forget: detached + unref.
 */
export function speakLinux(text: string, rate: number): void {
  const engine = detectLinuxEngine();
  if (engine === "spd-say") {
    const child = spawn("spd-say", ["-r", String(rate), "--", text], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } else {
    // espeak uses words-per-minute directly
    const child = spawn("espeak", ["-s", String(rate), "--", text], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
}

function detectLinuxEngine(): "spd-say" | "espeak" {
  try {
    execFileSync("which", ["spd-say"], { stdio: "ignore" });
    return "spd-say";
  } catch {
    return "espeak";
  }
}

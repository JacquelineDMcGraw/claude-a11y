import { spawn } from "node:child_process";

/**
 * Play a sound file on macOS using afplay.
 * Fire-and-forget: detached + unref.
 */
export function playMacos(soundPath: string, volume: number): void {
  const child = spawn("afplay", ["-v", String(volume), "--", soundPath], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}

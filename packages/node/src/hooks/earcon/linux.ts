import { spawn } from "node:child_process";

/**
 * Convert a linear 0.0–1.0 volume to decibels for canberra-gtk-play.
 * canberra-gtk-play --volume expects dB: 0 = full, negative = quieter.
 */
function linearToDb(volume: number): number {
  const clamped = Math.max(0, Math.min(1, volume));
  if (clamped <= 0) return -60;
  return Math.round(20 * Math.log10(clamped));
}

/**
 * Play a sound on Linux using canberra-gtk-play.
 * Fire-and-forget: detached + unref.
 */
export function playLinux(soundName: string, volume: number): void {
  const child = spawn(
    "canberra-gtk-play",
    ["-i", soundName, "--volume", String(linearToDb(volume))],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

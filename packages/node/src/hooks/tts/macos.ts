import { spawn } from "node:child_process";

/**
 * Speak text using macOS `say` command.
 * Fire-and-forget: detached + unref.
 */
export function speakMacos(text: string, rate: number): void {
  const child = spawn("say", ["-r", String(rate), "--", text], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}

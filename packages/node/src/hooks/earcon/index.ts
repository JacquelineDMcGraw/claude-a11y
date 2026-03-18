import type { EarconConfig } from "../config/types.js";
import { EARCON_IDS, MACOS_SOUNDS, LINUX_SOUNDS } from "./sounds.js";
import { playMacos } from "./macos.js";
import { playLinux } from "./linux.js";

export type { EarconId } from "./sounds.js";
export { EARCON_IDS } from "./sounds.js";

/**
 * Play an earcon sound. Fire-and-forget — never fatal.
 * Returns immediately if earcons are disabled or the ID is unknown.
 */
export function playEarcon(earconId: string, config: EarconConfig): void {
  if (!config.enabled) return;

  // Check user overrides
  const override = config.overrides[earconId];
  if (override === false) return; // explicitly disabled

  // Validate earcon ID (unless it's a custom override path)
  if (!override && !EARCON_IDS.has(earconId)) return;

  const platform = detectPlatform(config.engine);

  try {
    if (platform === "macos") {
      const soundPath = override || MACOS_SOUNDS[earconId as keyof typeof MACOS_SOUNDS];
      if (!soundPath) return;
      playMacos(soundPath, config.volume);
    } else {
      const soundName = override || LINUX_SOUNDS[earconId as keyof typeof LINUX_SOUNDS];
      if (!soundName) return;
      playLinux(soundName, config.volume);
    }
  } catch {
    // Earcon failure is never fatal
  }
}

function detectPlatform(engine: EarconConfig["engine"]): "macos" | "linux" {
  if (engine === "afplay") return "macos";
  if (engine === "paplay" || engine === "canberra-gtk-play") return "linux";
  // "auto" — detect from platform
  return process.platform === "darwin" ? "macos" : "linux";
}

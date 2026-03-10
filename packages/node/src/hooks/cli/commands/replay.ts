import { loadConfig } from "../../config/index.js";
import { loadMostRecentDigest } from "../../core/digest.js";
import { speak } from "../../tts/index.js";

/**
 * Replay the most recent digest summary via TTS.
 */
export function replayCommand(): void {
  const config = loadConfig();
  const ttsText = loadMostRecentDigest();

  if (!ttsText) {
    console.log("No digest available to replay.");
    return;
  }

  console.log(ttsText);

  if (config.tts.enabled) {
    speak(ttsText, config.tts);
  }
}

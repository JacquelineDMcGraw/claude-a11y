import { readStdin } from "../utils/stdin.js";
import { loadConfig } from "../../config/index.js";
import { processHookEvent, parseHookEvent } from "../../core/pipeline.js";
import { speak } from "../../tts/index.js";
import { playEarcon } from "../../earcon/index.js";
import { appendToHistory } from "../../core/history.js";

/**
 * Format command handler. Called on every hook invocation (PostToolUse,
 * Notification, PermissionRequest, etc.).
 * MUST always write valid JSON to stdout. MUST never exit non-zero.
 */
export async function formatCommand(): Promise<void> {
  try {
    const raw = await readStdin(process.stdin, { timeoutMs: 5000, maxBytes: 5_000_000 });
    const config = loadConfig();
    const result = processHookEvent(raw, config);

    // stdout first, always — never blocked by audio
    process.stdout.write(JSON.stringify(result.hookOutput));

    // Earcon (fire-and-forget)
    if (result.earcon && config.earcon.enabled) {
      playEarcon(result.earcon, config.earcon);
    }

    // TTS (fire-and-forget)
    if (result.ttsText && config.tts.enabled) {
      speak(result.ttsText, config.tts);
    }

    // History recording (non-fatal)
    if (config.history.enabled) {
      try {
        const event = parseHookEvent(raw);
        const toolName =
          "tool_name" in event ? (event as { tool_name: string }).tool_name : undefined;
        appendToHistory(
          event.session_id,
          {
            timestamp: Date.now(),
            eventName: event.hook_event_name,
            toolName,
            ttsText: result.ttsText,
            earcon: result.earcon,
          },
          config.history.maxEntries,
        );
      } catch {
        // History failure is never fatal
      }
    }
  } catch {
    // ALWAYS return valid JSON, even on total failure
    process.stdout.write(JSON.stringify({}));
  }
}

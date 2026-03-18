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
  let stdoutWritten = false;
  try {
    const raw = await readStdin(process.stdin, { timeoutMs: 5000, maxBytes: 5_000_000 });
    const config = loadConfig();
    const result = processHookEvent(raw, config);

    // stdout first, always — never blocked by audio
    process.stdout.write(JSON.stringify(result.hookOutput));
    stdoutWritten = true;

    // Earcon, TTS, and history are non-fatal side effects.
    // Wrap them so they never reach the outer catch (which would double-write stdout).
    try {
      if (result.earcon && config.earcon.enabled) {
        playEarcon(result.earcon, config.earcon);
      }

      if (result.ttsText && config.tts.enabled) {
        speak(result.ttsText, config.tts);
      }

      if (config.history.enabled) {
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
      }
    } catch {
      // Side-effect failures are never fatal
    }
  } catch {
    // ALWAYS return valid JSON, even on total failure
    if (!stdoutWritten) {
      process.stdout.write(JSON.stringify({}));
    }
  }
}

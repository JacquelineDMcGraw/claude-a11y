/**
 * Earcon ID type and default OS sound mappings.
 */

export type EarconId =
  | "edit-complete"
  | "test-pass"
  | "test-fail"
  | "error"
  | "agent-start"
  | "agent-stop"
  | "done"
  | "permission"
  | "task-complete"
  | "notification";

/** macOS system sound paths mapped to earcon IDs. */
export const MACOS_SOUNDS: Record<EarconId, string> = {
  "edit-complete": "/System/Library/Sounds/Tink.aiff",
  "test-pass": "/System/Library/Sounds/Glass.aiff",
  "test-fail": "/System/Library/Sounds/Basso.aiff",
  "error": "/System/Library/Sounds/Sosumi.aiff",
  "agent-start": "/System/Library/Sounds/Blow.aiff",
  "agent-stop": "/System/Library/Sounds/Bottle.aiff",
  "done": "/System/Library/Sounds/Hero.aiff",
  "permission": "/System/Library/Sounds/Funk.aiff",
  "task-complete": "/System/Library/Sounds/Ping.aiff",
  "notification": "/System/Library/Sounds/Pop.aiff",
};

/** Linux freedesktop sound theme names mapped to earcon IDs. */
export const LINUX_SOUNDS: Record<EarconId, string> = {
  "edit-complete": "message",
  "test-pass": "complete",
  "test-fail": "dialog-error",
  "error": "dialog-warning",
  "agent-start": "service-login",
  "agent-stop": "service-logout",
  "done": "bell",
  "permission": "dialog-question",
  "task-complete": "message-new-instant",
  "notification": "message-new-email",
};

/** All valid earcon IDs for validation. */
export const EARCON_IDS: ReadonlySet<string> = new Set<string>([
  "edit-complete",
  "test-pass",
  "test-fail",
  "error",
  "agent-start",
  "agent-stop",
  "done",
  "permission",
  "task-complete",
  "notification",
]);

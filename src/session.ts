/**
 * Session ID tracking for multi-turn conversations.
 *
 * Captures the session_id from Claude's init message and provides it
 * for subsequent turns using --resume.
 */

export interface SessionState {
  /** Current session ID, or null if no session started */
  sessionId: string | null;
  /** Total accumulated cost in USD */
  totalCost: number;
  /** Total number of turns across all interactions */
  totalTurns: number;
}

export function createSessionState(initialSessionId?: string): SessionState {
  return {
    sessionId: initialSessionId ?? null,
    totalCost: 0,
    totalTurns: 0,
  };
}

/**
 * Update session state with a new session ID (from init message).
 */
export function updateSessionId(state: SessionState, sessionId: string): void {
  state.sessionId = sessionId;
}

/**
 * Accumulate cost and turn count from a result message.
 */
export function updateFromResult(
  state: SessionState,
  cost: number,
  turns: number
): void {
  state.totalCost += cost;
  state.totalTurns += turns;
}

/**
 * Reset session state for a new conversation.
 */
export function resetSession(state: SessionState): void {
  state.sessionId = null;
  state.totalCost = 0;
  state.totalTurns = 0;
}

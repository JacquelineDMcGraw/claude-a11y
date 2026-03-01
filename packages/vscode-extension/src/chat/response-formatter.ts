/**
 * Response formatter for the chat participant.
 *
 * Buffers streaming text at paragraph boundaries, formats each complete
 * paragraph through the speech formatter, and streams formatted output.
 * This gives near-streaming behavior while maintaining correct AST parsing.
 */

import { formatForSpeech, createVerbosityFilter } from "@claude-accessible/core";
import type { VerbosityLevel } from "@claude-accessible/core";

export class ParagraphBuffer {
  private buffer = "";
  private verbosity: VerbosityLevel;

  constructor(verbosity: VerbosityLevel = "normal") {
    this.verbosity = verbosity;
  }

  /**
   * Append a text chunk. Returns any complete paragraphs that are ready
   * to be formatted and emitted.
   */
  append(chunk: string): string[] {
    this.buffer += chunk;
    return this.drainComplete();
  }

  /**
   * Flush any remaining buffered content. Call when the stream ends.
   */
  flush(): string {
    if (!this.buffer.trim()) return "";
    const text = this.buffer;
    this.buffer = "";
    return this.format(text);
  }

  private drainComplete(): string[] {
    const results: string[] = [];

    // Split on double newlines (paragraph boundaries)
    // But DON'T split inside code fences
    const parts = this.splitAtParagraphBoundaries();

    for (const part of parts) {
      results.push(this.format(part));
    }

    return results;
  }

  private splitAtParagraphBoundaries(): string[] {
    const ready: string[] = [];
    const doubleNewline = "\n\n";
    let inCodeFence = false;

    while (true) {
      const idx = this.buffer.indexOf(doubleNewline);
      if (idx === -1) break;

      const candidate = this.buffer.slice(0, idx);

      // Check if we're inside a code fence
      const fenceCount = (candidate.match(/^```/gm) || []).length;
      inCodeFence = fenceCount % 2 !== 0;

      if (inCodeFence) {
        // Don't split inside code blocks — wait for more data
        break;
      }

      ready.push(candidate);
      this.buffer = this.buffer.slice(idx + doubleNewline.length);
    }

    return ready;
  }

  private format(text: string): string {
    const filter = createVerbosityFilter(this.verbosity);
    return filter.format(text);
  }
}

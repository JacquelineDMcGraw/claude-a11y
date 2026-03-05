import type { BashRecognizer } from "./types.js";
import { gitStatusRecognizer } from "./git-status.js";
import { gitDiffRecognizer } from "./git-diff.js";
import { npmTestRecognizer } from "./npm-test.js";
import { npmInstallRecognizer } from "./npm-install.js";
import { genericRecognizer } from "./generic.js";

export type { BashRecognizer } from "./types.js";

/** Ordered list of recognizers. First match wins. */
const recognizers: BashRecognizer[] = [
  gitStatusRecognizer,
  gitDiffRecognizer,
  npmTestRecognizer,
  npmInstallRecognizer,
  genericRecognizer, // always last
];

/**
 * Find the first recognizer that matches the command.
 * Always returns at least the generic recognizer.
 */
export function findRecognizer(command: string): BashRecognizer {
  for (const r of recognizers) {
    if (r.matches(command)) return r;
  }
  return genericRecognizer; // unreachable but safe
}

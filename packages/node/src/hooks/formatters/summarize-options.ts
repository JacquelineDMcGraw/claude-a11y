/**
 * Module-level state for summarize options.
 * Set by the pipeline before calling formatters; read by formatters.
 * This avoids changing the Formatter.format(input) signature.
 */

export interface SummarizeOptions {
  enabled: boolean;
  maxDeclarations: number;
  maxTtsNames: number;
}

let currentOptions: SummarizeOptions = {
  enabled: false,
  maxDeclarations: 20,
  maxTtsNames: 3,
};

export function setSummarizeOptions(opts: SummarizeOptions): void {
  currentOptions = { ...opts };
}

export function getSummarizeOptions(): Readonly<SummarizeOptions> {
  return currentOptions;
}

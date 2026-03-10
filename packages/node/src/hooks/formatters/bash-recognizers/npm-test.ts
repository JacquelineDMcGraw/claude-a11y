import type { BashRecognizer } from "./types.js";

export const npmTestRecognizer: BashRecognizer = {
  id: "npm-test",

  matches(command: string): boolean {
    const trimmed = command.trim();
    return (
      /^(npm\s+test|npx\s+vitest|npx\s+jest|yarn\s+test|pnpm\s+test)/.test(trimmed) ||
      /vitest\s+(run|watch)?/.test(trimmed) ||
      /jest\s/.test(trimmed)
    );
  },

  summarize(command: string, exitCode: string | number, stdout: string) {
    // Vitest output: "Tests  X passed (Y)" or "X passed | Y failed | Z skipped"
    // Match "Tests  N passed" specifically (not "Test Files  N passed")
    const vitestTestsLine = stdout.match(/^\s*Tests\s+.*$/m);
    const vitestMatch = vitestTestsLine ? vitestTestsLine[0].match(/(\d+)\s+passed/) : null;
    const vitestFailed = vitestTestsLine ? vitestTestsLine[0].match(/(\d+)\s+failed/) : null;
    const vitestSkipped = vitestTestsLine ? vitestTestsLine[0].match(/(\d+)\s+skipped/) : null;

    // Jest output: "Tests: X passed, Y failed, Z total"
    const jestMatch = stdout.match(/Tests:\s*(.*)/);

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    if (vitestMatch) passed = parseInt(vitestMatch[1]!, 10);
    if (vitestFailed) failed = parseInt(vitestFailed[1]!, 10);
    if (vitestSkipped) skipped = parseInt(vitestSkipped[1]!, 10);

    if (passed === 0 && failed === 0 && jestMatch) {
      const jestPassed = jestMatch[1]?.match(/(\d+)\s*passed/);
      const jestFailedM = jestMatch[1]?.match(/(\d+)\s*failed/);
      if (jestPassed) passed = parseInt(jestPassed[1]!, 10);
      if (jestFailedM) failed = parseInt(jestFailedM[1]!, 10);
    }

    const total = passed + failed + skipped;
    if (total === 0) {
      // Couldn't parse test results
      const lineCount = stdout.split("\n").filter(Boolean).length;
      return {
        contextText: `Ran: ${command}\nExit code: ${exitCode}\nTest output: ${lineCount} lines`,
        ttsText:
          exitCode === 0 || exitCode === "0"
            ? "Tests passed."
            : `Tests failed, exit code ${exitCode}.`,
      };
    }

    const parts: string[] = [];
    if (passed > 0) parts.push(`${passed} passed`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    const summary = parts.join(", ");

    return {
      contextText: `Ran: ${command}\nTests: ${summary} (${total} total)`,
      ttsText:
        failed > 0
          ? `Tests: ${failed} failed, ${passed} passed.`
          : `All ${passed} tests passed.`,
    };
  },
};

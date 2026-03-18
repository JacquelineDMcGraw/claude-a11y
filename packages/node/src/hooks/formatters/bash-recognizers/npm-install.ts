import type { BashRecognizer } from "./types.js";

export const npmInstallRecognizer: BashRecognizer = {
  id: "npm-install",

  matches(command: string): boolean {
    const trimmed = command.trim();
    return (
      /^(npm\s+install|npm\s+i\b|yarn\s+add|yarn\s+install|pnpm\s+install|pnpm\s+add)/.test(trimmed)
    );
  },

  summarize(command: string, exitCode: string | number, stdout: string) {
    // npm output: "added N packages in Xs"
    const addedMatch = stdout.match(/added\s+(\d+)\s+packages?/);
    // yarn output: "success Saved N new dependencies"
    const yarnMatch = stdout.match(/(\d+)\s+new\s+dependenc/);

    const count = addedMatch
      ? parseInt(addedMatch[1]!, 10)
      : yarnMatch
        ? parseInt(yarnMatch[1]!, 10)
        : null;

    if (count !== null) {
      return {
        contextText: `Ran: ${command}\nInstalled ${count} package${count !== 1 ? "s" : ""}.`,
        ttsText: `Installed ${count} package${count !== 1 ? "s" : ""}.`,
      };
    }

    // Couldn't parse — fallback
    return {
      contextText: `Ran: ${command}\nPackage install ${exitCode === 0 || exitCode === "0" ? "completed" : "failed"}.`,
      ttsText:
        exitCode === 0 || exitCode === "0"
          ? "Package install completed."
          : `Package install failed, exit code ${exitCode}.`,
    };
  },
};

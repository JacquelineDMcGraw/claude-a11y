import { Command } from "commander";
import { formatCommand } from "./commands/format.js";
import { setupCommand } from "./commands/setup.js";
import { uninstallCommand } from "./commands/uninstall.js";
import {
  configGetCommand,
  configSetCommand,
  configListCommand,
  configResetCommand,
} from "./commands/config.js";
import { replayCommand } from "./commands/replay.js";
import { tasksCommand } from "./commands/tasks.js";
import { historyCommand } from "./commands/history.js";
import { summarizeCommand } from "./commands/summarize.js";

const program = new Command();

program
  .name("claude-a11y-hooks")
  .description("Screen reader accessibility plugin for Claude Code")
  .version("1.2.0");

program
  .command("format")
  .description("Format tool output from stdin (called by Claude Code hooks)")
  .action(async () => {
    await formatCommand();
  });

program
  .command("setup")
  .description("Register a11y hooks in Claude Code settings")
  .action(() => {
    setupCommand();
  });

program
  .command("uninstall")
  .description("Remove a11y hooks from Claude Code settings")
  .action(() => {
    uninstallCommand();
  });

program
  .command("replay")
  .description("Replay the most recent digest summary via TTS")
  .action(() => {
    replayCommand();
  });

program
  .command("tasks")
  .description("Navigate the task list (use -i for interactive mode)")
  .option("-i, --interactive", "Enable interactive arrow-key navigation")
  .action((opts: { interactive?: boolean }) => {
    tasksCommand(opts.interactive === true);
  });

program
  .command("history")
  .description("Browse recent hook events and announcements")
  .option("-i, --interactive", "Enable interactive arrow-key navigation")
  .option("-n, --count <number>", "Number of events to show", "20")
  .action((opts: { interactive?: boolean; count?: string }) => {
    historyCommand(opts.interactive === true, parseInt(opts.count || "20", 10) || 20);
  });

program
  .command("summarize [action]")
  .description("Toggle code summarization (on/off/status)")
  .action((action?: string) => {
    summarizeCommand(action || "status");
  });

const configCmd = program
  .command("config")
  .description("Manage claude-a11y hooks configuration");

configCmd
  .command("get <key>")
  .description("Get a config value")
  .action((key: string) => {
    configGetCommand(key);
  });

configCmd
  .command("set <key> <value>")
  .description("Set a config value")
  .action((key: string, value: string) => {
    configSetCommand(key, value);
  });

configCmd
  .command("list")
  .description("Show all config values")
  .action(() => {
    configListCommand();
  });

configCmd
  .command("reset")
  .description("Reset config to defaults")
  .action(() => {
    configResetCommand();
  });

program.parseAsync().catch((err) => {
  process.stderr.write(`claude-a11y-hooks: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

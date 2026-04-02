const Anthropic = require("@anthropic-ai/sdk").default;
const { handleAction, runBash } = require("./mac-actions");
const { EventEmitter } = require("events");

class AgentLoop extends EventEmitter {
  constructor({ apiKey, model, systemPrompt, maxIterations, displayWidth, displayHeight }) {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model || "claude-sonnet-4-6";
    this.systemPrompt = systemPrompt || "";
    this.maxIterations = maxIterations || 50;
    this.displayWidth = displayWidth || 1280;
    this.displayHeight = displayHeight || 800;
    this.messages = [];
    this.running = false;
    this.aborted = false;
    this.iterationCount = 0;
  }

  getTools() {
    return [
      {
        type: "computer_20251124",
        name: "computer",
        display_width_px: this.displayWidth,
        display_height_px: this.displayHeight,
      },
      { type: "bash_20250124", name: "bash" },
      { type: "text_editor_20250728", name: "str_replace_based_edit_tool" },
    ];
  }

  async run(userMessage) {
    this.running = true;
    this.aborted = false;
    this.iterationCount = 0;
    this.messages = [];

    this.messages.push({
      role: "user",
      content: userMessage,
    });

    this.emit("status", "Agent started");
    this.emit("log", { level: "info", message: `Task: ${userMessage.slice(0, 200)}` });

    while (this.running && !this.aborted && this.iterationCount < this.maxIterations) {
      this.iterationCount++;
      this.emit("iteration", this.iterationCount);

      try {
        const response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: this.systemPrompt,
          messages: this.messages,
          tools: this.getTools(),
          betas: ["computer-use-2025-11-24"],
        });

        this.messages.push({ role: "assistant", content: response.content });

        const toolResults = [];

        for (const block of response.content) {
          if (this.aborted) break;

          if (block.type === "text") {
            this.emit("log", { level: "assistant", message: block.text });
          }

          if (block.type === "tool_use") {
            this.emit("log", {
              level: "tool",
              message: `${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`,
            });

            const result = await this.executeTool(block.name, block.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        if (toolResults.length === 0) {
          const reason = response.stop_reason === "end_turn" ? "end_turn" : "complete";
          this.emit("log", { level: "info", message: `Agent finished (${reason})` });
          this.emit("done", { iterations: this.iterationCount, reason });
          this.running = false;
          return;
        }

        this.messages.push({ role: "user", content: toolResults });
      } catch (err) {
        this.emit("log", { level: "error", message: `API error: ${err.message}` });
        if (err.status === 429) {
          this.emit("log", { level: "info", message: "Rate limited, waiting 10s..." });
          await sleep(10000);
          continue;
        }
        this.emit("error", err);
        this.running = false;
        return;
      }
    }

    if (this.aborted) {
      this.emit("done", { iterations: this.iterationCount, reason: "aborted" });
    } else {
      this.emit("log", { level: "warn", message: `Hit iteration limit (${this.maxIterations})` });
      this.emit("done", { iterations: this.iterationCount, reason: "max_iterations" });
    }
    this.running = false;
  }

  async executeTool(name, input) {
    try {
      if (name === "computer") {
        const action = input.action;

        if (action === "screenshot") {
          const { screenshot } = require("./mac-actions");
          const base64 = screenshot();
          return [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64 },
            },
          ];
        }

        if (action === "zoom" && input.region) {
          const { screenshotRegion } = require("./mac-actions");
          const [x1, y1, x2, y2] = input.region;
          const base64 = screenshotRegion(x1, y1, x2, y2);
          return [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64 },
            },
          ];
        }

        const result = handleAction(action, input);
        if (result.type === "error") {
          return [{ type: "text", text: `Error: ${result.message}` }];
        }

        if (result.type === "screenshot" && result.base64) {
          return [
            { type: "text", text: `Action ${action} executed successfully.` },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: result.base64 },
            },
          ];
        }

        const { screenshot: takeScreenshot } = require("./mac-actions");
        const afterBase64 = takeScreenshot();
        return [
          { type: "text", text: `Action ${action} executed successfully.` },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: afterBase64 },
          },
        ];
      }

      if (name === "bash") {
        const result = runBash(input.command);
        return [{ type: "text", text: result.output || "(no output)" }];
      }

      if (name === "str_replace_based_edit_tool") {
        return this.handleTextEditor(input);
      }

      return [{ type: "text", text: `Unknown tool: ${name}` }];
    } catch (err) {
      return [{ type: "text", text: `Tool execution error: ${err.message}` }];
    }
  }

  handleTextEditor(input) {
    const fs = require("fs");
    const { command, path: filePath } = input;

    try {
      if (command === "view") {
        if (!fs.existsSync(filePath)) {
          return [{ type: "text", text: `File not found: ${filePath}` }];
        }
        const content = fs.readFileSync(filePath, "utf-8");
        if (input.view_range) {
          const lines = content.split("\n");
          const [start, end] = input.view_range;
          const slice = lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join("\n");
          return [{ type: "text", text: slice }];
        }
        const numbered = content.split("\n").map((l, i) => `${i + 1}\t${l}`).join("\n");
        return [{ type: "text", text: numbered.slice(0, 50000) }];
      }

      if (command === "create") {
        fs.mkdirSync(require("path").dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, input.file_text);
        return [{ type: "text", text: `Created ${filePath}` }];
      }

      if (command === "str_replace") {
        const content = fs.readFileSync(filePath, "utf-8");
        if (!content.includes(input.old_str)) {
          return [{ type: "text", text: `old_str not found in ${filePath}` }];
        }
        const updated = content.replace(input.old_str, () => input.new_str);
        fs.writeFileSync(filePath, updated);
        return [{ type: "text", text: `Replaced text in ${filePath}` }];
      }

      if (command === "insert") {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        lines.splice(input.insert_line, 0, input.new_str);
        fs.writeFileSync(filePath, lines.join("\n"));
        return [{ type: "text", text: `Inserted at line ${input.insert_line} in ${filePath}` }];
      }

      if (command === "undo_edit") {
        return [{ type: "text", text: "Undo not supported in this environment" }];
      }

      return [{ type: "text", text: `Unknown editor command: ${command}` }];
    } catch (err) {
      return [{ type: "text", text: `Editor error: ${err.message}` }];
    }
  }

  stop() {
    this.aborted = true;
    this.running = false;
    this.emit("status", "Agent stopped");
  }

  reset() {
    this.messages = [];
    this.iterationCount = 0;
    this.running = false;
    this.aborted = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { AgentLoop };

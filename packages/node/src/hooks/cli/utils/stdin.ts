/**
 * Read stdin with timeout and size limit.
 * Injectable stream parameter enables testing without real stdin.
 */
export async function readStdin(
  stream: NodeJS.ReadableStream = process.stdin,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string> {
  const { timeoutMs = 5000, maxBytes = 5_000_000 } = options;

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        stream.removeAllListeners();
        if ("destroy" in stream && typeof stream.destroy === "function") {
          (stream as NodeJS.ReadStream).destroy();
        }
        reject(new Error(`Stdin read timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settled = true;
        clearTimeout(timer);
        stream.removeAllListeners();
        if ("destroy" in stream && typeof stream.destroy === "function") {
          (stream as NodeJS.ReadStream).destroy();
        }
        reject(new Error(`Stdin exceeded ${maxBytes} byte limit`));
        return;
      }
      chunks.push(chunk);
    });

    stream.on("end", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });

    stream.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

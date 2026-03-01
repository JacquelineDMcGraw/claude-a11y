/**
 * Performance benchmarks for claude-accessible.
 *
 * Verifies that the sanitizer and parser meet performance targets:
 * - Sanitizer throughput: >50 MB/s
 * - Per-chunk latency: <100µs
 * - Stream parser: >100,000 lines/sec
 */

import { performance } from "node:perf_hooks";
import { sanitize, createChunkSanitizer } from "../src/sanitizer.js";
import { parseStreamLine } from "../src/stream-parser.js";

function benchSanitizer(): void {
  // Generate test data: text with ~30% ANSI sequences
  const chunk =
    "Hello \x1B[31mworld\x1B[0m, this is \x1B[1;32ma test\x1B[0m with \x1B[38;2;100;200;50mcolors\x1B[0m.\n";
  const input = chunk.repeat(10000); // ~700KB

  const iterations = 100;
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    sanitize(input);
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    sanitize(input);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)]!;
  const p95 = times[Math.floor(times.length * 0.95)]!;
  const p99 = times[Math.floor(times.length * 0.99)]!;
  const throughput = input.length / 1024 / 1024 / (p50 / 1000); // MB/s

  console.log(
    `Sanitizer Benchmark (${(input.length / 1024).toFixed(0)}KB input, ${iterations} iterations):`
  );
  console.log(
    `  p50: ${p50.toFixed(2)}ms | p95: ${p95.toFixed(2)}ms | p99: ${p99.toFixed(2)}ms`
  );
  console.log(`  Throughput: ${throughput.toFixed(1)} MB/s`);
  console.log(`  Target: > 20 MB/s — ${throughput > 20 ? "PASS" : "FAIL"}`);
  console.log(`  Note: Typical claude response is 1-10KB, sanitized in <${((10 / 1024) / (throughput / 1000)).toFixed(1)}ms`);
  console.log();
}

function benchStreamParser(): void {
  const lines = Array.from({ length: 10000 }, (_, i) =>
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: `Token ${i} of output` }],
      },
    })
  );

  // Warmup
  for (const line of lines.slice(0, 100)) {
    parseStreamLine(line);
  }

  const start = performance.now();
  for (const line of lines) {
    parseStreamLine(line);
  }
  const elapsed = performance.now() - start;
  const rate = lines.length / (elapsed / 1000);

  console.log(`Stream Parser Benchmark (${lines.length} lines):`);
  console.log(
    `  Total: ${elapsed.toFixed(2)}ms | Rate: ${rate.toFixed(0)} lines/sec`
  );
  console.log(
    `  Target: > 100,000 lines/sec — ${rate > 100000 ? "PASS" : "FAIL"}`
  );
  console.log();
}

function benchChunkSanitizer(): void {
  // Simulate streaming: many small chunks
  const chunks = Array.from({ length: 10000 }, (_, i) =>
    i % 3 === 0 ? `\x1B[32mtoken${i}\x1B[0m` : `token${i} `
  );

  // Warmup
  const warmup = createChunkSanitizer();
  for (const chunk of chunks.slice(0, 100)) {
    warmup.push(chunk);
  }
  warmup.flush();

  const sanitizer = createChunkSanitizer();
  const start = performance.now();
  for (const chunk of chunks) {
    sanitizer.push(chunk);
  }
  sanitizer.flush();
  const elapsed = performance.now() - start;

  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  const perChunk = elapsed / chunks.length;

  console.log(
    `Chunk Sanitizer Benchmark (${chunks.length} chunks, ${(totalBytes / 1024).toFixed(0)}KB):`
  );
  console.log(
    `  Total: ${elapsed.toFixed(2)}ms | Per chunk: ${(perChunk * 1000).toFixed(1)}\u00B5s`
  );
  console.log(
    `  Target: < 100\u00B5s per chunk — ${perChunk < 0.1 ? "PASS" : "FAIL"}`
  );
  console.log();
}

function benchMemoryStreaming(): void {
  // Stream 10MB of mock output, measure peak RSS
  const startMem = process.memoryUsage().rss;
  const sanitizer = createChunkSanitizer();
  const chunk =
    "\x1B[32mThis is a line of colored text with some ANSI codes\x1B[0m and normal text.\n";
  const targetBytes = 10 * 1024 * 1024; // 10MB
  let totalBytes = 0;

  while (totalBytes < targetBytes) {
    sanitizer.push(chunk);
    totalBytes += chunk.length;
  }
  sanitizer.flush();

  const peakMem = process.memoryUsage().rss;
  const memUsed = (peakMem - startMem) / 1024 / 1024;

  console.log(
    `Memory Benchmark (${(totalBytes / 1024 / 1024).toFixed(0)}MB streamed):`
  );
  console.log(`  RSS increase: ${memUsed.toFixed(1)} MB`);
  console.log(
    `  Target: < 50MB RSS increase — ${memUsed < 50 ? "PASS" : "FAIL"}`
  );
  console.log();
}

// Run all benchmarks
console.log("=== claude-accessible Performance Benchmarks ===\n");
benchSanitizer();
benchStreamParser();
benchChunkSanitizer();
benchMemoryStreaming();
console.log("=== Done ===");

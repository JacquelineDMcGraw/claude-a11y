/**
 * Extract the filename from a path. Handles forward slashes only;
 * Windows backslash paths are normalised before splitting.
 */
export function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

/**
 * Count lines in a string, not double-counting a trailing newline.
 * "a\nb\n" -> 2, "a\nb" -> 2, "" -> 0.
 */
export function countLines(content: string): number {
  if (!content) return 0;
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

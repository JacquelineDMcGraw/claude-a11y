/**
 * Extract the filename from a path. Handles forward slashes only;
 * Windows backslash paths are normalised before splitting.
 */
export function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

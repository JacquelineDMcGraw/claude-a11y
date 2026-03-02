/**
 * phrasing.js — Canonical announcement strings for claude-accessible.
 *
 * This is the single source of truth for all screen reader announcement
 * text used by both the browser-side DOM transforms (chat-a11y.js) and
 * the Node-side speech formatter. Both packages import these defaults.
 *
 * Organized into three verbosity presets: minimal, normal, detailed.
 * "minimal" strips most annotations. "normal" is the default. "detailed"
 * adds line counts and table dimensions.
 */

var PHRASING = {
  codeBlockStart: "[{lang}]",
  codeBlockEnd: "[End {lang}]",
  codeBlockDefault: "Code",
  headingPrefix: "[Heading]",
  subheadingPrefix: "[Subheading]",
  quotePrefix: "[Quote]",
  tableStart: "[Table, {cols} columns]",
  tableEnd: "[End Table]",
  tableHeader: "[Header]",
  tableRow: "[Row {n}]",
  bulletPrefix: "Bullet:",
  separator: "[Separator]",
  imageLabel: "[Image: {alt}]",
  imageLabelNoAlt: "[Image]",
  strikethroughStart: "[Strikethrough]",
  strikethroughEnd: "[End Strikethrough]",
  listAnnouncement: "[{count} item {type} list]",
  responseLabel: "AI response",
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = PHRASING;
  module.exports.PHRASING = PHRASING;
}

if (typeof window !== "undefined") {
  window.__ca11yPhrasing = PHRASING;
}

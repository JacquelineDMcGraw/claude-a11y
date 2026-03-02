/**
 * phrasing.js — Canonical announcement strings for claude-accessible.
 *
 * This is the single source of truth for all screen reader announcement
 * text used by both the browser-side DOM transforms (chat-a11y.js) and
 * the Node-side speech formatter. Both packages import these defaults.
 *
 * Organized by locale with English as the default. Each locale defines
 * the same set of announcement keys. Missing keys in any locale fall
 * back to the English value.
 */

/* eslint-disable no-implicit-globals */

var LOCALES = {
  en: {
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
    generatingStatus: "Generating response...",
    responseComplete: "Response complete.",
    annotationsHidden: "Accessibility annotations hidden",
    annotationsRestored: "Accessibility annotations restored",
  },
  es: {
    codeBlockStart: "[{lang}]",
    codeBlockEnd: "[Fin {lang}]",
    codeBlockDefault: "Código",
    headingPrefix: "[Encabezado]",
    subheadingPrefix: "[Subencabezado]",
    quotePrefix: "[Cita]",
    tableStart: "[Tabla, {cols} columnas]",
    tableEnd: "[Fin Tabla]",
    tableHeader: "[Encabezado]",
    tableRow: "[Fila {n}]",
    bulletPrefix: "Punto:",
    separator: "[Separador]",
    imageLabel: "[Imagen: {alt}]",
    imageLabelNoAlt: "[Imagen]",
    strikethroughStart: "[Tachado]",
    strikethroughEnd: "[Fin Tachado]",
    listAnnouncement: "[Lista {type} de {count} elementos]",
    responseLabel: "Respuesta de IA",
    generatingStatus: "Generando respuesta...",
    responseComplete: "Respuesta completa.",
    annotationsHidden: "Anotaciones de accesibilidad ocultas",
    annotationsRestored: "Anotaciones de accesibilidad restauradas",
  },
  pt: {
    codeBlockStart: "[{lang}]",
    codeBlockEnd: "[Fim {lang}]",
    codeBlockDefault: "Código",
    headingPrefix: "[Título]",
    subheadingPrefix: "[Subtítulo]",
    quotePrefix: "[Citação]",
    tableStart: "[Tabela, {cols} colunas]",
    tableEnd: "[Fim Tabela]",
    tableHeader: "[Cabeçalho]",
    tableRow: "[Linha {n}]",
    bulletPrefix: "Item:",
    separator: "[Separador]",
    imageLabel: "[Imagem: {alt}]",
    imageLabelNoAlt: "[Imagem]",
    strikethroughStart: "[Riscado]",
    strikethroughEnd: "[Fim Riscado]",
    listAnnouncement: "[Lista {type} com {count} itens]",
    responseLabel: "Resposta da IA",
    generatingStatus: "Gerando resposta...",
    responseComplete: "Resposta completa.",
    annotationsHidden: "Anotações de acessibilidade ocultas",
    annotationsRestored: "Anotações de acessibilidade restauradas",
  },
  de: {
    codeBlockStart: "[{lang}]",
    codeBlockEnd: "[Ende {lang}]",
    codeBlockDefault: "Code",
    headingPrefix: "[Überschrift]",
    subheadingPrefix: "[Unterüberschrift]",
    quotePrefix: "[Zitat]",
    tableStart: "[Tabelle, {cols} Spalten]",
    tableEnd: "[Ende Tabelle]",
    tableHeader: "[Kopfzeile]",
    tableRow: "[Zeile {n}]",
    bulletPrefix: "Punkt:",
    separator: "[Trenner]",
    imageLabel: "[Bild: {alt}]",
    imageLabelNoAlt: "[Bild]",
    strikethroughStart: "[Durchgestrichen]",
    strikethroughEnd: "[Ende Durchgestrichen]",
    listAnnouncement: "[{type}-Liste mit {count} Einträgen]",
    responseLabel: "KI-Antwort",
    generatingStatus: "Antwort wird generiert...",
    responseComplete: "Antwort abgeschlossen.",
    annotationsHidden: "Barrierefreiheits-Anmerkungen ausgeblendet",
    annotationsRestored: "Barrierefreiheits-Anmerkungen wiederhergestellt",
  },
  fr: {
    codeBlockStart: "[{lang}]",
    codeBlockEnd: "[Fin {lang}]",
    codeBlockDefault: "Code",
    headingPrefix: "[Titre]",
    subheadingPrefix: "[Sous-titre]",
    quotePrefix: "[Citation]",
    tableStart: "[Tableau, {cols} colonnes]",
    tableEnd: "[Fin Tableau]",
    tableHeader: "[En-tête]",
    tableRow: "[Ligne {n}]",
    bulletPrefix: "Point :",
    separator: "[Séparateur]",
    imageLabel: "[Image : {alt}]",
    imageLabelNoAlt: "[Image]",
    strikethroughStart: "[Barré]",
    strikethroughEnd: "[Fin Barré]",
    listAnnouncement: "[Liste {type} de {count} éléments]",
    responseLabel: "Réponse IA",
    generatingStatus: "Génération de la réponse...",
    responseComplete: "Réponse terminée.",
    annotationsHidden: "Annotations d'accessibilité masquées",
    annotationsRestored: "Annotations d'accessibilité restaurées",
  },
  ja: {
    codeBlockStart: "[{lang}]",
    codeBlockEnd: "[{lang}終了]",
    codeBlockDefault: "コード",
    headingPrefix: "[見出し]",
    subheadingPrefix: "[小見出し]",
    quotePrefix: "[引用]",
    tableStart: "[表、{cols}列]",
    tableEnd: "[表終了]",
    tableHeader: "[ヘッダー]",
    tableRow: "[行{n}]",
    bulletPrefix: "項目：",
    separator: "[区切り]",
    imageLabel: "[画像：{alt}]",
    imageLabelNoAlt: "[画像]",
    strikethroughStart: "[取り消し線]",
    strikethroughEnd: "[取り消し線終了]",
    listAnnouncement: "[{count}項目の{type}リスト]",
    responseLabel: "AI応答",
    generatingStatus: "応答を生成中...",
    responseComplete: "応答完了。",
    annotationsHidden: "アクセシビリティ注釈を非表示",
    annotationsRestored: "アクセシビリティ注釈を復元",
  },
};

function detectLocale() {
  if (typeof window !== "undefined" && window.__ca11yLocale) return window.__ca11yLocale;
  if (typeof navigator !== "undefined" && navigator.language) {
    var lang = navigator.language.split("-")[0].toLowerCase();
    if (LOCALES[lang]) return lang;
  }
  return "en";
}

var currentLocale = detectLocale();
var PHRASING = {};
var enFallback = LOCALES.en;
var localized = LOCALES[currentLocale] || enFallback;
for (var _k in enFallback) {
  if (enFallback.hasOwnProperty(_k)) {
    PHRASING[_k] = localized[_k] || enFallback[_k];
  }
}

PHRASING.LOCALES = LOCALES;
PHRASING.currentLocale = currentLocale;

if (typeof module !== "undefined" && module.exports) {
  module.exports = PHRASING;
  module.exports.PHRASING = PHRASING;
  module.exports.LOCALES = LOCALES;
}

if (typeof window !== "undefined") {
  window.__ca11yPhrasing = PHRASING;
  window.__ca11yLocales = LOCALES;
}

module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        MutationObserver: "readonly",
        Node: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
        acquireVsCodeApi: "readonly",
        trustedTypes: "readonly",
        requestAnimationFrame: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        HTMLElement: "readonly",
        Function: "readonly",
        module: "readonly",
        sessionStorage: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { vars: "local" }],
      "no-redeclare": "error",
      eqeqeq: ["warn", "smart"],
      "no-implicit-globals": "error"
    }
  }
];

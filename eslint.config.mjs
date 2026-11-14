import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["**/node_modules/**", "web/dist/**", "engine/build*/**", "data/**"]
  },
  js.configs.recommended,
  {
    files: ["server/**/*.js", "scripts/**/*.{js,mjs}", "*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node
    }
  },
  {
    files: ["web/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "react/jsx-key": "error",
      "react/jsx-no-undef": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["web/vite.config.js", "web/**/*.test.js"],
    languageOptions: { globals: globals.node }
  },
  {
    // Playwright page.evaluate callbacks run in the browser.
    files: ["scripts/smoke-webgl.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    rules: {
      // Input validation intentionally matches control characters.
      "no-control-regex": "off",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^(_|React$)", caughtErrors: "none" }
      ]
    }
  }
];

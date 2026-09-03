import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The client reads em dashes as a tell that copy was machine-written, and asked for every
    // one to go. They were swept out of all five apps once; this stops them coming back,
    // whether in UI copy, a comment, or a JSX text node. Use a comma, a colon, or a full stop.
    // En dashes are covered too, since they were being used as range separators where the word
    // "to" reads better.
    rules: {
      "no-irregular-whitespace": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/[\\u2013\\u2014]/]",
          message:
            "No em or en dashes. Use a comma, a colon, a full stop, or the word 'to' for ranges.",
        },
        {
          selector: "TemplateElement[value.raw=/[\\u2013\\u2014]/]",
          message:
            "No em or en dashes. Use a comma, a colon, a full stop, or the word 'to' for ranges.",
        },
        {
          selector: "JSXText[value=/[\\u2013\\u2014]/]",
          message:
            "No em or en dashes. Use a comma, a colon, a full stop, or the word 'to' for ranges.",
        },
      ],
    },
  },
]);

export default eslintConfig;

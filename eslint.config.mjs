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
    "output/**",
    ".netlify/**",
    "out/**",
    "build/**",
    "runtime/**",
    "docs/design/visualizations/runtime/**",
    "docs/design/visualizations/maps/*.js",
    "release/**",
    "next-env.d.ts",
    ".understand-anything/**",
  ]),
]);

export default eslintConfig;

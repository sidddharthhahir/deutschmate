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
    /* The tests read API responses as the wire actually delivers them. Giving
       those reads a declared type would mean asserting the shape the code
       claims, which is the thing under test — a test that type-checks against
       the app's own types cannot catch the app changing them. So `any` is the
       honest annotation here, and only here. */
    files: ["tests/**/*.mts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;

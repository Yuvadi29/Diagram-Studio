import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Newer eslint-plugin-react-hooks versions ship React Compiler checks. They are
// useful hints but this codebase does not use the compiler, so report them as
// warnings. Only rules that exist in the installed plugin version are listed.
const reactHooks = [...nextVitals, ...nextTs].map((c) => c.plugins?.["react-hooks"]).find(Boolean);
const compilerRules = [
  "set-state-in-effect",
  "set-state-in-render",
  "refs",
  "purity",
  "immutability",
  "preserve-manual-memoization",
  "static-components",
  "incompatible-library",
  "use-memo",
  "globals",
];
const relaxedCompilerRules = Object.fromEntries(
  compilerRules.filter((r) => reactHooks?.rules?.[r]).map((r) => [`react-hooks/${r}`, "warn"]),
);

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      ...relaxedCompilerRules,
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "node_modules/**"]),
]);

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The app makes no EVM RPC calls except the demo faucet: viem stays in src/lib/faucet.ts.
  {
    ignores: ["src/lib/faucet.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "viem", message: "Only src/lib/faucet.ts (demo faucet) may use viem. Chain access goes through Pact APIs (src/lib/pact/*)." }],
          patterns: [{ group: ["viem/*"], message: "Only src/lib/faucet.ts (demo faucet) may use viem. Chain access goes through Pact APIs (src/lib/pact/*)." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

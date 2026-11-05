import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".next/**", "node_modules/**", "coverage/**", "next-env.d.ts", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      // CLAUDE.md §3: pul va miqdorlar butun son; float uchun parseFloat/Number.parseFloat taqiqlanadi
      "no-restricted-globals": ["error", "parseFloat"],
      "no-restricted-properties": ["error", { object: "Number", property: "parseFloat", message: "Float ishlatilmaydi (tiyin — butun son)" }],
    },
  },
);

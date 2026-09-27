import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/components/ui/**"],
  },
  {
    // Meeting Mode rule (docs/03 §2): pages, routes and components read data only through
    // src/lib/db/queries/*, which take a ViewContext and return redacted views. Mutations
    // live in server-action files, which may use the client directly.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/app/**/actions.ts", "src/app/**/*-actions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/db", message: "Read through src/lib/db/queries/* so redaction is applied. Mutations belong in an actions.ts file." },
            { name: "@prisma/client", importNames: ["PrismaClient"], message: "Use the shared client in src/lib/db via a query module." },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;

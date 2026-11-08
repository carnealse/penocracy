import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.log("No database URL is set. Skipping migrations.");
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DIRECT_URL: url },
});

process.exit(result.status ?? 1);

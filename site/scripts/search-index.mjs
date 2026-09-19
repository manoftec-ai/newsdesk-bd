import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const dist = new URL("../dist", import.meta.url).pathname;

if (!existsSync(dist)) {
  console.log("[search] dist/ missing — skipping Pagefind index.");
  process.exit(0);
}

console.log("[search] building Pagefind index…");
const result = spawnSync("npx", ["pagefind", "--site", dist, "--output-subdir", "pagefind"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.warn(
    "[search] Pagefind index skipped (binary unavailable on this platform). " +
      "The /search page will still work as a category/tag browser until the index exists on the build host.",
  );
  process.exit(0);
}
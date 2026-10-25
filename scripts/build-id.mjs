// Build number = short commit hash. Render sets RENDER_GIT_COMMIT during builds;
// locally we ask git. Falls back to "dev".
import { execSync } from "node:child_process";

export function getBuildId() {
  const fromEnv = process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || process.env.BUILD_ID;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { getBuildId } from "../scripts/build-id.mjs";

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    // Dev builds report "dev" so a dev client and dev server always match.
    __BUILD_ID__: JSON.stringify(command === "build" ? getBuildId() : "dev"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    // The client imports game rules from ../shared.
    fs: { allow: [".."] },
  },
}));

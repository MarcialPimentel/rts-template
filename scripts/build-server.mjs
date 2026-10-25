// Bundles server/src and shared/ into a single Node file at server/dist/index.js.
import { build } from "esbuild";

await build({
  entryPoints: ["server/src/index.ts"],
  outfile: "server/dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});

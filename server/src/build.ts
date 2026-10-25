declare const __BUILD_ID__: string | undefined;

/** Short commit hash baked in at build time; "dev" when running from source. */
export const BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : (process.env.BUILD_ID ?? "dev");

/** Short commit hash injected by Vite at build time; "dev" in the dev server. */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** The single server address config value (GDD rule), e.g. wss://rts-template-server.onrender.com */
  readonly VITE_SERVER_URL?: string;
}

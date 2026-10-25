/**
 * The single server address config value (GDD rule). Set at build time with VITE_SERVER_URL
 * (see render.yaml). A `?server=` URL parameter overrides it for testing; local dev falls back
 * to port 8080 on the same host.
 */
export function serverUrl(): string {
  const override = new URLSearchParams(location.search).get("server");
  if (override) return override;
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  const secure = location.protocol === "https:";
  return `${secure ? "wss" : "ws"}://${location.hostname}:8080`;
}

/** The server's HTTP address (for health checks), derived from the WebSocket address. */
export function serverHttpUrl(): string {
  return serverUrl().replace(/^ws(s?):/, "http$1:");
}

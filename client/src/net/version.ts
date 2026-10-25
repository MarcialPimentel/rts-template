/** Client and server builds match if they're equal; "dev" builds (local development) match anything. */
export function buildsMatch(client: string, server: string): boolean {
  return client === server || client === "dev" || server === "dev";
}

/**
 * Player colours chosen in the lobby. Each player keeps their colour on every screen, so both
 * players agree on who is who. The server only stores an index into this list.
 */
export interface PlayerColor {
  name: string;
  /** Main fill for units and building borders. */
  fill: string;
  /** Darker shade for building bodies and unit outlines. */
  dark: string;
}

export const PLAYER_COLORS: readonly PlayerColor[] = [
  { name: "Blue", fill: "#3b82f6", dark: "#1e3a8a" },
  { name: "Red", fill: "#ef4444", dark: "#7f1d1d" },
  { name: "Green", fill: "#22c55e", dark: "#14532d" },
  { name: "Gold", fill: "#eab308", dark: "#713f12" },
  { name: "Purple", fill: "#a855f7", dark: "#581c87" },
  { name: "Teal", fill: "#14b8a6", dark: "#134e4a" },
];

/** Default colour per player slot: player 1 blue, player 2 red. */
export const DEFAULT_COLORS: readonly number[] = [0, 1];

export function playerColor(colors: readonly number[], owner: number): PlayerColor {
  return PLAYER_COLORS[colors[owner] ?? owner] ?? PLAYER_COLORS[0]!;
}

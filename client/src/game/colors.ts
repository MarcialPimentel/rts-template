/** GDD: each player has one team colour; the local player is always blue. */
export const COLORS = {
  ground: "#24301f",
  grid: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.18)",
  local: "#3b82f6",
  localDark: "#1e3a8a",
  enemy: "#ef4444",
  enemyDark: "#7f1d1d",
  selection: "#f8fafc",
  hpGood: "#22c55e",
  hpMid: "#eab308",
  hpLow: "#ef4444",
  hpBack: "rgba(0,0,0,0.6)",
  move: "#22c55e",
  attack: "#ef4444",
  rally: "#facc15",
  boxFill: "rgba(148,197,255,0.12)",
  boxLine: "rgba(148,197,255,0.8)",
};

export function teamColor(owner: number, localPlayer: number): { fill: string; dark: string } {
  return owner === localPlayer
    ? { fill: COLORS.local, dark: COLORS.localDark }
    : { fill: COLORS.enemy, dark: COLORS.enemyDark };
}

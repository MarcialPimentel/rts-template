import { perSecondToPerTick, secondsToTicks } from "../sim/constants";
import { POC_GAME } from "./poc";
import type { EntityDef, EntityDefData, GameData } from "./types";

export type { EntityDef, EntityDefData, GameData, MapData, EconomyData } from "./types";

/** Converts designer-facing definitions (seconds, per-second rates) into tick-based ones. */
export function compileDef(d: EntityDefData): EntityDef {
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    radius: d.radius,
    hp: d.hp,
    cost: d.cost ?? 0,
    buildTicks: d.buildTime !== undefined ? secondsToTicks(d.buildTime) : 0,
    speedPerTick: d.speed !== undefined ? perSecondToPerTick(d.speed) : 0,
    attack: d.attack
      ? {
          damage: d.attack.damage,
          intervalTicks: secondsToTicks(d.attack.interval),
          range: d.attack.range,
        }
      : null,
    sight: d.sight ?? 0,
    incomePerTick: d.income !== undefined ? perSecondToPerTick(d.income) : 0,
    produces: d.produces ?? [],
    queueMax: d.queueMax ?? 0,
    isHeadquarters: d.isHeadquarters ?? false,
  };
}

/** The compiled game the simulation runs: definitions by id plus map and economy. */
export interface CompiledGame {
  defs: Record<string, EntityDef>;
  /** Definition ids in a stable order, used to encode types compactly in snapshots. */
  typeIds: string[];
  map: GameData["map"];
  economy: GameData["economy"];
}

export function compileGame(data: GameData): CompiledGame {
  const defs: Record<string, EntityDef> = {};
  for (const d of data.defs) {
    if (defs[d.id]) throw new Error(`Duplicate definition id "${d.id}"`);
    defs[d.id] = compileDef(d);
  }
  for (const d of Object.values(defs)) {
    for (const p of d.produces) {
      if (!defs[p]) throw new Error(`"${d.id}" produces unknown type "${p}"`);
    }
  }
  return {
    defs,
    typeIds: data.defs.map((d) => d.id),
    map: data.map,
    economy: data.economy,
  };
}

/** The game this build plays. A new game swaps POC_GAME for its own data. */
export const GAME: CompiledGame = compileGame(POC_GAME);

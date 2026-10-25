/**
 * Definition format for units and buildings, as written by designers.
 * Durations are in seconds and speeds/rates per second; `compileDefs` converts them to ticks.
 */
export interface EntityDefData {
  /** Stable id used in commands and snapshots, e.g. "soldier". */
  id: string;
  name: string;
  kind: "unit" | "building";
  /** Collision and selection radius in pixels. */
  radius: number;
  hp: number;
  /** Gold cost to train. Buildings in the PoC are pre-placed and have no cost. */
  cost?: number;
  /** Seconds to train. */
  buildTime?: number;
  /** Movement speed in px/s. Present only on things that move. */
  speed?: number;
  /** Attack: damage per hit, seconds between hits, range in px from edge to edge. */
  attack?: { damage: number; interval: number; range: number };
  /** Distance in px (edge to edge) at which idle units notice enemies. */
  sight?: number;
  /** Gold per second this entity gives its owner. */
  income?: number;
  /** Unit ids this building can train, and how many can queue. */
  produces?: string[];
  queueMax?: number;
  /** Losing every entity with this flag loses the match. */
  isHeadquarters?: boolean;
}

/** A definition after unit conversion, used by the simulation. */
export interface EntityDef {
  id: string;
  name: string;
  kind: "unit" | "building";
  radius: number;
  hp: number;
  cost: number;
  buildTicks: number;
  /** px per tick; 0 when the entity can't move. */
  speedPerTick: number;
  attack: { damage: number; intervalTicks: number; range: number } | null;
  sight: number;
  incomePerTick: number;
  produces: string[];
  queueMax: number;
  isHeadquarters: boolean;
}

export interface StartingEntity {
  type: string;
  x: number;
  y: number;
}

export interface MapData {
  width: number;
  height: number;
  /** Starting entities for each player slot, in slot order. */
  bases: { entities: StartingEntity[]; rally: { x: number; y: number } }[];
}

export interface EconomyData {
  startingGold: number;
  /** Max units (alive plus queued) per player. */
  unitCap: number;
}

export interface GameData {
  defs: EntityDefData[];
  map: MapData;
  economy: EconomyData;
}

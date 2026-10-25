import { MAX_UNITS_PER_COMMAND, type Command } from "./types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isIdList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.length <= MAX_UNITS_PER_COMMAND && v.every(isId);

/**
 * Checks the shape of a command received from the network. Returns a clean copy with only
 * known fields, or null if anything is malformed. Game-rule checks happen later in `validate`.
 */
export function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case "move":
    case "attack_move":
      if (!isIdList(c.units) || !isNum(c.x) || !isNum(c.y)) return null;
      return { type: c.type, units: [...c.units], x: c.x, y: c.y };
    case "attack":
      if (!isIdList(c.units) || !isId(c.target)) return null;
      return { type: "attack", units: [...c.units], target: c.target };
    case "stop":
      if (!isIdList(c.units)) return null;
      return { type: "stop", units: [...c.units] };
    case "train":
      if (!isId(c.building) || typeof c.unit !== "string" || c.unit.length > 64) return null;
      return { type: "train", building: c.building, unit: c.unit };
    case "set_rally":
      if (!isId(c.building) || !isNum(c.x) || !isNum(c.y)) return null;
      return { type: "set_rally", building: c.building, x: c.x, y: c.y };
    default:
      return null;
  }
}

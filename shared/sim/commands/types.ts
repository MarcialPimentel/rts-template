import type { CompiledGame } from "../../data";
import type { World } from "../world";

/** Max unit ids in one command (GDD: bounds message size). */
export const MAX_UNITS_PER_COMMAND = 64;

/**
 * Every player action is one of these. Commands describe intent, never results.
 * The sending player is never part of a command: the server stamps it.
 */
export type Command =
  | { type: "move"; units: number[]; x: number; y: number }
  | { type: "attack"; units: number[]; target: number }
  | { type: "attack_move"; units: number[]; x: number; y: number }
  | { type: "stop"; units: number[] }
  | { type: "train"; building: number; unit: string }
  | { type: "set_rally"; building: number; x: number; y: number };

export type CommandType = Command["type"];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

/**
 * One module per command. `validate` returns the command normalized for this player
 * (e.g. with ids they don't own removed), or null to drop it. `apply` assumes a validated command.
 */
export interface CommandHandler<T extends CommandType> {
  validate(world: World, player: number, cmd: CommandOf<T>, game: CompiledGame): CommandOf<T> | null;
  apply(world: World, player: number, cmd: CommandOf<T>, game: CompiledGame): void;
}

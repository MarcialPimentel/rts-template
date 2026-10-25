import { GAME, type CompiledGame } from "../../data";
import type { World } from "../world";
import { attack } from "./attack";
import { attackMove } from "./attack_move";
import { move } from "./move";
import { setRally } from "./set_rally";
import { stop } from "./stop";
import { train } from "./train";
import type { Command, CommandHandler, CommandOf, CommandType } from "./types";

export { parseCommand } from "./parse";
export { MAX_UNITS_PER_COMMAND, type Command, type CommandType } from "./types";

/** Adding a command = a new module plus one line here (and its schema in the GDD). */
const HANDLERS: { [T in CommandType]: CommandHandler<T> } = {
  move,
  attack,
  attack_move: attackMove,
  stop,
  train,
  set_rally: setRally,
};

/** A command and the player who sent it (stamped by the server, never by the client). */
export interface PlayerCommand {
  player: number;
  command: Command;
}

/** Validates and applies one command. Returns false if it was dropped. */
export function applyCommand(
  world: World,
  player: number,
  command: Command,
  game: CompiledGame = GAME,
): boolean {
  if (world.status !== "playing") return false;
  if (!world.players[player] || world.players[player].defeated) return false;
  const handler = HANDLERS[command.type] as CommandHandler<CommandType>;
  const valid = handler.validate(world, player, command as CommandOf<CommandType>, game);
  if (!valid) return false;
  handler.apply(world, player, valid, game);
  return true;
}

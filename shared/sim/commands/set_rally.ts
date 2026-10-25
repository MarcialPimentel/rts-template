import { clampToMap, ownedProducer } from "./helpers";
import type { CommandHandler } from "./types";

/** Where a building's newly trained units walk to. */
export const setRally: CommandHandler<"set_rally"> = {
  validate(world, player, cmd, game) {
    if (!ownedProducer(world, player, cmd.building, game)) return null;
    return { type: "set_rally", building: cmd.building, ...clampToMap(cmd.x, cmd.y, game) };
  },
  apply(world, _player, cmd) {
    world.entities[cmd.building]!.rally = { x: cmd.x, y: cmd.y };
  },
};

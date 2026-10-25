import { clampToMap, groupDestinations, ownedMovableUnits } from "./helpers";
import type { CommandHandler } from "./types";

/** Walk to a point, fighting any enemy met on the way. Groups spread into a formation. */
export const attackMove: CommandHandler<"attack_move"> = {
  validate(world, player, cmd, game) {
    const units = ownedMovableUnits(world, player, cmd.units, game);
    if (units.length === 0) return null;
    return { type: "attack_move", units, ...clampToMap(cmd.x, cmd.y, game) };
  },
  apply(world, _player, cmd, game) {
    const goals = groupDestinations(world, cmd.units, cmd.x, cmd.y, game);
    cmd.units.forEach((id, i) => {
      const e = world.entities[id]!;
      e.order = { kind: "attack_move", ...goals[i]! };
      e.target = null;
    });
  },
};

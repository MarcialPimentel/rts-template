import { clampToMap, groupDestinations, ownedMovableUnits } from "./helpers";
import type { CommandHandler } from "./types";

/** Walk to a point, ignoring enemies on the way. Groups spread into a formation. */
export const move: CommandHandler<"move"> = {
  validate(world, player, cmd, game) {
    const units = ownedMovableUnits(world, player, cmd.units, game);
    if (units.length === 0) return null;
    return { type: "move", units, ...clampToMap(cmd.x, cmd.y, game) };
  },
  apply(world, _player, cmd, game) {
    const goals = groupDestinations(world, cmd.units, cmd.x, cmd.y, game);
    cmd.units.forEach((id, i) => {
      const e = world.entities[id]!;
      e.order = { kind: "move", ...goals[i]! };
      e.target = null;
    });
  },
};

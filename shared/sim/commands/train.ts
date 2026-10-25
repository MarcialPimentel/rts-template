import { ownedProducer, unitCount } from "./helpers";
import type { CommandHandler } from "./types";

/** Queue a unit at a building. Gold is paid when queued. */
export const train: CommandHandler<"train"> = {
  validate(world, player, cmd, game) {
    const building = ownedProducer(world, player, cmd.building, game);
    if (!building) return null;
    const def = game.defs[building.type]!;
    const unit = game.defs[cmd.unit];
    if (!unit || !def.produces.includes(cmd.unit)) return null;
    if (building.queue.length >= def.queueMax) return null;
    const state = world.players[player];
    if (!state || state.gold < unit.cost) return null;
    if (unitCount(world, player, game) >= game.economy.unitCap) return null;
    return { type: "train", building: cmd.building, unit: cmd.unit };
  },
  apply(world, player, cmd, game) {
    world.players[player]!.gold -= game.defs[cmd.unit]!.cost;
    world.entities[cmd.building]!.queue.push(cmd.unit);
  },
};

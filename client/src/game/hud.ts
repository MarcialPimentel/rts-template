import type { CompiledGame } from "../../../shared/data";
import type { ViewState } from "../../../shared/view";
import type { Input } from "./input";
import type { Session } from "./session";

/**
 * DOM overlay: top bar (gold, unit count, status line) and a bottom panel describing the
 * selection with its action buttons. Buttons send the same commands as the hotkeys.
 */
export class Hud {
  readonly top: HTMLDivElement;
  readonly bottom: HTMLDivElement;
  private readonly gold: HTMLSpanElement;
  private readonly units: HTMLSpanElement;
  private readonly status: HTMLSpanElement;
  private readonly panel: HTMLDivElement;
  private lastPanel = "";

  constructor(
    root: HTMLElement,
    private readonly game: CompiledGame,
    private readonly session: Session,
    private readonly input: Input,
  ) {
    this.top = el("div", "hud-top");
    this.gold = el("span", "hud-gold");
    this.units = el("span", "hud-units");
    this.status = el("span", "hud-status");
    const build = el("span", "hud-build");
    build.textContent = `build ${__BUILD_ID__}`;
    this.top.append(this.gold, this.units, this.status, build);

    this.bottom = el("div", "hud-bottom");
    this.panel = el("div", "hud-panel");
    this.bottom.append(this.panel);
    this.bottom.addEventListener("click", (e) => this.onClick(e));
    root.append(this.top, this.bottom);
  }

  update(view: ViewState): void {
    const me = view.players[this.session.localPlayer];
    this.gold.textContent = `Gold ${me ? me.gold : 0}`;
    const mine = view.entities.filter((e) => e.owner === this.session.localPlayer);
    const unitCount =
      mine.filter((e) => this.game.defs[e.type]?.kind === "unit").length +
      mine.reduce((n, e) => n + e.queue.length, 0);
    this.units.textContent = `Units ${unitCount}/${this.game.economy.unitCap}`;
    this.status.textContent = this.session.status();
    this.renderPanel(view);
  }

  private renderPanel(view: ViewState): void {
    const selected = this.input.selectedEntities();
    let html: string;
    if (selected.length === 0) {
      html = `<div class="hint">Drag to select units · Right-click to move or attack · A = attack-move · S = stop · Q = train · Arrows or screen edge to scroll</div>`;
    } else if (selected.length === 1 && this.game.defs[selected[0]!.type]?.kind === "building") {
      const b = selected[0]!;
      const def = this.game.defs[b.type]!;
      const own = b.owner === this.session.localPlayer;
      const rows = [`<div class="title">${def.name}</div>`, `<div>HP ${Math.ceil(b.hp)} / ${def.hp}</div>`];
      if (def.produces.length && own) {
        const unit = this.game.defs[def.produces[0]!]!;
        const pending = this.session.pendingTrains(b.id);
        const slots: string[] = [];
        for (let i = 0; i < def.queueMax; i++) {
          if (i < b.queue.length) {
            const pct = i === 0 ? Math.round(b.progress * 100) : 0;
            slots.push(`<span class="slot filled"><i style="width:${pct}%"></i></span>`);
          } else if (i < b.queue.length + pending) {
            slots.push(`<span class="slot pending"></span>`);
          } else {
            slots.push(`<span class="slot"></span>`);
          }
        }
        const gold = view.players[this.session.localPlayer]?.gold ?? 0;
        const full = b.queue.length + pending >= def.queueMax;
        const disabled = gold < unit.cost || full ? "disabled" : "";
        rows.push(`<div class="queue">${slots.join("")}</div>`);
        rows.push(
          `<button data-action="train" ${disabled}>Train ${unit.name} (Q) · ${unit.cost} gold</button>`,
          `<div class="hint">Right-click the ground to set the rally point</div>`,
        );
      } else if (def.incomePerTick > 0) {
        rows.push(`<div class="hint">+${Math.round(def.incomePerTick * 20)} gold per second</div>`);
      }
      html = rows.join("");
    } else {
      const counts = new Map<string, number>();
      let hp = 0;
      let maxHp = 0;
      for (const e of selected) {
        const def = this.game.defs[e.type]!;
        counts.set(def.name, (counts.get(def.name) ?? 0) + 1);
        hp += e.hp;
        maxHp += def.hp;
      }
      const names = [...counts].map(([n, c]) => `${c} × ${n}`).join(", ");
      const own = selected.some((e) => e.owner === this.session.localPlayer);
      html = `<div class="title">${names}</div><div>HP ${Math.ceil(hp)} / ${maxHp}</div>`;
      if (own) {
        const armed = this.input.attackMoveArmed ? " armed" : "";
        html += `<button data-action="attack-move" class="${armed}">Attack-move (A)</button><button data-action="stop">Stop (S)</button>`;
      }
    }
    if (html !== this.lastPanel) {
      this.panel.innerHTML = html;
      this.lastPanel = html;
    }
  }

  private onClick(e: MouseEvent): void {
    const button = (e.target as HTMLElement).closest("button");
    if (!button) return;
    switch (button.dataset.action) {
      case "train":
        this.input.train();
        break;
      case "stop":
        this.input.stop();
        break;
      case "attack-move":
        this.input.armAttackMove();
        break;
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

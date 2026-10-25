import "./style.css";
import { GameScreen } from "./game/game_screen";
import { LocalSession } from "./game/local_session";
import { OnlineController } from "./screens/online";

const app = document.getElementById("app")!;
let screen: { dispose(): void } | null = null;

function clear(): void {
  screen?.dispose();
  screen = null;
  app.innerHTML = "";
}

function showMenu(): void {
  clear();
  history.replaceState(null, "", location.pathname + keepServerParam());
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.innerHTML = `
    <h1>RTS Template</h1>
    <p class="tagline">Two players. One Town Hall each. Destroy theirs.</p>
    <div class="buttons">
      <button class="primary" data-action="online">Play online</button>
      <button data-action="sandbox">Sandbox (both players, offline)</button>
    </div>
    <p class="build">build ${__BUILD_ID__}</p>`;
  menu.querySelector('[data-action="online"]')!.addEventListener("click", () => startOnline());
  menu.querySelector('[data-action="sandbox"]')!.addEventListener("click", startSandbox);
  app.append(menu);
}

function startSandbox(): void {
  clear();
  history.replaceState(null, "", `?sandbox${keepServerParam("&")}`);
  screen = new GameScreen(app, new LocalSession(), {
    endActions: [
      { label: "Play again", run: startSandbox },
      { label: "Menu", run: showMenu },
    ],
  });
}

function startOnline(joinCode?: string): void {
  clear();
  history.replaceState(null, "", location.pathname + keepServerParam());
  screen = new OnlineController({ container: app, joinCode, onExit: showMenu });
}

/** Keeps testing parameters (?server= override, ?lag= latency simulation) across screens. */
function keepServerParam(prefix = "?"): string {
  const params = new URLSearchParams(location.search);
  const kept = ["server", "lag"]
    .filter((k) => params.has(k))
    .map((k) => `${k}=${encodeURIComponent(params.get(k)!)}`);
  return kept.length ? prefix + kept.join("&") : "";
}

const params = new URLSearchParams(location.search);
if (params.has("sandbox")) startSandbox();
else if (params.has("join")) startOnline(params.get("join") ?? undefined);
else showMenu();

import "./style.css";
import { GameScreen } from "./game/game_screen";
import { LocalSession } from "./game/local_session";

const app = document.getElementById("app")!;
let screen: { dispose(): void } | null = null;

function clear(): void {
  screen?.dispose();
  screen = null;
  app.innerHTML = "";
}

function showMenu(): void {
  clear();
  history.replaceState(null, "", location.pathname);
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.innerHTML = `
    <h1>RTS Template</h1>
    <p class="tagline">Two players. One Town Hall each. Destroy theirs.</p>
    <div class="buttons">
      <button data-action="sandbox">Sandbox (both players, offline)</button>
    </div>
    <p class="build">build ${__BUILD_ID__}</p>`;
  menu.querySelector('[data-action="sandbox"]')!.addEventListener("click", startSandbox);
  app.append(menu);
}

function startSandbox(): void {
  clear();
  history.replaceState(null, "", "?sandbox");
  screen = new GameScreen(app, new LocalSession(), {
    endActions: [
      { label: "Play again", run: startSandbox },
      { label: "Menu", run: showMenu },
    ],
  });
}

if (new URLSearchParams(location.search).has("sandbox")) startSandbox();
else showMenu();

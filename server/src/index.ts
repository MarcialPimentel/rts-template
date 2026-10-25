import { createServer } from "node:http";
import { BUILD_ID } from "./build";

const port = Number(process.env.PORT ?? 8080);

const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, build: BUILD_ID }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`RTS server build ${BUILD_ID} listening on :${port}`);
});

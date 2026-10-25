import { BUILD_ID } from "./build";
import { startServer } from "./server";

const port = Number(process.env.PORT ?? 8080);

const server = await startServer({ port, log: true });
console.log(`RTS server build ${BUILD_ID} listening on :${server.port}`);

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

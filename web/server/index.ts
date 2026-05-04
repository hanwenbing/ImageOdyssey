import { createApp } from "./routes";
import { loadServerEnvFromDir } from "./env";

loadServerEnvFromDir();

const app = createApp();
const port = 8787;
const host = "127.0.0.1";

app.listen(port, host, () => {
  console.log(`Local API server listening on http://${host}:${port}`);
});

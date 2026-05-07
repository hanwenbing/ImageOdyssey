import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getPort, loadApiEnv } from "./config/env";

loadApiEnv();

const port = getPort();

serve({
  fetch: createApp().fetch,
  hostname: "127.0.0.1",
  port
});

console.log(`ImageOdyssey API listening on http://127.0.0.1:${port}`);

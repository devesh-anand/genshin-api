import * as dotenv from 'dotenv';
dotenv.config();
import { createApp } from './app.js';
import { closeDb } from './lib/db.js';

const PORT = process.env.PORT || 5000;

const server = createApp().listen(PORT, () => {
   console.log(`app running on port ${PORT}`);
});

// Railway sends SIGTERM on redeploys: stop taking requests, then release database connections.
for (const signal of ['SIGTERM', 'SIGINT']) {
   process.once(signal, () => {
      server.close(async () => {
         await closeDb().catch((err) => console.error('[db] close failed:', err.message));
         process.exit(0);
      });
      setTimeout(() => process.exit(0), 10_000).unref(); // don't hang on long-lived connections
   });
}

// drizzle-kit configuration: `npm run db:generate` writes SQL migrations from db/schema.js.
// Migrations are applied by scripts/db-migrate.mjs (Railway pre-deploy), never by drizzle-kit push.
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
   dialect: 'postgresql',
   schema: './db/schema.js',
   out: './db/migrations',
   dbCredentials: { url: process.env.DATABASE_URL ?? '' },
   strict: true,
   verbose: true,
});

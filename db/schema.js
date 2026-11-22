/**
 * Database schema registry — every feature's tables, listed explicitly.
 *
 * Each feature that stores data keeps its Drizzle table definitions in
 * features/<name>/schema.js and is re-exported here. drizzle-kit reads this file to
 * generate migrations (npm run db:generate), and lib/db.js passes it to Drizzle.
 * Adding a feature with tables? Add one line. (Checked by db/schema.test.js.)
 *
 * Empty for now: the first tables arrive with accounts (Better Auth) in the next PR.
 */

export {};

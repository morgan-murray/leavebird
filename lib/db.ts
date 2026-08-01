import { Pool, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { clockedOffPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

function getPool() {
  const pool = globalForDb.clockedOffPool ?? createPool();
  globalForDb.clockedOffPool = pool;
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as {
  clockedOffPool?: Pool;
  clockedOffQueryCount?: number;
  clockedOffQueryTotalMs?: number;
  clockedOffConnectionFailures?: number;
};

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
  const started = performance.now();
  try {
    return await getPool().query<T>(text, values);
  } catch (error) {
    globalForDb.clockedOffConnectionFailures = (globalForDb.clockedOffConnectionFailures ?? 0) + 1;
    throw error;
  } finally {
    globalForDb.clockedOffQueryCount = (globalForDb.clockedOffQueryCount ?? 0) + 1;
    globalForDb.clockedOffQueryTotalMs = (globalForDb.clockedOffQueryTotalMs ?? 0) + (performance.now() - started);
  }
}

export function getDatabaseRuntimeStats() {
  const pool = getPool();
  const count = globalForDb.clockedOffQueryCount ?? 0;
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    connectionFailures: globalForDb.clockedOffConnectionFailures ?? 0,
    averageQueryMs: count ? (globalForDb.clockedOffQueryTotalMs ?? 0) / count : null,
  };
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

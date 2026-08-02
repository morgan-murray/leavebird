import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  const sql = await readFile(new URL("../db/migrations/001_postgres_auth.sql", import.meta.url), "utf8");
  await pool.query(sql);
  console.log("Database migration complete.");
} finally {
  await pool.end();
}

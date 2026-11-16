import { readFileSync } from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

// query(sql, params) -> rows. Set by initDb(); ESM live binding keeps importers current.
export let query;

// Real Postgres when DATABASE_URL is set (production); otherwise embedded PGlite, so local runs need no DB install.
export async function initDb(pgliteDir) {
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  if (process.env.DATABASE_URL && !pgliteDir) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(schema);
    query = async (sql, params) => (await pool.query(sql, params)).rows;
  } else {
    const db = new PGlite(pgliteDir ?? './data');
    await db.exec(schema);
    query = async (sql, params) => (await db.query(sql, params)).rows;
  }
}

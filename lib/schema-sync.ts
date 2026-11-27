/**
 * Keeps the real database in line with db/schema.ts for the rent features.
 *
 * Everything here is idempotent (IF NOT EXISTS), so it is safe to run on every
 * deploy, from `npm run db:migrate`, from the seed script, and lazily from the
 * app before its first query.
 *
 * When you add a column to db/schema.ts, add it to REQUIRED_COLUMNS and
 * MIGRATION_SQL too — otherwise queries will fail with
 * `PostgresError: column … does not exist` on databases that lack it.
 */

/** Every column the app SELECTs, per table (must match db/schema.ts). */
export const REQUIRED_COLUMNS: Record<string, string[]> = {
  flats: ["id", "district", "khoroo", "complex", "rooms", "area", "address", "deal_type", "lowest_price", "price_per_m2", "badge", "created_at"],
  listings: ["id", "flat_id", "source_url", "source", "title", "raw_description", "raw_price", "clean_price", "previous_price", "price_changed_at", "deal_type", "address", "district", "rooms", "area", "image_url", "photo_refs", "status", "owner_user_id", "payment_terms", "furnished", "created_at"],
  scrape_runs: ["id", "started_at", "finished_at", "status", "source", "pages_read", "listings_seen", "new_count", "failed_count", "error"],
  parse_errors: ["id", "url", "error_message", "created_at"],
  saved_searches: ["id", "user_id", "district", "rooms", "max_price", "is_paid_alert", "alert_mode", "last_checked_at", "created_at"],
  payments: ["id", "invoice_id", "user_id", "plan", "amount", "provider", "status", "created_at", "paid_at"],
  user_plans: ["user_id", "plan", "pro_until", "updated_at"],
  user_photos: ["id", "owner_user_id", "content_type", "data", "created_at"],
}

/** Additive only — safe for the app to run lazily before its first query. */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS scrape_runs (
  id serial PRIMARY KEY,
  started_at timestamp DEFAULT now(),
  finished_at timestamp,
  status text NOT NULL DEFAULT 'running',
  source text NOT NULL DEFAULT 'live',
  pages_read integer NOT NULL DEFAULT 0,
  listings_seen integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error text
);
CREATE TABLE IF NOT EXISTS parse_errors (
  id serial PRIMARY KEY,
  url text NOT NULL,
  error_message text,
  created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  district text,
  rooms integer,
  max_price integer,
  is_paid_alert boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  invoice_id text NOT NULL UNIQUE,
  user_id text NOT NULL,
  plan text NOT NULL DEFAULT 'pro',
  amount integer NOT NULL,
  provider text NOT NULL DEFAULT 'demo',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  paid_at timestamp
);
CREATE TABLE IF NOT EXISTS user_plans (
  user_id text PRIMARY KEY,
  plan text NOT NULL DEFAULT 'pro',
  pro_until timestamp NOT NULL,
  updated_at timestamp DEFAULT now()
);
ALTER TABLE flats ADD COLUMN IF NOT EXISTS khoroo text;
ALTER TABLE flats ADD COLUMN IF NOT EXISTS complex text;
ALTER TABLE flats ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE flats ADD COLUMN IF NOT EXISTS deal_type text DEFAULT 'rent';
ALTER TABLE flats ADD COLUMN IF NOT EXISTS lowest_price integer;
ALTER TABLE flats ADD COLUMN IF NOT EXISTS price_per_m2 numeric;
ALTER TABLE flats ADD COLUMN IF NOT EXISTS badge text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source text DEFAULT 'unegui';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deal_type text DEFAULT 'rent';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS photo_refs text;
ALTER TABLE listings ALTER COLUMN source_url DROP NOT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS previous_price integer;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS owner_user_id text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS furnished boolean;
CREATE INDEX IF NOT EXISTS listings_owner_user_id_idx ON listings (owner_user_id);
CREATE TABLE IF NOT EXISTS user_photos (
  id serial PRIMARY KEY,
  owner_user_id text NOT NULL,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamp DEFAULT now()
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_changed_at timestamp;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS alert_mode text NOT NULL DEFAULT 'daily';
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS last_checked_at timestamp DEFAULT now();
`

/**
 * Spec N3 — "Phone numbers or agent names. We do not store them."
 * Removes the poster/agent data an earlier version stored. Destructive, so it
 * runs only from `npm run db:migrate` / `npm run db:seed`, never from the app.
 */
export const N3_CLEANUP_SQL = `
ALTER TABLE listings DROP COLUMN IF EXISTS poster_id;
ALTER TABLE listings DROP COLUMN IF EXISTS agent_name;
DROP TABLE IF EXISTS posters;
`

export const MISSING_COLUMNS_SQL = `
SELECT required.table_name, required.column_name
FROM (VALUES ${Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) => columns.map((column) => `('${table}', '${column}')`)).join(", ")})
  AS required(table_name, column_name)
LEFT JOIN information_schema.columns c
  ON c.table_schema = current_schema() AND c.table_name = required.table_name AND c.column_name = required.column_name
WHERE c.column_name IS NULL
`

type UnsafeSql = { unsafe: (query: string) => PromiseLike<unknown> }

/** Returns "table.column" for every required column the database lacks. */
export async function findMissingColumns(sql: UnsafeSql): Promise<string[]> {
  const rows = (await sql.unsafe(MISSING_COLUMNS_SQL)) as Array<{ table_name: string; column_name: string }>
  return rows.map((row) => `${row.table_name}.${row.column_name}`)
}

/** Apply the migration only when something is missing. Returns what was missing. */
export async function syncSchema(sql: UnsafeSql): Promise<string[]> {
  const missing = await findMissingColumns(sql)
  if (missing.length) await sql.unsafe(MIGRATION_SQL)
  return missing
}

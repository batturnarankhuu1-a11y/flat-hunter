/**
 * Bring the database in line with db/schema.ts.
 *
 *   npm run db:migrate
 */
import postgres from "postgres"
import dotenv from "dotenv"
import { N3_CLEANUP_SQL, findMissingColumns, syncSchema } from "../lib/schema-sync.ts"

dotenv.config({ path: ".env.local", quiet: true })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is not configured (.env.local)")
const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined })

try {
  const missing = await syncSchema(sql)
  await sql.unsafe(N3_CLEANUP_SQL)
  console.log("N3: agent/poster names and columns removed (if they existed).")
  console.log(missing.length ? `Added missing columns: ${missing.join(", ")}` : "Schema already up to date.")
  const stillMissing = await findMissingColumns(sql)
  if (stillMissing.length) throw new Error(`Still missing after migration: ${stillMissing.join(", ")}`)
  console.log("All columns used by the app exist.")
} finally {
  await sql.end({ timeout: 5 })
}

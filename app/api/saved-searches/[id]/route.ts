import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { savedSearches } from "@/db/schema"
import { ALERT_MODES, type AlertMode } from "@/lib/alerts"
import { getPlanStatus } from "@/lib/billing"
import { ensureSchema, getDb } from "@/lib/db"
import { parseId } from "@/lib/flats"

/**
 * PATCH /api/saved-searches/:id  { alertMode?: "daily" | "instant" | "off", markChecked?: true }
 * "instant" alerts need Pro (402 → the client opens the Wire.mn checkout).
 */
export async function PATCH(request: Request, context: RouteContext<"/api/saved-searches/[id]">): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Нэвтэрнэ үү" }, { status: 401 })
  const id = parseId((await context.params).id)
  if (id === null) return Response.json({ error: "Not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 })
  }
  const changes: { alertMode?: AlertMode; isPaidAlert?: boolean; lastCheckedAt?: Date } = {}
  if (body.alertMode !== undefined) {
    if (!ALERT_MODES.includes(body.alertMode as AlertMode)) return Response.json({ error: "alertMode: daily | instant | off" }, { status: 400 })
    changes.alertMode = body.alertMode as AlertMode
    if (changes.alertMode === "instant") {
      const status = await getPlanStatus(userId)
      if (status.plan !== "pro") return Response.json({ error: "Шуурхай мэдэгдэл зөвхөн Pro эрхтэй.", needsPro: true }, { status: 402 })
      changes.isPaidAlert = true
    } else changes.isPaidAlert = false
  }
  if (body.markChecked === true) changes.lastCheckedAt = new Date()
  if (Object.keys(changes).length === 0) return Response.json({ error: "Nothing to change" }, { status: 400 })

  await ensureSchema()
  const [updated] = await getDb().update(savedSearches).set(changes)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    .returning()
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json({ saved: updated })
}

/** DELETE /api/saved-searches/:id */
export async function DELETE(_request: Request, context: RouteContext<"/api/saved-searches/[id]">): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Нэвтэрнэ үү" }, { status: 401 })
  const id = parseId((await context.params).id)
  if (id === null) return Response.json({ error: "Not found" }, { status: 404 })
  await ensureSchema()
  const deleted = await getDb().delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId))).returning()
  return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 })
}

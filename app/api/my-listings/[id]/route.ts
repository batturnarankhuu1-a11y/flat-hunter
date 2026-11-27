import { auth } from "@clerk/nextjs/server"
import { ensureSchema, getDb } from "@/lib/db"
import { parseId } from "@/lib/flats"
import { requestLocale, tr } from "@/lib/i18n"
import { deleteOwnerListing, setOwnerListingVisible } from "@/lib/owner-listings"

/** PATCH /api/my-listings/:id { visible: boolean } — hide or show the owner's own listing. */
export async function PATCH(request: Request, context: RouteContext<"/api/my-listings/[id]">): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: tr(requestLocale(request), "Нэвтэрнэ үү", "Please sign in") }, { status: 401 })
  const id = parseId((await context.params).id)
  const body = await request.json().catch(() => null) as { visible?: unknown } | null
  if (id === null || typeof body?.visible !== "boolean") return Response.json({ error: "{ visible: true | false }" }, { status: 400 })
  await ensureSchema()
  const status = await setOwnerListingVisible(getDb(), userId, id, body.visible)
  return status ? Response.json({ id, status }) : Response.json({ error: "Not found" }, { status: 404 })
}

/** DELETE /api/my-listings/:id — remove the owner's own listing (and its photos). */
export async function DELETE(request: Request, context: RouteContext<"/api/my-listings/[id]">): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: tr(requestLocale(request), "Нэвтэрнэ үү", "Please sign in") }, { status: 401 })
  const id = parseId((await context.params).id)
  if (id === null) return Response.json({ error: "Not found" }, { status: 404 })
  await ensureSchema()
  return (await deleteOwnerListing(getDb(), userId, id)) ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 })
}

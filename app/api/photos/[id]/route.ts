import { eq } from "drizzle-orm"
import { userPhotos } from "@/db/schema"
import { ensureSchema, getDb } from "@/lib/db"
import { parseId } from "@/lib/flats"

/** GET /api/photos/:id → an owner's uploaded listing photo (public, cached for a year — ids never change). */
export async function GET(_request: Request, context: RouteContext<"/api/photos/[id]">): Promise<Response> {
  const id = parseId((await context.params).id)
  if (id === null) return new Response("Not found", { status: 404 })
  await ensureSchema()
  const [photo] = await getDb().select({ contentType: userPhotos.contentType, data: userPhotos.data }).from(userPhotos).where(eq(userPhotos.id, id)).limit(1)
  if (!photo) return new Response("Not found", { status: 404 })
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  })
}

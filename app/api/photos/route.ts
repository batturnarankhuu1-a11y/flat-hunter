import { auth } from "@clerk/nextjs/server"
import { count, eq } from "drizzle-orm"
import { userPhotos } from "@/db/schema"
import { ensureSchema, getDb } from "@/lib/db"
import { requestLocale, tr } from "@/lib/i18n"

const MAX_BYTES = 1_500_000 // the browser resizes to ≤ 1600px first, so real photos are ~150–400 KB
const MAX_PHOTOS_PER_USER = 80

function imageType(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp"
  if (bytes.subarray(1, 4).toString("latin1") === "PNG") return "image/png"
  return null
}

/** POST /api/photos  (body: the image bytes) → { url: "/api/photos/123" }. Signed-in owners only. */
export async function POST(request: Request): Promise<Response> {
  const say = (mn: string, en: string) => tr(requestLocale(request), mn, en)
  const { userId } = await auth()
  if (!userId) return Response.json({ error: say("Зураг оруулахын тулд нэвтэрнэ үү", "Please sign in to upload photos") }, { status: 401 })
  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length === 0) return Response.json({ error: say("Зураг хоосон байна", "The image is empty") }, { status: 400 })
  if (bytes.length > MAX_BYTES) return Response.json({ error: say("Зураг хэт том байна (1.5 MB хүртэл)", "The image is too large (up to 1.5 MB)") }, { status: 413 })
  const contentType = imageType(bytes)
  if (!contentType) return Response.json({ error: say("Зөвхөн JPG, PNG, WebP зураг", "Only JPG, PNG or WebP images") }, { status: 415 })

  await ensureSchema()
  const db = getDb()
  const [{ value }] = await db.select({ value: count() }).from(userPhotos).where(eq(userPhotos.ownerUserId, userId))
  if (Number(value) >= MAX_PHOTOS_PER_USER) return Response.json({ error: say("Зургийн хязгаарт хүрсэн байна", "You have reached the photo limit") }, { status: 429 })
  const [photo] = await db.insert(userPhotos).values({ ownerUserId: userId, contentType, data: bytes }).returning({ id: userPhotos.id })
  return Response.json({ url: `/api/photos/${photo.id}` }, { status: 201 })
}

import { adminAccess } from "@/lib/admin"

/** GET /api/admin/me → { admin: boolean } (shows the "Админ" link in the header). */
export async function GET(): Promise<Response> {
  const access = await adminAccess()
  return Response.json({ admin: access.allowed })
}

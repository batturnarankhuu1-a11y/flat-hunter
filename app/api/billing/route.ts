import { auth } from "@clerk/nextjs/server"
import { PRO_DAYS, PRO_PRICE_MNT, demoPaymentsEnabled, getPlanStatus } from "@/lib/billing"

/** GET /api/billing → the signed-in user's plan (free / pro) and saved-search usage. */
export async function GET(): Promise<Response> {
  const { userId } = await auth()
  const offer = { price: PRO_PRICE_MNT, days: PRO_DAYS, demo: demoPaymentsEnabled() }
  if (!userId) return Response.json({ signedIn: false, offer })
  try {
    return Response.json({ signedIn: true, offer, ...(await getPlanStatus(userId)) })
  } catch {
    return Response.json({ error: "Төлбөрийн мэдээллийг ачаалж чадсангүй" }, { status: 503 })
  }
}

import "server-only"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { and, count, eq, sql } from "drizzle-orm"
import { payments, savedSearches, userPlans } from "@/db/schema"
import { ensureSchema, getDb } from "@/lib/db"

/**
 * Pro plan sold through Wire.mn: 9,900₮ for 30 days of unlimited saved searches.
 *
 * Flow: POST /api/wire/invoice → pending `payments` row + QR → the customer pays in their bank app →
 * Wire.mn calls POST /api/wire/webhook → the payment is marked paid and `user_plans.pro_until` moves
 * 30 days ahead.
 *
 * Demo mode (default; turn off with WIRE_DEMO_PAYMENTS=off): invoices are created locally
 * (provider "demo") and the modal's "Төлбөр баталгаажуулах (Demo Webhook)" button calls the same
 * webhook — accepted only for a demo invoice of the signed-in user. Real Wire.mn webhooks must carry
 * `x-wire-signature` = hex HMAC-SHA256 of the raw body with WIRE_WEBHOOK_SECRET.
 */
import { FREE_SAVED_SEARCHES, PRO_DAYS, PRO_PRICE_MNT } from "@/lib/plans"
export { FREE_SAVED_SEARCHES, PRO_DAYS, PRO_PRICE_MNT }

export const demoPaymentsEnabled = () => process.env.WIRE_DEMO_PAYMENTS?.trim().toLowerCase() !== "off"

export interface PlanStatus {
  plan: "free" | "pro"
  proUntil: string | null
  savedSearches: number
  /** null = unlimited. */
  savedSearchLimit: number | null
}

export async function getPlanStatus(userId: string): Promise<PlanStatus> {
  await ensureSchema()
  const db = getDb()
  const [[plan], [saved]] = await Promise.all([
    db.select().from(userPlans).where(eq(userPlans.userId, userId)).limit(1),
    db.select({ value: count() }).from(savedSearches).where(eq(savedSearches.userId, userId)),
  ])
  const isPro = plan !== undefined && plan.proUntil.getTime() > Date.now()
  return {
    plan: isPro ? "pro" : "free",
    proUntil: isPro ? plan.proUntil.toISOString() : null,
    savedSearches: Number(saved?.value ?? 0),
    savedSearchLimit: isPro ? null : FREE_SAVED_SEARCHES,
  }
}

export interface Invoice {
  invoiceId: string
  amount: number
  provider: "demo" | "wire"
  /** What the QR code encodes. */
  qrPayload: string
}

/** A pending Pro invoice for the user. (Real Wire.mn invoice creation plugs in here once its API keys are issued.) */
export async function createProInvoice(userId: string): Promise<Invoice> {
  if (!demoPaymentsEnabled()) throw new Error("Wire.mn is not configured: set WIRE_DEMO_PAYMENTS or add the Wire.mn invoice API")
  await ensureSchema()
  const invoiceId = `FH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(4).toString("hex").toUpperCase()}`
  await getDb().insert(payments).values({ invoiceId, userId, plan: "pro", amount: PRO_PRICE_MNT, provider: "demo", status: "pending" })
  return { invoiceId, amount: PRO_PRICE_MNT, provider: "demo", qrPayload: `WIRE.MN|DEMO|${invoiceId}|${PRO_PRICE_MNT}MNT|Flat Hunter Pro ${PRO_DAYS} хоног` }
}

export async function findPayment(invoiceId: string) {
  await ensureSchema()
  const [payment] = await getDb().select().from(payments).where(eq(payments.invoiceId, invoiceId)).limit(1)
  return payment ?? null
}

/** Mark the invoice paid and extend the user's Pro plan by 30 days. Idempotent: a second call changes nothing. */
export async function confirmPayment(invoiceId: string): Promise<{ userId: string; proUntil: Date; alreadyPaid: boolean } | null> {
  await ensureSchema()
  return getDb().transaction(async (tx) => {
    const [paid] = await tx.update(payments)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "pending")))
      .returning()
    if (!paid) {
      const [existing] = await tx.select().from(payments).where(eq(payments.invoiceId, invoiceId)).limit(1)
      if (!existing) return null
      const [plan] = await tx.select().from(userPlans).where(eq(userPlans.userId, existing.userId)).limit(1)
      return { userId: existing.userId, proUntil: plan?.proUntil ?? new Date(), alreadyPaid: true }
    }
    const extend = sql`GREATEST(COALESCE(${userPlans.proUntil}, now()), now()) + make_interval(days => ${PRO_DAYS})`
    const [plan] = await tx.insert(userPlans)
      .values({ userId: paid.userId, plan: "pro", proUntil: sql`now() + make_interval(days => ${PRO_DAYS})`, updatedAt: new Date() })
      .onConflictDoUpdate({ target: userPlans.userId, set: { plan: "pro", proUntil: extend, updatedAt: new Date() } })
      .returning()
    return { userId: paid.userId, proUntil: plan.proUntil, alreadyPaid: false }
  })
}

/** Wire.mn signature: hex HMAC-SHA256 of the raw request body with WIRE_WEBHOOK_SECRET. */
export function hasValidWireSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WIRE_WEBHOOK_SECRET?.trim()
  if (!secret || !signature) return false
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"))
  const given = Buffer.from(signature.trim().toLowerCase())
  return expected.length === given.length && timingSafeEqual(expected, given)
}

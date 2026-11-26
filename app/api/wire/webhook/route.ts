import { auth } from "@clerk/nextjs/server"
import { confirmPayment, demoPaymentsEnabled, findPayment, hasValidWireSignature } from "@/lib/billing"

/**
 * POST /api/wire/webhook  { "invoice_id": "FH-…", "status": "paid" }
 *
 * Wire.mn calls this when an invoice is paid. Accepted when either
 *   - `x-wire-signature` is the HMAC-SHA256 of the raw body with WIRE_WEBHOOK_SECRET (real Wire.mn), or
 *   - demo mode is on, the invoice is a demo invoice, and the caller is the signed-in owner of the
 *     invoice (the modal's "Төлбөр баталгаажуулах (Demo Webhook)" button) — no money moves.
 * Paid → the invoice is marked paid and the user's Pro plan is extended by 30 days (idempotent).
 */
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 })
  }
  const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : typeof body.invoiceId === "string" ? body.invoiceId : null
  if (!invoiceId) return Response.json({ error: "invoice_id is required" }, { status: 400 })

  const payment = await findPayment(invoiceId)
  if (!payment) return Response.json({ error: "Unknown invoice" }, { status: 404 })

  const signed = hasValidWireSignature(raw, request.headers.get("x-wire-signature"))
  if (!signed) {
    const { userId } = await auth()
    const demoAllowed = demoPaymentsEnabled() && payment.provider === "demo" && userId !== null && userId === payment.userId
    if (!demoAllowed) return Response.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  if (body.status !== undefined && body.status !== "paid") {
    return Response.json({ ok: true, invoiceId, status: payment.status, ignored: `status ${String(body.status)}` })
  }
  const result = await confirmPayment(invoiceId)
  if (!result) return Response.json({ error: "Unknown invoice" }, { status: 404 })
  return Response.json({
    ok: true,
    invoiceId,
    status: "paid",
    plan: "pro",
    proUntil: result.proUntil.toISOString(),
    alreadyPaid: result.alreadyPaid,
    message: "Pro эрх идэвхжлээ",
  })
}

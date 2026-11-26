import { auth } from "@clerk/nextjs/server"
import QRCode from "qrcode"
import { PRO_DAYS, createProInvoice } from "@/lib/billing"

/** POST /api/wire/invoice → a pending Wire.mn invoice for the Pro plan, with its QR code (SVG). */
export async function POST(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Pro эрх авахын тулд нэвтэрнэ үү", needsSignIn: true }, { status: 401 })
  try {
    const invoice = await createProInvoice(userId)
    const qrSvg = await QRCode.toString(invoice.qrPayload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#102c27", light: "#ffffff" } })
    return Response.json({ invoiceId: invoice.invoiceId, amount: invoice.amount, days: PRO_DAYS, provider: invoice.provider, qrSvg }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Нэхэмжлэх үүсгэж чадсангүй" }, { status: 503 })
  }
}

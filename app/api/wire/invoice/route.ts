import { auth } from "@clerk/nextjs/server"
import { requestLocale, tr } from "@/lib/i18n"
import QRCode from "qrcode"
import { PRO_DAYS, createProInvoice } from "@/lib/billing"

/** POST /api/wire/invoice → a pending Wire.mn invoice for the Pro plan, with its QR code (SVG). */
export async function POST(request: Request): Promise<Response> {
  const locale = requestLocale(request)
  const { userId } = await auth()
  if (!userId) return Response.json({ error: tr(locale, "Pro эрх авахын тулд нэвтэрнэ үү", "Sign in to get Pro"), needsSignIn: true }, { status: 401 })
  try {
    const invoice = await createProInvoice(userId)
    const qrSvg = await QRCode.toString(invoice.qrPayload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#102c27", light: "#ffffff" } })
    return Response.json({ invoiceId: invoice.invoiceId, amount: invoice.amount, days: PRO_DAYS, provider: invoice.provider, qrSvg }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : tr(locale, "Нэхэмжлэх үүсгэж чадсангүй", "Could not create the invoice") }, { status: 503 })
  }
}

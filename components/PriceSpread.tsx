import { formatMnt } from "@/lib/rent-price"

const WIDTH = 640
const HEIGHT = 120
const PAD = { left: 16, right: 16, top: 24, bottom: 30 }
const short = (value: number) => `${Math.round(value / 1_000)}k`

/**
 * Every comparable listing's ₮/m² as a dot on one axis, with the group median and (optionally)
 * one highlighted flat — a comparison that works even before there is any price history.
 */
export default function PriceSpread({ values, median, highlight, title }: {
  values: Array<{ id: number; perM2: number }>
  median: number | null
  highlight?: { label: string; perM2: number }
  title: string
}) {
  if (values.length === 0 || median === null) return <p className="text-sm text-slate-500">Харьцуулах зар алга.</p>
  const all = [...values.map((value) => value.perM2), ...(highlight ? [highlight.perM2] : [])]
  const min = Math.min(...all) * 0.95
  const max = Math.max(...all) * 1.05
  const x = (value: number) => PAD.left + ((value - min) / (max - min || 1)) * (WIDTH - PAD.left - PAD.right)
  const mid = (PAD.top + HEIGHT - PAD.bottom) / 2
  return (
    <figure>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="h-auto w-full">
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={mid} y2={mid} stroke="#e2e8f0" strokeWidth="2" />
        {values.map((value, index) => (
          <circle key={value.id} cx={x(value.perM2)} cy={mid + ((index % 5) - 2) * 6} r="5" fill="#059669" fillOpacity="0.45">
            <title>{`Зар [${value.id}]: ${formatMnt(value.perM2)}/м²`}</title>
          </circle>
        ))}
        <line x1={x(median)} x2={x(median)} y1={PAD.top - 6} y2={HEIGHT - PAD.bottom + 4} stroke="#0f172a" strokeWidth="2" />
        <text x={x(median)} y={PAD.top - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">медиан {short(median)}</text>
        {highlight && (
          <g>
            <circle cx={x(highlight.perM2)} cy={mid} r="8" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
            <text x={x(highlight.perM2)} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#b45309">{highlight.label}</text>
          </g>
        )}
        <text x={PAD.left} y={HEIGHT - 8} fontSize="11" fill="#64748b">{short(min)}</text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fontSize="11" fill="#64748b">{short(max)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-slate-500">Цэг бүр нэг зарын ₮/м² ({values.length} зар); хар шугам — медиан.</figcaption>
    </figure>
  )
}

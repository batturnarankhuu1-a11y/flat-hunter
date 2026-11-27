import T, { SvgT } from "@/components/T"
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
  /** `labelEn` falls back to `label`. */
  highlight?: { label: string; labelEn?: string; perM2: number }
  title: string
}) {
  if (values.length === 0 || median === null) return <p className="text-sm text-slate-500"><T mn="Харьцуулах зар алга." en="No listings to compare." /></p>
  const all = [...values.map((value) => value.perM2), ...(highlight ? [highlight.perM2] : [])]
  const min = Math.min(...all) * 0.95
  const max = Math.max(...all) * 1.05
  const x = (value: number) => PAD.left + ((value - min) / (max - min || 1)) * (WIDTH - PAD.left - PAD.right)
  const mid = (PAD.top + HEIGHT - PAD.bottom) / 2
  const count = values.length
  return (
    <figure>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="h-auto w-full">
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={mid} y2={mid} className="chart-grid" strokeWidth="2" />
        {values.map((value, index) => (
          <circle key={value.id} cx={x(value.perM2)} cy={mid + ((index % 5) - 2) * 6} r="5" fill="#059669" fillOpacity="0.45">
            <title>{`[${value.id}]: ${formatMnt(value.perM2)}/м²`}</title>
          </circle>
        ))}
        <line x1={x(median)} x2={x(median)} y1={PAD.top - 6} y2={HEIGHT - PAD.bottom + 4} className="chart-ink-stroke" strokeWidth="2" />
        <text x={x(median)} y={PAD.top - 10} textAnchor="middle" fontSize="11" fontWeight="600" className="chart-ink"><SvgT mn={`медиан ${short(median)}`} en={`median ${short(median)}`} /></text>
        {highlight && (
          <g>
            <circle cx={x(highlight.perM2)} cy={mid} r="8" fill="#f59e0b" className="chart-dot-stroke" strokeWidth="2" />
            <text x={x(highlight.perM2)} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fontWeight="600" className="chart-reference"><SvgT mn={highlight.label} en={highlight.labelEn ?? highlight.label} /></text>
          </g>
        )}
        <text x={PAD.left} y={HEIGHT - 8} fontSize="11" className="chart-label">{short(min)}</text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fontSize="11" className="chart-label">{short(max)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-slate-500">
        <T mn={`Цэг бүр нэг зарын ₮/м² (${count} зар); хар шугам — медиан.`} en={`Each dot is one listing's ₮/m² (${count} listing${count === 1 ? "" : "s"}); the dark line is the median.`} />
      </figcaption>
    </figure>
  )
}

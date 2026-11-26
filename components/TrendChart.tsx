import type { TrendPoint, TrendUnit } from "@/lib/market-stats"

export interface TrendSeries {
  label: string
  color: string
  points: TrendPoint[]
}

const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 34, left: 64 }

const short = (value: number) => (value >= 1_000_000 ? `${Number((value / 1_000_000).toFixed(2))} сая` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(Math.round(value)))
const dayLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

/**
 * Median line chart per day or week (plain SVG, works without JavaScript). Empty buckets are gaps.
 * When the main series has fewer than two buckets with listings there is no trend to draw yet,
 * so it says so instead of drawing a misleading line.
 */
export default function TrendChart({ series, metric, unit, reference, title }: {
  series: TrendSeries[]
  metric: "medianPerM2" | "medianRent"
  unit: TrendUnit
  /** Optional horizontal line, e.g. this flat's own ₮/m². */
  reference?: { label: string; value: number }
  title: string
}) {
  const buckets = series[0]?.points.map((point) => point.start) ?? []
  const filled = series[0]?.points.filter((point) => point[metric] !== null) ?? []
  if (filled.length < 2) {
    const total = series[0]?.points.reduce((sum, point) => sum + point.count, 0) ?? 0
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Тренд зурахад хангалттай хугацааны түүх алга: энэ бүлгийн {total} зар {filled.length === 1 ? `${dayLabel(filled[0].start)}-нд` : "сүүлийн хугацаанд"} нийтлэгдсэн. Шинэ зар нэмэгдэх тусам {unit === "day" ? "өдөр" : "долоо хоног"} бүрийн медиан энд зурагдана.
      </p>
    )
  }
  const values = series.flatMap((item) => item.points.map((point) => point[metric]).filter((value): value is number => value !== null))
  if (reference) values.push(reference.value)
  const min = Math.min(...values) * 0.9
  const max = Math.max(...values) * 1.1
  const x = (index: number) => PAD.left + (index / Math.max(buckets.length - 1, 1)) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min || 1)) * (HEIGHT - PAD.top - PAD.bottom)
  const ticks = [0, 0.5, 1].map((t) => min + (max - min) * t)
  const labelEvery = buckets.length > 8 ? 2 : 1

  return (
    <figure>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="h-auto w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">{short(tick)}</text>
          </g>
        ))}
        {buckets.map((bucket, index) => index % labelEvery === 0 && (
          <text key={bucket} x={x(index)} y={HEIGHT - 12} textAnchor="middle" fontSize="11" fill="#64748b">{dayLabel(bucket)}</text>
        ))}
        {reference && (
          <g>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(reference.value)} y2={y(reference.value)} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth="1.5" />
            <text x={WIDTH - PAD.right} y={y(reference.value) - 6} textAnchor="end" fontSize="11" fontWeight="600" fill="#b45309">{reference.label}</text>
          </g>
        )}
        {series.map((item) => {
          const segments: Array<Array<[number, number]>> = [[]]
          item.points.forEach((point, index) => {
            const value = point[metric]
            if (value === null) { if (segments.at(-1)!.length) segments.push([]); return }
            segments.at(-1)!.push([x(index), y(value)])
          })
          return (
            <g key={item.label}>
              {segments.filter((segment) => segment.length > 1).map((segment, index) => (
                <polyline key={index} points={segment.map(([px, py]) => `${px},${py}`).join(" ")} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" />
              ))}
              {item.points.map((point, index) => {
                const value = point[metric]
                return value === null ? null : (
                  <g key={point.start}>
                    <circle cx={x(index)} cy={y(value)} r="4" fill="#fff" stroke={item.color} strokeWidth="2" />
                    <title>{`${dayLabel(point.start)}: ${short(value)} (${point.count} зар)`}</title>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
            {item.label} ({item.points.reduce((sum, point) => sum + point.count, 0)} зар)
          </span>
        ))}
        {reference && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-500" />{reference.label}</span>}
      </figcaption>
    </figure>
  )
}

import T, { SvgT } from "@/components/T"
import type { TrendPoint, TrendUnit } from "@/lib/market-stats"

export interface TrendSeries {
  label: string
  /** English label; falls back to `label`. */
  labelEn?: string
  color: string
  points: TrendPoint[]
}

const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 34, left: 64 }

const shortMn = (value: number) => (value >= 1_000_000 ? `${Number((value / 1_000_000).toFixed(2))} сая` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(Math.round(value)))
const shortEn = (value: number) => (value >= 1_000_000 ? `${Number((value / 1_000_000).toFixed(2))}M` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(Math.round(value)))
const dayLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
const plural = (count: number) => `${count} listing${count === 1 ? "" : "s"}`

/**
 * Median line chart per day or week (plain SVG, works without JavaScript). Empty buckets are gaps.
 * When the main series has fewer than two buckets with listings there is no trend to draw yet,
 * so it says so instead of drawing a misleading line. Text is bilingual, colours follow the theme.
 */
export default function TrendChart({ series, metric, unit, reference, title }: {
  series: TrendSeries[]
  metric: "medianPerM2" | "medianRent"
  unit: TrendUnit
  /** Optional horizontal line, e.g. this flat's own ₮/m². `labelEn` falls back to `label`. */
  reference?: { label: string; labelEn?: string; value: number }
  title: string
}) {
  const buckets = series[0]?.points.map((point) => point.start) ?? []
  const filled = series[0]?.points.filter((point) => point[metric] !== null) ?? []
  if (filled.length < 2) {
    const total = series[0]?.points.reduce((sum, point) => sum + point.count, 0) ?? 0
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
        <T
          mn={`Тренд зурахад хангалттай хугацааны түүх алга: энэ бүлгийн ${total} зар ${filled.length === 1 ? `${dayLabel(filled[0].start)}-нд` : "сүүлийн хугацаанд"} нийтлэгдсэн. Шинэ зар нэмэгдэх тусам ${unit === "day" ? "өдөр" : "долоо хоног"} бүрийн медиан энд зурагдана.`}
          en={`Not enough history to draw a trend yet: the ${plural(total)} in this group ${filled.length === 1 ? `were posted on ${dayLabel(filled[0].start)}` : "were posted recently"}. As new listings arrive, the ${unit === "day" ? "daily" : "weekly"} median will appear here.`}
        />
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
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" className="chart-label"><SvgT mn={shortMn(tick)} en={shortEn(tick)} /></text>
          </g>
        ))}
        {buckets.map((bucket, index) => index % labelEvery === 0 && (
          <text key={bucket} x={x(index)} y={HEIGHT - 12} textAnchor="middle" fontSize="11" className="chart-label">{dayLabel(bucket)}</text>
        ))}
        {reference && (
          <g>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(reference.value)} y2={y(reference.value)} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth="1.5" />
            <text x={WIDTH - PAD.right} y={y(reference.value) - 6} textAnchor="end" fontSize="11" fontWeight="600" className="chart-reference"><SvgT mn={reference.label} en={reference.labelEn ?? reference.label} /></text>
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
                    <circle cx={x(index)} cy={y(value)} r="4" className="chart-dot" stroke={item.color} strokeWidth="2" />
                    <title>{`${dayLabel(point.start)}: ${shortEn(value)} ₮ (${point.count})`}</title>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {series.map((item) => {
          const count = item.points.reduce((sum, point) => sum + point.count, 0)
          return (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              <T mn={`${item.label} (${count} зар)`} en={`${item.labelEn ?? item.label} (${plural(count)})`} />
            </span>
          )
        })}
        {reference && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-500" /><T mn={reference.label} en={reference.labelEn ?? reference.label} /></span>}
      </figcaption>
    </figure>
  )
}

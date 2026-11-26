import SafeImage from "@/components/SafeImage"
import { photoLabel } from "@/lib/privacy"

const PLACEHOLDER = "/apartment-placeholder.svg"

export function splitGallery(imageUrl: string | null | undefined): string[] {
  const images = (imageUrl ?? "").split(",").map((src) => src.trim()).filter(Boolean)
  return images.length ? images : [PLACEHOLDER]
}

function Photo({ src, title, priority, className, small }: { src: string; title: string; priority?: boolean; className: string; small?: boolean }) {
  return (
    <figure className="relative h-full overflow-hidden">
      <SafeImage src={src} alt={`${title} — ${photoLabel(src)}`} width={small ? 600 : 1200} height={small ? 400 : 800} priority={priority} className={`w-full bg-slate-100 object-cover ${className}`} />
      {/* Only our own labelled files (…-kitchen.webp) have a room name; ad photos need no caption. */}
      {photoLabel(src) !== "Зураг" && <figcaption className={`absolute rounded-md bg-slate-950/70 font-semibold text-white ${small ? "bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px]" : "bottom-2 left-2 px-2 py-1 text-[11px]"}`}>{photoLabel(src)}</figcaption>}
    </figure>
  )
}

/**
 * Gallery that always fills its box: 1 photo → full width, 2 → side by side,
 * 3–4 → main photo with the others stacked beside it (no empty gaps).
 */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const photos = images.slice(0, 4)
  if (photos.length === 1) {
    return <div className="overflow-hidden rounded-2xl"><Photo src={photos[0]} title={title} priority className="h-64 sm:h-96" /></div>
  }
  if (photos.length === 2) {
    return (
      <div className="grid gap-2 overflow-hidden rounded-2xl sm:grid-cols-2">
        <Photo src={photos[0]} title={title} priority className="h-64 sm:h-96" />
        <Photo src={photos[1]} title={title} className="h-48 sm:h-96" />
      </div>
    )
  }
  const thumbs = photos.slice(1)
  return (
    <div className="grid gap-2 overflow-hidden rounded-2xl sm:h-96 sm:grid-cols-[2fr_1fr]">
      <Photo src={photos[0]} title={title} priority className="h-64 sm:h-full" />
      <div
        className="grid grid-cols-2 gap-2 sm:h-96 sm:grid-cols-1 sm:[grid-template-rows:repeat(var(--thumb-rows),minmax(0,1fr))]"
        style={{ "--thumb-rows": thumbs.length } as React.CSSProperties}
      >
        {thumbs.map((src) => <Photo key={src} src={src} title={title} small className="h-28 sm:h-full" />)}
      </div>
    </div>
  )
}

import SafeImage from "@/components/SafeImage"
import { photoLabel } from "@/lib/privacy"

const PLACEHOLDER = "/apartment-placeholder.svg"

export function splitGallery(imageUrl: string | null | undefined): string[] {
  const images = (imageUrl ?? "").split(",").map((src) => src.trim()).filter(Boolean)
  return images.length ? images : [PLACEHOLDER]
}

/** Main photo + up to three thumbnails, each captioned with its room type. */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  return (
    <div className="grid gap-2 overflow-hidden rounded-2xl sm:grid-cols-[2fr_1fr]">
      <figure className="relative">
        <SafeImage src={images[0]} alt={`${title} — ${photoLabel(images[0])}`} width={1200} height={800} priority className="h-64 w-full bg-slate-100 object-cover sm:h-96" />
        <figcaption className="absolute bottom-2 left-2 rounded-md bg-slate-950/70 px-2 py-1 text-[11px] font-semibold text-white">{photoLabel(images[0])}</figcaption>
      </figure>
      {images.length > 1 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:grid-rows-3">
          {images.slice(1, 4).map((src) => (
            <figure key={src} className="relative">
              <SafeImage src={src} alt={`${title} — ${photoLabel(src)}`} width={600} height={400} className="h-24 w-full bg-slate-100 object-cover sm:h-full sm:max-h-[7.8rem]" />
              <figcaption className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{photoLabel(src)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

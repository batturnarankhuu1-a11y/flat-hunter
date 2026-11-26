"use client"

import { useState } from "react"
import Image from "next/image"

const PLACEHOLDER = "/apartment-placeholder.svg"

/** next/image that falls back to the placeholder instead of a broken icon (e.g. a removed CDN photo). */
export default function SafeImage({ src, alt, width, height, className, priority }: {
  src: string
  alt: string
  width: number
  height: number
  className?: string
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <Image
      src={failed ? PLACEHOLDER : src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      priority={priority}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

const FALLBACK_IMAGE = "/images/placeholder.png";

type ImageWithFallbackProps = Omit<ImageProps, "src" | "onError"> & {
  src?: string | null;
};

export default function ImageWithFallback({
  src,
  alt,
  ...props
}: ImageWithFallbackProps) {
  const imageSrc = src?.trim() ? src : FALLBACK_IMAGE;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const displayedSrc = failedSrc === imageSrc ? FALLBACK_IMAGE : imageSrc;

  return (
    <Image
      {...props}
      alt={alt}
      src={displayedSrc}
      onError={() => {
        if (displayedSrc !== FALLBACK_IMAGE) {
          setFailedSrc(displayedSrc);
        }
      }}
    />
  );
}

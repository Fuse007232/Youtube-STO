"use client";

import Image from "next/image";
import { useState } from "react";

/** Vorschaubild eines Shorts (9:16) – fällt bei fehlendem/kaputtem Bild auf einen Farbverlauf zurück. */
export function ShortThumb({ src, color, className = "h-12 w-[27px]" }: { src: string | null; color: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span
        className={`${className} shrink-0 rounded`}
        style={{ background: `linear-gradient(160deg, ${color}, #000 140%)` }}
        aria-hidden
      />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={27}
      height={48}
      unoptimized
      onError={() => setBroken(true)}
      className={`${className} shrink-0 rounded object-cover`}
    />
  );
}

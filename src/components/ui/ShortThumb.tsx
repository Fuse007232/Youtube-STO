"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ThumbPreview {
  title: string;
  /** Zusatzzeilen unter dem Titel, z. B. „+12,3K in 24h“. */
  lines?: string[];
}

/**
 * Vorschaubild eines Shorts (9:16) – fällt bei fehlendem/kaputtem Bild auf einen
 * Farbverlauf zurück. Mit `preview`: beim Drüberfahren (Maus) erscheint ein großes
 * Vorschaubild mit Titel und Zahlen.
 */
export function ShortThumb({
  src,
  color,
  className = "h-12 w-[27px]",
  preview,
}: {
  src: string | null;
  color: string;
  className?: string;
  preview?: ThumbPreview;
}) {
  const [broken, setBroken] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vorschau erst nach dem ersten Zeichnen im Browser (kein Unterschied zum Server-HTML)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Beim Scrollen verschwindet die Vorschau (sie würde sonst „stehen bleiben“)
  useEffect(() => {
    if (!rect) return;
    const close = () => setRect(null);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [rect]);

  const show = () => {
    if (!preview || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    timer.current = setTimeout(() => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    }, 140);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setRect(null);
  };

  const image =
    !src || broken ? (
      <span
        className={`${className} block shrink-0 rounded`}
        style={{ background: `linear-gradient(160deg, ${color}, #000 140%)` }}
        aria-hidden
      />
    ) : (
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

  if (!preview) return image;
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} className="inline-flex shrink-0">
      {image}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {rect ? <PreviewCard key="p" rect={rect} src={broken ? null : src} color={color} preview={preview} /> : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </span>
  );
}

const W = 184;
const H = Math.round((W * 16) / 9);

function PreviewCard({ rect, src, color, preview }: { rect: DOMRect; src: string | null; color: string; preview: ThumbPreview }) {
  // Rechts neben dem Bild, sonst links; senkrecht im Fenster halten
  const right = rect.right + 12 + W <= window.innerWidth;
  const left = right ? rect.right + 12 : Math.max(8, rect.left - 12 - W);
  const cardH = H + 72;
  const top = Math.min(Math.max(8, rect.top + rect.height / 2 - cardH / 2), window.innerHeight - cardH - 8);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, x: right ? -6 : 6 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-none fixed z-[200] overflow-hidden rounded-xl border border-line-strong bg-surface-2/95 shadow-2xl shadow-black/60 backdrop-blur"
      style={{ left, top, width: W }}
      aria-hidden
    >
      <div className="relative" style={{ height: H }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="block h-full w-full" style={{ background: `linear-gradient(160deg, ${color}, #000 140%)` }} />
        )}
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">{preview.title}</p>
        {preview.lines?.map((l) => (
          <p key={l} className="num mt-0.5 text-[11px] text-muted">
            {l}
          </p>
        ))}
      </div>
    </motion.div>
  );
}

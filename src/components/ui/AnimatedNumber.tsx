"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { formatCompact, formatNumber, formatSigned } from "@/lib/format";

export type NumberFormat = "number" | "compact" | "signed" | "signedCompact";

const FORMATTERS: Record<NumberFormat, (n: number) => string> = {
  number: formatNumber,
  compact: formatCompact,
  signed: (n) => formatSigned(n),
  signedCompact: (n) => formatSigned(n, true),
};

/**
 * Zahl, die beim Erscheinen von 0 hochzählt und bei Änderungen sanft
 * zum neuen Wert gleitet (z. B. bei der Hochrechnung jede Sekunde).
 */
export function AnimatedNumber({
  value,
  format = "number",
  className,
  countUp = true,
}: {
  value: number;
  format?: NumberFormat;
  className?: string;
  /** Beim ersten Erscheinen von 0 hochzählen. */
  countUp?: boolean;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(countUp && !reduce ? 0 : value);
  const text = useTransform(mv, (v) => FORMATTERS[format](v));
  const mounted = useRef(false);

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const first = !mounted.current;
    mounted.current = true;
    const controls = animate(mv, value, {
      duration: first ? 1.6 : 0.9,
      ease: first ? [0.16, 1, 0.3, 1] : "easeOut",
    });
    return () => controls.stop();
  }, [value, mv, reduce]);

  return <motion.span className={`num ${className ?? ""}`}>{text}</motion.span>;
}

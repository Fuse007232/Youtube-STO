"use client";

import { motion } from "motion/react";
import { ViewTransition } from "react";
import { PAGES } from "@/widgets/registry";
import type { DashboardPageId, WidgetSize } from "@/widgets/types";

const SIZE_CLASS: Record<WidgetSize, string> = {
  small: "col-span-12 xl:col-span-4",
  medium: "col-span-12 xl:col-span-6",
  large: "col-span-12 xl:col-span-8",
  full: "col-span-12",
};

/** Seitenwechsel: Inhalt gleitet in Richtung des gewählten Bereichs (Kopf bleibt stehen). */
export const PAGE_TRANSITION = {
  enter: { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" },
  exit: { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" },
  default: "none",
} as const;

/** Die Widgets eines Bereichs im Raster. */
export function WidgetGrid({ page }: { page: DashboardPageId }) {
  return (
    <ViewTransition {...PAGE_TRANSITION}>
      <main className="grid grid-cols-12 gap-4 lg:gap-5">
        {PAGES[page].map((w, i) => {
          const Widget = w.component;
          return (
            <motion.div
              key={w.id}
              className={SIZE_CLASS[w.size]}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: Math.min(i, 6) * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Widget />
            </motion.div>
          );
        })}
      </main>
    </ViewTransition>
  );
}

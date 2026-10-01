"use client";

import { motion, MotionConfig } from "motion/react";
import type { DashboardData } from "@/lib/data/types";
import { WIDGETS } from "@/widgets/registry";
import type { WidgetSize } from "@/widgets/types";
import { DashboardDataProvider } from "./DashboardDataProvider";

const SIZE_CLASS: Record<WidgetSize, string> = {
  small: "col-span-12 xl:col-span-4",
  medium: "col-span-12 xl:col-span-6",
  large: "col-span-12 xl:col-span-8",
  full: "col-span-12",
};

/** Das Dashboard: Kopfzeile + alle registrierten Widgets im Raster. */
export function Dashboard({ initialData }: { initialData: DashboardData }) {
  return (
    <MotionConfig reducedMotion="user">
      <DashboardDataProvider initialData={initialData}>
        <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="f1-heading text-[11px] text-live">YouTube Shorts</p>
              <h1 className="f1-heading text-2xl text-ink sm:text-3xl">Live Timing</h1>
            </div>
            <p className="text-xs text-muted">
              {initialData.channels.map((c) => c.channel.name).join(" vs. ")}
            </p>
          </header>

          <main className="grid grid-cols-12 gap-4 lg:gap-5">
            {WIDGETS.map((w, i) => {
              const Widget = w.component;
              return (
                <motion.div
                  key={w.id}
                  className={SIZE_CLASS[w.size]}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Widget />
                </motion.div>
              );
            })}
          </main>
        </div>
      </DashboardDataProvider>
    </MotionConfig>
  );
}

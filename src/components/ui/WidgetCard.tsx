"use client";

import type { PointerEvent, ReactNode } from "react";

/**
 * Einheitlicher Rahmen für Widgets: Titel links, Bedienelemente rechts.
 * Beim Drüberfahren folgt ein dezenter Lichtschein der Maus („Spotlight“),
 * der Rahmen glüht leicht auf.
 */
export function WidgetCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <section
      onPointerMove={onMove}
      className={`card-spotlight group/card relative flex h-full flex-col rounded-2xl border border-line bg-surface/80 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_12px_40px_-12px_rgba(0,0,0,0.6)] sm:p-5 ${className ?? ""}`}
    >
      <header className="relative mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="f1-heading text-sm text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

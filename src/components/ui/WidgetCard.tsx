import type { ReactNode } from "react";

/** Einheitlicher Rahmen für Widgets: Titel links, Bedienelemente rechts. */
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
  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-line bg-surface/80 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur sm:p-5 ${className ?? ""}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="f1-heading text-sm text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

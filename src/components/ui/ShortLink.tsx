"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * Link zum Short-Steckbrief: wechselt ohne Neuladen und gleitet von rechts herein.
 * Kein Vorladen – Listen enthalten viele Shorts, das würde unnötig Anfragen erzeugen.
 */
export function ShortLink({ id, ...props }: { id: string } & Omit<ComponentProps<typeof Link>, "href">) {
  return <Link href={`/short/${encodeURIComponent(id)}`} prefetch={false} transitionTypes={["nav-forward"]} {...props} />;
}

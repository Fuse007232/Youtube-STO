"use client";

import Image from "next/image";
import { useState } from "react";
import type { ChannelConfig } from "@/config/channels";

/** Kanalbild (rund) mit Ring in Teamfarbe – ohne/kaputtes Bild: Kürzel auf Teamfarbe. */
export function ChannelAvatar({
  channel,
  url,
  size = 28,
  rounded = "rounded-full",
  className = "",
}: {
  channel: Pick<ChannelConfig, "code" | "color" | "name">;
  url: string | null | undefined;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, boxShadow: `0 0 0 2px ${channel.color}` };
  if (!url || broken) {
    return (
      <span
        className={`grid shrink-0 place-items-center font-mono font-black text-white ${rounded} ${className}`}
        style={{ ...style, backgroundColor: channel.color, fontSize: Math.max(8, Math.round(size * 0.3)) }}
        title={channel.name}
        aria-hidden
      >
        {channel.code}
      </span>
    );
  }
  return (
    <Image
      src={url}
      alt=""
      title={channel.name}
      width={size}
      height={size}
      unoptimized
      onError={() => setBroken(true)}
      className={`shrink-0 object-cover ${rounded} ${className}`}
      style={style}
    />
  );
}

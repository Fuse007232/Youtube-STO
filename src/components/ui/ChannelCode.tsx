import type { ChannelConfig } from "@/config/channels";

/** F1-artiges Kanal-Kürzel mit Teamfarben-Streifen, z. B. „▌BRV“. */
export function ChannelCode({
  channel,
  size = "md",
}: {
  channel: Pick<ChannelConfig, "code" | "color" | "name">;
  size?: "sm" | "md";
}) {
  return (
    <span
      title={channel.name}
      className={`inline-flex items-center gap-1.5 font-mono font-bold tracking-wider text-ink ${
        size === "sm" ? "text-[11px]" : "text-sm"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block rounded-[2px] ${size === "sm" ? "h-3 w-1" : "h-4 w-1.5"}`}
        style={{ backgroundColor: channel.color }}
      />
      {channel.code}
    </span>
  );
}

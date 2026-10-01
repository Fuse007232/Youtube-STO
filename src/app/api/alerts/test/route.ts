import { NextResponse } from "next/server";
import { CHANNELS } from "@/config/channels";
import { renderAlertEmail, sendEmail } from "@/lib/alerts/email";
import { isAuthenticated } from "@/lib/auth/server";

/** POST /api/alerts/test – Test-E-Mail aus den Einstellungen. */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const to = new URL("/settings", req.url);
  try {
    const msg = renderAlertEmail(
      [
        {
          videoId: "dQw4w9WgXcQ",
          channelId: CHANNELS[0].id,
          title: "TEST – so sieht ein Alarm aus",
          thumbnailUrl: null,
          kind: "rocket",
          viewsLastHour: 25_000,
          baselineHour: 12_000,
          viewsTotal: 180_000,
        },
      ],
      CHANNELS,
    );
    await sendEmail({ ...msg, subject: `[TEST] ${msg.subject}` });
    to.searchParams.set("mailed", "1");
  } catch (e) {
    to.searchParams.set("error", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.redirect(to, 303);
}

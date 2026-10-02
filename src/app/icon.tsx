import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/app-icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App-Symbol (Browser-Tab, Android-Startbildschirm). */
export default function Icon() {
  return new ImageResponse(<AppIconArt size={512} />, size);
}

import { ImageResponse } from "next/og";

// iPhone のホーム画面用アイコン（SVG は使えないので PNG を生成する。app/icon.svg と同じ絵柄）
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0f1a" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M32 12 10 52h44L32 12Z" fill="#38bdf8" />
          <path d="M32 30 24 52h16l-8-22Z" fill="#0b0f1a" />
        </svg>
      </div>
    ),
    size,
  );
}

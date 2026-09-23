import type { MetadataRoute } from "next";

// ホーム画面に追加すると、Safari のバーのないアプリの画面で開ける
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "campintel AIアドバイザー",
    short_name: "campintel",
    description: "キャンプ計画とマイギアから、リスク分析と持ち物をAIが提案します",
    start_url: "/",
    display: "standalone",
    background_color: "#1c1917",
    theme_color: "#1c1917",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}

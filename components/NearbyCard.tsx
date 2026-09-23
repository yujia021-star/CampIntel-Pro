import { nearbyCategoriesFor, nearbyRouteUrl, type LatLon } from "@/lib/links";

/**
 * 周辺施設（温泉・買い出しなど）を地図アプリで探すリンク。同行者に合わせて並べる。
 * 地図アプリの行き方は「診断した場所と条件」に出す。
 */
export function NearbyCard({
  location,
  companions,
}: {
  location: LatLon & { name: string; address?: string | null };
  companions?: string | null;
}) {
  return (
    <div className="card">
      <h2>♨️ 周辺施設</h2>
      <div className="link-row">
        {nearbyCategoriesFor(companions).map((c) => (
          <a key={c.kind} className="link-chip" href={nearbyRouteUrl(c.keyword, location)} target="_blank" rel="noreferrer">
            {c.icon} {c.label}
          </a>
        ))}
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        タップすると、「{location.name}」を出発地にして、近くの施設までの行き方を Google マップで開きます。{companions ? `同行者「${companions}」に合わせて並べています。` : ""}
      </p>
    </div>
  );
}

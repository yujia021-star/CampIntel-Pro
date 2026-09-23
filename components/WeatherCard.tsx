import type { ForecastResult } from "@/lib/weather/forecast";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-09-26" → "9/26(土)"。端末のタイムゾーンに左右されないよう、日付の文字列から直接作る */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${WEEKDAYS[weekday]})`;
}

const v = (x: number | null, unit: string) => (x === null ? "—" : `${x}${unit}`);

export function WeatherCard({ weather, title = "🌦️ 天気予報" }: { weather: ForecastResult; title?: string }) {
  if (!weather.available) {
    return (
      <div className="card">
        <h2>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {weather.message}
        </p>
      </div>
    );
  }
  const f = weather.forecast;
  return (
    <div className="card">
      <h2>{title}</h2>
      {f.days.map((d) => (
        <div key={d.date} className="wx-day">
          <div className="wx-day-head">
            <span className="wx-icon">{d.icon}</span>
            <span>
              <b>{dayLabel(d.date)}</b> {d.weather}
            </span>
          </div>
          <div className="wx-stats">
            <div className="wx-stat">
              <span className="wx-label">🌡️ 気温</span>
              <span>
                <span style={{ color: "var(--red)" }}>{v(d.temp_max, "℃")}</span> /{" "}
                <span style={{ color: "#3b82f6" }}>{v(d.temp_min, "℃")}</span>
              </span>
            </div>
            <div className="wx-stat">
              <span className="wx-label">☔ 降水確率</span>
              <span>{v(d.precip_prob_max, "%")}</span>
            </div>
            <div className="wx-stat">
              <span className="wx-label">💧 降水量</span>
              <span>{v(d.precip_sum_mm, "mm")}</span>
            </div>
            <div className="wx-stat">
              <span className="wx-label">🌬️ 風速</span>
              <span>
                {v(d.wind_max_ms, "m/s")}
                <span className="muted">（瞬間{v(d.gust_max_ms, "")}）</span>
              </span>
            </div>
          </div>
        </div>
      ))}

      {f.hours.length > 0 && (
        <>
          <h3>滞在中の3時間ごとの予報</h3>
          <div className="wx-timeline">
            {f.hours.map((h) => (
              <div key={h.time} className="wx-hour">
                <div className="muted">{`${Number(h.time.slice(11, 13))}時`}</div>
                <div className="wx-icon" title={h.weather}>
                  {h.icon}
                </div>
                <div style={{ fontWeight: 700 }}>{v(h.temp, "℃")}</div>
                <div className="wx-hour-sub">☔ {v(h.precip_prob, "%")}</div>
                <div className="wx-hour-sub">💧 {v(h.precip_mm, "mm")}</div>
                <div className="wx-hour-sub">🌬️ {v(h.wind_ms, "m/s")}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="hint" style={{ marginBottom: 0 }}>
        天気データ: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>（数値予報モデル）。
        最新の情報や警報・注意報は{" "}
        <a href="https://www.jma.go.jp/bosai/warning/" target="_blank" rel="noreferrer">
          気象庁
        </a>{" "}
        で確認してください。
      </p>
    </div>
  );
}

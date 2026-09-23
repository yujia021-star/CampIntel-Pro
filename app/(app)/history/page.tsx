import Link from "next/link";
import { riskVerdict } from "@/lib/diagnosis";
import { NIGHTS_ICONS, NIGHTS_LABELS, type CampPlan } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("camp_plans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const plans = (data ?? []) as CampPlan[];

  return (
    <div className="card">
      <h2>🗂️ 診断履歴</h2>
      {plans.length === 0 && <p className="muted">まだ診断履歴がありません。</p>}
      {plans.map((p) => {
        const verdict = p.result ? riskVerdict(p.result.risk_level) : null;
        return (
          <Link key={p.id} href={`/history/${p.id}`} className="list-item" style={{ color: "inherit", textDecoration: "none" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.campsite}</div>
              <div className="muted">
                {p.nights != null && `${NIGHTS_ICONS[p.nights]} ${NIGHTS_LABELS[p.nights]}・`}
                {p.planned_date ?? "日付未定"}・診断日 {new Date(p.created_at).toLocaleDateString("ja-JP")}
              </div>
            </div>
            {p.result && verdict && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span className={`badge tone-${verdict.tone}`} style={{ background: "var(--tone-bg)", color: "var(--tone)" }}>
                  {verdict.title}
                </span>
                <div className="muted">準備度 {p.result.readiness_pct}%</div>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

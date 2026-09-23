import Link from "next/link";
import { notFound } from "next/navigation";
import { DiagnosisView } from "@/components/DiagnosisView";
import { NIGHTS_LABELS, type CampPlan } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { DeletePlanButton } from "./DeletePlanButton";

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data } = await supabase.from("camp_plans").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const plan = data as CampPlan;

  const conditions = [
    plan.nights != null ? NIGHTS_LABELS[plan.nights] : null,
    plan.planned_date,
    plan.elevation_m != null ? `標高${plan.elevation_m}m` : null,
    plan.terrain,
    plan.ground,
    plan.expected_low_c != null || plan.expected_high_c != null
      ? `${plan.expected_low_c ?? "?"}〜${plan.expected_high_c ?? "?"}℃`
      : null,
    plan.transport,
    plan.companions,
    plan.style,
  ].filter(Boolean);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Link href="/history">← 履歴一覧</Link>
        <DeletePlanButton id={plan.id} />
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>{plan.campsite}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {conditions.join(" / ") || "条件の入力なし"}
        </p>
      </div>
      {plan.result ? <DiagnosisView result={plan.result} planId={plan.id} campsite={plan.campsite} companions={plan.companions} transport={plan.transport} /> : <p className="muted">診断結果がありません。</p>}
    </>
  );
}

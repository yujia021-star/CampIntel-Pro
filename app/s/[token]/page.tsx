import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { DiagnosisView } from "@/components/DiagnosisView";
import { dayLabel } from "@/components/WeatherCard";
import { NIGHTS_LABELS, type DiagnosisResult } from "@/lib/domain";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// 共有リンクのページ。ログイン不要で、トークンが一致する診断だけを読み取り専用の関数で取る

interface SharedPlan {
  campsite: string;
  planned_date: string | null;
  nights: number | null;
  companions: string | null;
  result: DiagnosisResult | null;
  created_at: string;
}

const getShared = cache(async (token: string): Promise<SharedPlan | null> => {
  if (!z.uuid().safeParse(token).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_plan", { token });
  if (error) console.error("[share]", error);
  return (data as SharedPlan[] | null)?.[0] ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const plan = await getShared((await params).token);
  return {
    title: plan ? `${plan.campsite} のキャンプ診断 | campintel` : "campintel",
    // 共有リンクを知っている人だけが見る前提なので、検索エンジンには載せない
    robots: { index: false, follow: false },
  };
}

export default async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const plan = await getShared((await params).token);
  if (!plan?.result) notFound();

  const when = [
    plan.planned_date ? dayLabel(plan.planned_date) : null,
    plan.nights != null ? NIGHTS_LABELS[plan.nights] : null,
    plan.companions,
  ].filter(Boolean);

  return (
    <div className="container" style={{ paddingBottom: 40 }}>
      <header className="header">
        <div>
          <h1 className="brand">🏕️ campintel AIアドバイザー</h1>
          <p className="sub">共有されたキャンプ診断です</p>
        </div>
      </header>
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>{plan.campsite}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {when.join(" / ")}
          {when.length ? " ・ " : ""}
          {new Date(plan.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} に診断
        </p>
      </div>
      <DiagnosisView result={plan.result} campsite={plan.campsite} companions={plan.companions} affiliate={env.affiliateIds()} shared />
    </div>
  );
}

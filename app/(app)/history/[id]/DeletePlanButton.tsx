"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteCampPlan } from "@/lib/actions/history";

export function DeletePlanButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn btn-danger btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("この診断履歴を削除しますか？")) return;
        startTransition(async () => {
          const { ok } = await deleteCampPlan(id);
          if (ok) router.push("/history");
          else alert("削除に失敗しました");
        });
      }}
    >
      削除
    </button>
  );
}

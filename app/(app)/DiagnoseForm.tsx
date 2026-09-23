"use client";

import { useRef, useState } from "react";
import { DiagnosisView } from "@/components/DiagnosisView";
import { LoadingOverlay } from "@/components/Loading";
import type { DiagnosisResult } from "@/lib/domain";

// 選択肢はプロトタイプと同じ。datalist なので自由入力もできる
const OPTIONS = {
  terrain: ["林間", "湖畔", "高原", "海辺", "河原"],
  ground: ["固い土", "砂地", "芝生", "岩場", "ぬかるみ"],
  transport: ["車", "バイク", "公共交通機関", "徒歩"],
  companions: ["ソロ", "友人", "家族", "パートナー"],
};

function Suggest({ id, label, name, options }: { id: string; label: string; name: string; options: string[] }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} list={`${id}-list`} placeholder="選択または入力" autoComplete="off" />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

export function DiagnoseForm({ gearCount, diaryCount }: { gearCount: number; diaryCount: number }) {
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.result) {
        setError(json?.message ?? "診断に失敗しました。もう一度お試しください。");
        return;
      }
      setResult(json.result);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {pending && <LoadingOverlay message="診断中...(30〜60秒程度かかることがあります)" />}
      <form className="card" onSubmit={onSubmit}>
        <h2>📋 キャンプ計画</h2>
        <div className="field">
          <label htmlFor="campsite">キャンプ場名</label>
          <input id="campsite" name="campsite" required maxLength={100} placeholder="例: WOODSMAN CAMPGROUND" />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="planned_date">予定日</label>
            <input id="planned_date" name="planned_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="elevation_m">標高 (m)</label>
            <input id="elevation_m" name="elevation_m" type="number" inputMode="numeric" step="1" placeholder="例: 850" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="expected_low_c">予想最低気温 (℃)</label>
            <input id="expected_low_c" name="expected_low_c" type="number" inputMode="decimal" step="0.5" />
          </div>
          <div className="field">
            <label htmlFor="expected_high_c">予想最高気温 (℃)</label>
            <input id="expected_high_c" name="expected_high_c" type="number" inputMode="decimal" step="0.5" />
          </div>
        </div>
        <div className="row">
          <Suggest id="terrain" name="terrain" label="地形" options={OPTIONS.terrain} />
          <Suggest id="ground" name="ground" label="地面の性質" options={OPTIONS.ground} />
        </div>
        <div className="row">
          <Suggest id="transport" name="transport" label="移動手段" options={OPTIONS.transport} />
          <Suggest id="companions" name="companions" label="同行者" options={OPTIONS.companions} />
        </div>
        <div className="field">
          <label htmlFor="style">スタイル</label>
          <input id="style" name="style" maxLength={100} placeholder="例: まったり焚き火読書 / フリーサイト" />
        </div>

        <p className="hint">
          マイギア {gearCount}件・日記（直近{Math.min(diaryCount, 5)}件）を診断に反映します
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          🔍 診断する
        </button>
      </form>

      <div ref={resultRef}>{result && <DiagnosisView result={result} />}</div>
    </>
  );
}

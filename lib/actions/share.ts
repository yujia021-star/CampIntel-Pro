"use server";

import { z } from "zod";
import { isMissingColumnError } from "@/lib/db/compat";
import { getUser } from "@/lib/supabase/server";

type ShareResult = { ok: true; token: string | null } | { ok: false; message: string };

const Id = z.uuid();

const NEEDS_SQL =
  "共有機能を使うには、Supabase の SQL Editor で supabase/migrations/20260925000000_share.sql を実行してください。";

/** 診断結果の共有リンク用のトークンを返す（まだなければ作る） */
export async function createShareLink(planId: string): Promise<ShareResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "ログインが必要です。" };
  if (!Id.safeParse(planId).success) return { ok: false, message: "診断が見つかりません。" };

  const current = await supabase.from("camp_plans").select("share_token").eq("id", planId).maybeSingle();
  if (isMissingColumnError(current.error)) return { ok: false, message: NEEDS_SQL };
  if (current.error || !current.data) return { ok: false, message: "診断が見つかりません。" };
  if (current.data.share_token) return { ok: true, token: current.data.share_token as string };

  const token = crypto.randomUUID();
  const { error } = await supabase.from("camp_plans").update({ share_token: token }).eq("id", planId);
  if (error) return { ok: false, message: "共有リンクを作れませんでした。" };
  return { ok: true, token };
}

/** 共有をやめる（これまでのリンクは見られなくなる） */
export async function stopSharing(planId: string): Promise<ShareResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "ログインが必要です。" };
  if (!Id.safeParse(planId).success) return { ok: false, message: "診断が見つかりません。" };
  const { error } = await supabase.from("camp_plans").update({ share_token: null }).eq("id", planId);
  if (error) return { ok: false, message: isMissingColumnError(error) ? NEEDS_SQL : "共有を止められませんでした。" };
  return { ok: true, token: null };
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, enforceRateLimit, model } from "@/lib/ai/client";
import { candidateToPlace, looksLikeCampsite, parseLookupText } from "@/lib/geo/campsite-lookup";
import { geocodeAddress, searchPlaces, type Place } from "@/lib/geo/places";

const LOOKUP_SYSTEM = `あなたは日本のキャンプ場の所在地を調べるアシスタントです。
ユーザーが入力したキャンプ場名（略称・表記揺れを含む）に当てはまる、実在するキャンプ場を探します。
- Web検索が使えるときは、公式サイトや自治体・観光協会のページで名前と所在地を確かめる。
- name は正式名称、address は都道府県から番地までの分かる範囲の住所、lat/lon は施設の緯度経度（分からなければ null）。
- 同じ名前のキャンプ場が複数あれば最大3件。確信が持てないものは入れない。見つからなければ candidates を空にする。
- 最後に、次の形のJSONだけを出力する（前後に説明を書かない）:
{"candidates":[{"name":"〇〇キャンプ場","address":"〇〇県〇〇市〇〇1-2-3","lat":35.123,"lon":139.456}]}`;

const WEB_SEARCH = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
  user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" },
} as const;

/** 最後のツール結果より後ろの文章（JSONの答え）をつなげる。引用で文章が分割されることがある */
function finalText(content: Anthropic.ContentBlock[]): string {
  let text = "";
  for (const block of content) {
    if (block.type === "text") text += block.text;
    else text = "";
  }
  return text;
}

async function ask(query: string, withSearch: boolean): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `キャンプ場名: ${query}` }];
  // Web検索が長引くと pause_turn で一旦返ってくるので、続きを2回まで頼む
  for (let i = 0; i < 3; i++) {
    const response = await anthropic().messages.create({
      model: model(),
      max_tokens: 4000,
      system: LOOKUP_SYSTEM,
      messages,
      ...(withSearch ? { tools: [WEB_SEARCH] } : {}),
      output_config: { effort: "low" },
    });
    if (response.stop_reason !== "pause_turn") return finalText(response.content);
    messages.push({ role: "assistant", content: response.content });
  }
  return "";
}

/**
 * AIにキャンプ場を調べてもらい、国土地理院で住所を確かめた候補を返す。
 * Web検索が使えない設定（組織でオフなど）のときは、AIの知識だけで答えてもらう。
 */
export async function lookupCampsiteWithAi(supabase: SupabaseClient, userId: string, query: string): Promise<Place[]> {
  await enforceRateLimit(supabase, userId, "place_lookup");
  let text: string;
  try {
    text = await ask(query, true);
  } catch (error) {
    if (!(error instanceof Anthropic.BadRequestError)) throw error;
    console.error("[place-lookup] web search unavailable, retrying without it", error.message);
    text = await ask(query, false);
  }
  const candidates = parseLookupText(text);
  const places = await Promise.all(
    candidates.map(async (c) => candidateToPlace(c, c.address ? await geocodeAddress(c.address) : null)),
  );
  console.info("[place-lookup]", query, candidates.length, "candidates");
  return places.filter((p): p is Place => p !== null);
}

/**
 * 場所の候補を探す。OpenStreetMap にキャンプ場として載っていないときは、AIに調べてもらった候補を先頭に足す。
 * AIの失敗（上限・通信エラー）は検索全体を止めず、地図データの候補だけを返す。
 */
export async function findPlaces(supabase: SupabaseClient, userId: string, query: string): Promise<Place[]> {
  const places = await searchPlaces(query);
  const hasFacility = places.some((p) => p.kind === "キャンプ場" || p.kind === "施設");
  const needsAi = !hasFacility && (looksLikeCampsite(query) || places.length === 0);
  if (!needsAi) return places;
  try {
    const found = await lookupCampsiteWithAi(supabase, userId, query);
    return [...found, ...places].slice(0, 10);
  } catch (error) {
    console.error("[place-lookup]", error);
    return places;
  }
}

/** 場所を選ばずに診断したときに使う、名前からいちばん当てはまりそうな1件 */
export async function bestPlace(supabase: SupabaseClient, userId: string, query: string): Promise<Place | null> {
  const [first] = await findPlaces(supabase, userId, query);
  return first ? { ...first, auto: true } : null;
}

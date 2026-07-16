// ============================================================================
// Suno 自動音楽生成スクリプト
//
// GitHub Actions から定期的に実行され、Suno（非公式 Cookie 認証）で新しい曲を
// 生成し、data/tracks.json に追記します。生成物（音声・画像）は Suno の CDN に
// ホストされるため、このスクリプトは URL とメタデータのみを保存します。
//
// 必要な環境変数:
//   SUNO_COOKIE ... Suno にログインした状態のブラウザから取得した Cookie 文字列
//                   （必須。GitHub Secrets に登録して Actions から渡す）
//   SUNO_PROMPT ... 生成テーマ（任意。未指定ならランダムなテーマを使う）
//   MAKE_INSTRUMENTAL ... "true" なら歌なしのインスト曲
//   SUNO_MODEL  ... モデル名（任意。既定 "chirp-v3-5"）
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TRACKS_FILE = path.join(ROOT, "data", "tracks.json");

// Suno / Clerk のエンドポイント。仕様変更で動かなくなった場合はここを更新する。
const CLERK_BASE = "https://clerk.suno.com";
const STUDIO_BASE = "https://studio-api.prod.suno.com";
const CLERK_JS_VERSION = "5.35.1";
const MODEL = process.env.SUNO_MODEL || "chirp-v3-5";

const SUNO_COOKIE = process.env.SUNO_COOKIE;
const MAKE_INSTRUMENTAL = String(process.env.MAKE_INSTRUMENTAL || "").toLowerCase() === "true";

// プロンプト未指定のときに使うテーマ候補（24時間バリエーションを出すため）
const RANDOM_THEMES = [
  "夜明けの静かなローファイ・ヒップホップ、雨音とピアノ",
  "元気が出るシティポップ、80年代の東京の夜",
  "壮大な映画音楽風オーケストラ、冒険の始まり",
  "リラックスできるアンビエント、森と小川の音",
  "軽快なアコースティックギターのフォークソング",
  "エネルギッシュなEDM、フェスの高揚感",
  "切ないピアノバラード、雨の別れ",
  "和風エレクトロニカ、琴と太鼓とシンセ",
  "カフェで流れるボサノバ、穏やかな午後",
  "疾走感のあるロック、青春と自由",
  "神秘的なチルアウト、宇宙と星々",
  "ファンキーなジャズフュージョン、都会の夜景",
];

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "ja,en;q=0.9",
  Origin: "https://suno.com",
  Referer: "https://suno.com/",
};

// Clerk の Cookie から現在のセッションID→JWT を取得する
async function getJwt() {
  if (!SUNO_COOKIE) {
    throw new Error(
      "SUNO_COOKIE が設定されていません。GitHub Secrets に SUNO_COOKIE を登録してください。"
    );
  }

  // 1) 現在のクライアント情報を取得してアクティブなセッションIDを得る
  const clientRes = await fetch(
    `${CLERK_BASE}/v1/client?_clerk_js_version=${CLERK_JS_VERSION}`,
    { headers: { ...COMMON_HEADERS, Cookie: SUNO_COOKIE } }
  );
  if (!clientRes.ok) {
    throw new Error(`Clerk client 取得に失敗: ${clientRes.status} ${await clientRes.text()}`);
  }
  const clientData = await clientRes.json();
  const sid =
    clientData?.response?.last_active_session_id ||
    clientData?.response?.sessions?.[0]?.id;
  if (!sid) {
    throw new Error("セッションIDが取得できませんでした。Cookie が失効している可能性があります。");
  }

  // 2) セッションIDから短命の JWT を取得する
  const tokenRes = await fetch(
    `${CLERK_BASE}/v1/client/sessions/${sid}/tokens?_clerk_js_version=${CLERK_JS_VERSION}`,
    { method: "POST", headers: { ...COMMON_HEADERS, Cookie: SUNO_COOKIE } }
  );
  if (!tokenRes.ok) {
    throw new Error(`JWT 取得に失敗: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const tokenData = await tokenRes.json();
  const jwt = tokenData?.jwt;
  if (!jwt) throw new Error("JWT が空でした。");
  return jwt;
}

function authHeaders(jwt) {
  return { ...COMMON_HEADERS, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };
}

// 生成リクエストを投げる。返却されたクリップIDの配列を返す。
async function requestGenerate(jwt, prompt) {
  const body = {
    gpt_description_prompt: prompt,
    prompt: "",
    make_instrumental: MAKE_INSTRUMENTAL,
    mv: MODEL,
    // タイトルや歌詞は Suno に自動生成させる
  };
  const res = await fetch(`${STUDIO_BASE}/api/generate/v2/`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`生成リクエスト失敗: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const clips = data?.clips || [];
  const ids = clips.map((c) => c.id).filter(Boolean);
  if (ids.length === 0) throw new Error("生成されたクリップIDが空でした。");
  return ids;
}

// 指定IDのクリップ情報を取得する
async function fetchClips(jwt, ids) {
  const res = await fetch(`${STUDIO_BASE}/api/feed/?ids=${ids.join(",")}`, {
    headers: authHeaders(jwt),
  });
  if (!res.ok) {
    throw new Error(`feed 取得失敗: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // 新旧レスポンス形状の両対応
  return Array.isArray(data) ? data : data?.clips || [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// クリップが再生可能（audio_url が揃う）になるまでポーリングする
async function waitForCompletion(jwt, ids, { timeoutMs = 8 * 60 * 1000, intervalMs = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const clips = await fetchClips(jwt, ids);
    const ready = clips.filter(
      (c) => c.audio_url && (c.status === "complete" || c.status === "streaming")
    );
    log(
      `進捗: ${ready.length}/${clips.length} 準備完了 ` +
        `(status: ${clips.map((c) => c.status).join(", ")})`
    );
    // 全クリップが complete になったら終了
    if (clips.length > 0 && clips.every((c) => c.status === "complete" && c.audio_url)) {
      return clips;
    }
    // 一部でも complete で audio_url があれば、タイムアウト前でも許容できるが
    // なるべく complete を待つ
    await sleep(intervalMs);
  }
  // タイムアウト時は現時点で audio_url があるものを返す
  const clips = await fetchClips(jwt, ids);
  const usable = clips.filter((c) => c.audio_url);
  if (usable.length === 0) {
    throw new Error("タイムアウト: 再生可能な音声が生成されませんでした。");
  }
  return usable;
}

function clipToTrack(c) {
  return {
    id: c.id,
    title: (c.title && c.title.trim()) || "無題",
    prompt: c?.metadata?.gpt_description_prompt || "",
    tags: c?.metadata?.tags || "",
    lyrics: c?.metadata?.prompt || "",
    audio_url: c.audio_url,
    image_url: c.image_large_url || c.image_url || "",
    video_url: c.video_url || "",
    duration: c?.metadata?.duration || c.duration || null,
    model: c?.major_model_version || MODEL,
    created_at: c.created_at || new Date().toISOString(),
  };
}

async function loadTracks() {
  try {
    const raw = await fs.readFile(TRACKS_FILE, "utf8");
    const json = JSON.parse(raw);
    return Array.isArray(json?.tracks) ? json : { tracks: [] };
  } catch {
    return { tracks: [] };
  }
}

async function saveTracks(db) {
  db.updated_at = new Date().toISOString();
  await fs.mkdir(path.dirname(TRACKS_FILE), { recursive: true });
  await fs.writeFile(TRACKS_FILE, JSON.stringify(db, null, 2) + "\n", "utf8");
}

async function main() {
  const prompt =
    (process.env.SUNO_PROMPT && process.env.SUNO_PROMPT.trim()) ||
    RANDOM_THEMES[Math.floor(Math.random() * RANDOM_THEMES.length)];

  log(`テーマ: "${prompt}"`);
  log(`モデル: ${MODEL} / インスト: ${MAKE_INSTRUMENTAL}`);

  const jwt = await getJwt();
  log("認証成功。生成をリクエストします。");

  const ids = await requestGenerate(jwt, prompt);
  log(`生成開始。クリップID: ${ids.join(", ")}`);

  const clips = await waitForCompletion(jwt, ids);
  log(`${clips.length} 曲が完成しました。`);

  const db = await loadTracks();
  const existingIds = new Set(db.tracks.map((t) => t.id));
  let added = 0;
  for (const c of clips) {
    if (existingIds.has(c.id)) continue;
    db.tracks.unshift(clipToTrack(c)); // 新しい曲を先頭に
    added++;
  }
  await saveTracks(db);

  log(`tracks.json に ${added} 曲を追記しました（合計 ${db.tracks.length} 曲）。`);
}

main().catch((err) => {
  console.error("生成に失敗しました:", err.message);
  process.exit(1);
});

// Boxity platform calls made by this server (docs.bloxity.io/#html5). Every Boxity URL comes from
// the environment Boxity hosting injects into the pod (BLOXITY_*), with the prod fallback only when
// nothing was told. Nothing here throws into the game loop: a failed call logs and resolves null.

export const boxity = {
  env: process.env.BLOXITY_ENV || "prod",
  apiUrl: (process.env.BLOXITY_API_URL || "https://api.bloxity.io").replace(/\/$/, ""),
  // The game's registered slug (verify, reward tokens) and its hosting id + report token (the
  // hosted leaderboard / stats / badges calls). Hosting injects the id + token; locally they are
  // unset and every report is a no-op.
  gameSlug: process.env.BLOXITY_GAME_SLUG || "run-a-motel",
  gameId: process.env.BLOXITY_GAME_ID || "",
  reportToken: process.env.BLOXITY_REPORT_TOKEN || "",
};

export const canReport = () => !!(boxity.gameId && boxity.reportToken);

// Local `npm start` / tests only: with no Boxity deploy around (no BLOXITY_GAME_ID) and outside
// production, a join may name its own `dev-` id (or any id in tests) so saves can be exercised
// without a Boxity login. A deployed pod always has BLOXITY_GAME_ID, so this never applies there.
export const trustClientIds = () => !boxity.gameId && process.env.NODE_ENV !== "production";

export interface VerifiedPlayer {
  userId: string; // the Boxity account id (user._id); the save's key
  username: string;
  pfp: string;
  outfitKey: string;
  carriedFrom: string[]; // Boxity guest ids this browser played as before signing in (newest first)
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => fetch(...args);
// Test-only seam: answer Boxity calls without the network.
export function __setFetchForTest(f: Fetch | null): void {
  fetchImpl = f ?? ((...args) => fetch(...args));
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<{ status: number; json: any } | null> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // Empty or non-JSON body.
    }
    return { status: res.status, json };
  } catch (err) {
    console.warn("[boxity] request failed", url, (err as Error)?.message ?? err);
    return null;
  }
}

// The only trusted identity: POST /v1/auth/game-token/verify with the player's Boxity token.
// Null for a missing / refused token (the player is then a guest this server never saves).
export async function verifyToken(token: unknown): Promise<VerifiedPlayer | null> {
  if (typeof token !== "string" || !token || token.length > 8192) return null;
  const r = await postJson(`${boxity.apiUrl}/v1/auth/game-token/verify`, { gameSlug: boxity.gameSlug }, { authorization: `Bearer ${token}` }, 6000);
  const user = r?.json?.user;
  if (!r || r.status >= 300 || r.json?.valid === false || !user || typeof user._id !== "string" || !user._id) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const carried = Array.isArray(r.json.carriedFrom) ? r.json.carriedFrom.filter((id: unknown) => typeof id === "string" && id).slice(0, 5) : [];
  return {
    userId: user._id.slice(0, 128),
    username: str(user.displayName, 64) || str(user.username, 64),
    pfp: str(user.pfp, 512),
    outfitKey: str(user.outfitKey, 512),
    carriedFrom: carried,
  };
}

// A rewarded ad's single-use token (Legion.SDK.ads.showRewarded): valid once, for this game,
// within 5 minutes of the ad.
export async function verifyAdReward(rewardToken: unknown): Promise<{ valid: boolean; reason?: string; placement?: string }> {
  if (typeof rewardToken !== "string" || !rewardToken || rewardToken.length > 4096) return { valid: false, reason: "missing" };
  const r = await postJson(`${boxity.apiUrl}/v1/ads/reward/verify`, { gameSlug: boxity.gameSlug, rewardToken });
  if (!r || r.status >= 300) return { valid: false, reason: "unreachable" };
  return { valid: r.json?.valid === true, reason: r.json?.reason, placement: r.json?.placement };
}

// One hosted report call (leaderboards, stats, badges), authenticated with the pod's report token.
// Null when not deployed (no token / game id) or the call failed.
export async function hostedPost(path: string, body: Record<string, unknown>): Promise<{ status: number; json: any } | null> {
  if (!canReport()) return null;
  const withSlug = process.env.BLOXITY_GAME_SLUG ? { gameSlug: process.env.BLOXITY_GAME_SLUG, ...body } : body;
  const url = `${boxity.apiUrl}${path.replace("{id}", encodeURIComponent(boxity.gameId))}`;
  return postJson(url, withSlug, { authorization: `Bearer ${boxity.reportToken}` });
}

// Reports and badges name Boxity accounts "legion_<id>" (any "#m..." mode suffix stripped).
export const legionId = (userId: string) => `legion_${userId.replace(/#m.*$/, "")}`;

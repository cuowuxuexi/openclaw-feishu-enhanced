/**
 * Feishu User Token auto-refresh module.
 */

import type { FeishuDomain } from "./types.js";

interface TokenEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface RefreshApiResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}

const tokenCache = new Map<string, TokenEntry>();
const refreshLocks = new Map<string, Promise<TokenEntry>>();
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function resolveOpenApiBase(domain?: FeishuDomain): string {
  if (!domain || domain === "feishu") return "https://open.feishu.cn/open-apis";
  if (domain === "lark") return "https://open.larksuite.com/open-apis";
  return `${domain.replace(/\/+$/, "")}/open-apis`;
}

async function getAppAccessToken(
  appId: string,
  appSecret: string,
  domain?: FeishuDomain,
): Promise<string> {
  const base = resolveOpenApiBase(domain);
  const res = await fetch(`${base}/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await res.json()) as { code: number; app_access_token?: string; msg?: string };
  if (data.code !== 0 || !data.app_access_token) {
    throw new Error(`Failed to get app_access_token: ${data.msg ?? "unknown"}`);
  }
  return data.app_access_token;
}

async function refreshUserToken(
  appAccessToken: string,
  refreshToken: string,
  domain?: FeishuDomain,
): Promise<RefreshApiResult> {
  const base = resolveOpenApiBase(domain);
  const res = await fetch(`${base}/authen/v1/oidc/refresh_access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const data = (await res.json()) as { code: number; data?: RefreshApiResult; msg?: string };
  if (data.code !== 0 || !data.data) {
    throw new Error(`Failed to refresh user token: ${data.msg ?? "unknown"}`);
  }
  return data.data;
}

async function persistTokensToConfig(
  accessToken: string,
  refreshToken: string,
  accountId: string,
): Promise<void> {
  try {
    const configPath =
      process.env.OPENCLAW_CONFIG_PATH ??
      `${process.env.OPENCLAW_STATE_DIR ?? `${process.env.HOME}/.openclaw`}/openclaw.json`;
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const feishu = config?.channels?.feishu;
    if (!feishu) return;
    if (accountId === "default") {
      feishu.userAccessToken = accessToken;
      feishu.userRefreshToken = refreshToken;
    } else {
      const account = feishu.accounts?.[accountId];
      if (account) {
        account.userAccessToken = accessToken;
        account.userRefreshToken = refreshToken;
      }
    }
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  } catch {
    // Non-fatal
  }
}

// ---------- public API ----------

export interface UserTokenParams {
  accountId?: string;
  appId: string;
  appSecret: string;
  domain?: FeishuDomain;
  userAccessToken?: string;
  userRefreshToken?: string;
}

/**
 * Seed the cache with a known token (called at startup / config load).
 */
export function seedUserToken(params: UserTokenParams): void {
  if (!params.userAccessToken) return;
  const accountId = params.accountId ?? "default";
  if (tokenCache.has(accountId)) return;
  tokenCache.set(accountId, {
    accessToken: params.userAccessToken,
    refreshToken: params.userRefreshToken,
    expiresAt: Date.now() + 90 * 60 * 1000,
  });
}

/**
 * Get a valid user_access_token, refreshing if needed.
 * Returns undefined if no user token is configured.
 */
export async function getUserAccessToken(
  params: UserTokenParams,
): Promise<string | undefined> {
  const accountId = params.accountId ?? "default";
  seedUserToken(params);

  const entry = tokenCache.get(accountId);
  if (!entry) return undefined;

  // Still valid?
  if (Date.now() < entry.expiresAt - REFRESH_BUFFER_MS) {
    return entry.accessToken;
  }

  // No refresh token — return as-is
  if (!entry.refreshToken) {
    return entry.accessToken;
  }

  // Deduplicate concurrent refresh calls
  const existing = refreshLocks.get(accountId);
  if (existing) {
    const result = await existing;
    return result.accessToken;
  }

  const refreshPromise = (async (): Promise<TokenEntry> => {
    try {
      const appToken = await getAppAccessToken(params.appId, params.appSecret, params.domain);
      const result = await refreshUserToken(appToken, entry.refreshToken!, params.domain);

      const newEntry: TokenEntry = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: Date.now() + result.expires_in * 1000,
      };
      tokenCache.set(accountId, newEntry);

      // Persist to disk (best-effort, non-blocking)
      persistTokensToConfig(result.access_token, result.refresh_token, accountId);

      return newEntry;
    } finally {
      refreshLocks.delete(accountId);
    }
  })();

  refreshLocks.set(accountId, refreshPromise);
  const result = await refreshPromise;
  return result.accessToken;
}

import type {
    FeishuConfigSchema,
    FeishuAccountConfigSchema,
    z,
} from "./config-schema.js";

export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;
export type FeishuAccountConfig = z.infer<typeof FeishuAccountConfigSchema>;

export type FeishuDomain = "feishu" | "lark" | (string & {});

export type ResolvedFeishuAccount = {
    accountId: string;
    enabled: boolean;
    configured: boolean;
    name?: string;
    appId?: string;
    appSecret?: string;
    encryptKey?: string;
    verificationToken?: string;
    domain: FeishuDomain;
    userAccessToken?: string;
    userRefreshToken?: string;
    /** Merged config (top-level defaults + account-specific overrides) */
    config: FeishuConfig;
};

export type FeishuToolsConfig = {
    doc?: boolean;
    wiki?: boolean;
    drive?: boolean;
    perm?: boolean;
    scopes?: boolean;
    docRaw?: boolean;
};

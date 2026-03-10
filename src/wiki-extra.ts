import * as Lark from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { listEnabledFeishuAccounts } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { getUserAccessToken, type UserTokenParams } from "./user-token.js";
import { FeishuWikiExtraSchema, type FeishuWikiExtraParams } from "./wiki-extra-schema.js";
import type { FeishuDomain } from "./types.js";

// ============ Helpers ============

function json(data: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        details: data,
    };
}

function resolveOpenApiBase(domain?: FeishuDomain): string {
    if (!domain || domain === "feishu") return "https://open.feishu.cn/open-apis";
    if (domain === "lark") return "https://open.larksuite.com/open-apis";
    return `${domain.replace(/\/+$/, "")}/open-apis`;
}

// ============ Actions ============

async function createSpace(
    client: Lark.Client,
    name: string,
    description?: string,
    userAccessToken?: string,
    domain?: FeishuDomain,
) {
    // Prefer user token mode for create_space (some tenants/API policies require user_access_token)
    if (userAccessToken) {
        const base = resolveOpenApiBase(domain);
        const res = await fetch(`${base}/wiki/v2/spaces`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${userAccessToken}`,
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({ name, description }),
        });

        let data: Record<string, unknown> | null = null;
        try {
            data = (await res.json()) as Record<string, unknown>;
        } catch {
            data = null;
        }

        const code = Number((data?.code as number | undefined) ?? -1);
        if (!res.ok || code !== 0) {
            const msg = String((data?.msg as string | undefined) ?? `HTTP ${res.status}`);
            throw new Error(
                `create_space (user token) failed: ${msg}${data?.code ? ` (code=${String(data.code)})` : ""}`,
            );
        }

        const space = (data?.data as Record<string, unknown> | undefined)?.space as
            | Record<string, unknown>
            | undefined;
        return {
            space_id: (space?.space_id as string | undefined) ?? undefined,
            name: (space?.name as string | undefined) ?? name,
            description: (space?.description as string | undefined) ?? description,
            visibility: space?.visibility,
            token_mode: "user_access_token",
        };
    }

    const res = await client.wiki.space.create({
        data: {
            name,
            description,
        },
    });
    if (res.code !== 0) {
        throw new Error(
            `${res.msg} (tip: configure channels.feishu.userAccessToken for create_space if tenant token is not accepted)`,
        );
    }

    const space = res.data?.space;
    return {
        space_id: space?.space_id,
        name: space?.name,
        description: space?.description,
        visibility: space?.visibility,
        token_mode: "tenant_access_token",
    };
}

async function deleteNode(
    client: Lark.Client,
    spaceId: string,
    nodeToken: string,
    userAccessToken?: string,
    domain?: FeishuDomain,
) {
    // Feishu does NOT have a DELETE /wiki/v2/spaces/{space_id}/nodes/{node_token} endpoint.
    // The correct approach is a two-step process:
    //   1. Get the wiki node to retrieve obj_token and obj_type
    //   2. Delete the underlying file via Drive API: DELETE /drive/v1/files/{obj_token}?type={obj_type}
    // The file is moved to the user's recycle bin (recoverable for 30 days).

    if (!userAccessToken) {
        throw new Error(
            "delete requires user_access_token (401). Configure userAccessToken in feishu account settings.",
        );
    }

    const base = resolveOpenApiBase(domain);

    // Step 1: Resolve node → obj_token + obj_type
    const nodeRes = await client.wiki.space.getNode(
        { params: { token: nodeToken } },
        Lark.withUserAccessToken(userAccessToken),
    );
    if (nodeRes.code !== 0) {
        if (nodeRes.code === 404) {
            throw new Error(
                `Node not found (404): node_token "${nodeToken}" does not exist or is not accessible.`,
            );
        }
        if (nodeRes.code === 403) {
            throw new Error(
                `Permission denied (403): cannot read node. Ensure the bot/user has wiki space access.`,
            );
        }
        throw new Error(`Failed to resolve node: ${nodeRes.msg} (code=${nodeRes.code})`);
    }

    const node = nodeRes.data?.node;
    if (!node?.obj_token || !node?.obj_type) {
        throw new Error(
            `Node resolved but missing obj_token/obj_type. Raw: ${JSON.stringify(node)}`,
        );
    }

    const { obj_token, obj_type, title } = node;

    // Step 2: Delete underlying file via Drive API
    // obj_type from wiki API: "docx", "sheet", "bitable", "doc", "file", etc.
    const driveRes = await fetch(
        `${base}/drive/v1/files/${obj_token}?type=${obj_type}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${userAccessToken}`,
                "Content-Type": "application/json; charset=utf-8",
            },
        },
    );

    let driveData: Record<string, unknown> | null = null;
    try {
        driveData = (await driveRes.json()) as Record<string, unknown>;
    } catch {
        driveData = null;
    }

    const driveCode = Number((driveData?.code as number | undefined) ?? -1);
    if (!driveRes.ok || driveCode !== 0) {
        const msg = String((driveData?.msg as string | undefined) ?? `HTTP ${driveRes.status}`);
        if (driveRes.status === 404 || driveCode === 404) {
            throw new Error(
                `File not found in Drive (404): obj_token="${obj_token}" type="${obj_type}". ` +
                `The wiki node exists but the underlying file may have already been deleted.`,
            );
        }
        if (driveRes.status === 403 || driveCode === 403) {
            throw new Error(
                `Permission denied (403): cannot delete file. ` +
                `The user must be the file owner or have edit access to the parent folder. ` +
                `obj_token="${obj_token}" type="${obj_type}".`,
            );
        }
        if (driveRes.status === 401 || driveCode === 401) {
            throw new Error(`Authentication failed (401): user_access_token may be expired. Detail: ${msg}`);
        }
        throw new Error(
            `Drive delete failed: ${msg}` +
            `${driveData?.code ? ` (code=${String(driveData.code)})` : ""} ` +
            `obj_token="${obj_token}" type="${obj_type}"`,
        );
    }

    return {
        success: true,
        deleted_node_token: nodeToken,
        obj_token,
        obj_type,
        title,
        space_id: spaceId,
        note: "File moved to recycle bin. Recoverable within 30 days.",
    };
}

// ============ Tool Registration ============

export function registerFeishuWikiExtraTools(api: OpenClawPluginApi) {
    if (!api.config) {
        api.logger.debug?.("feishu_wiki_extra: No config available, skipping");
        return;
    }

    const accounts = listEnabledFeishuAccounts(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.("feishu_wiki_extra: No Feishu accounts configured, skipping");
        return;
    }

    const firstAccount = accounts[0];
    const getClient = () => createFeishuClient(firstAccount);

    // Helper to get auto-refreshing user token
    const tokenParams: UserTokenParams = {
        accountId: firstAccount.accountId,
        appId: firstAccount.appId!,
        appSecret: firstAccount.appSecret!,
        domain: firstAccount.domain,
        userAccessToken: firstAccount.userAccessToken,
        userRefreshToken: firstAccount.userRefreshToken,
    };
    const getToken = () => getUserAccessToken(tokenParams);

    api.registerTool(
        {
            name: "feishu_wiki_extra",
            label: "Feishu Wiki Extra",
            description:
                "Extra Feishu wiki operations not in the official plugin. " +
                "Actions: delete (delete a wiki node via Drive API), " +
                "create_space (create a new knowledge space). " +
                "Note: for other wiki operations (spaces, nodes, get, create, move, rename), " +
                "use the official feishu_wiki tool.",
            parameters: FeishuWikiExtraSchema,
            async execute(_toolCallId, params) {
                const p = params as FeishuWikiExtraParams;
                try {
                    const client = getClient();
                    const token = await getToken();
                    switch (p.action) {
                        case "delete":
                            return json(
                                await deleteNode(
                                    client,
                                    p.space_id,
                                    p.node_token,
                                    token,
                                    firstAccount.domain,
                                ),
                            );
                        case "create_space":
                            return json(
                                await createSpace(
                                    client,
                                    p.name,
                                    p.description,
                                    token,
                                    firstAccount.domain,
                                ),
                            );
                        default:
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            return json({ error: `Unknown action: ${(p as any).action}` });
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return json({ error: msg });
                }
            },
        },
        { name: "feishu_wiki_extra" },
    );

    api.logger.info?.("feishu_wiki_extra: Registered feishu_wiki_extra tool");
}

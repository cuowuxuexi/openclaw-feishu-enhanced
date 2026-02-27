import * as Lark from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { listEnabledFeishuAccounts } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { resolveToolsConfig } from "./tools-config.js";
import { getUserAccessToken, type UserTokenParams } from "./user-token.js";
import { FeishuWikiSchema, type FeishuWikiParams } from "./wiki-schema.js";
import type { FeishuDomain } from "./types.js";

// ============ Helpers ============

function json(data: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        details: data,
    };
}

type ObjType = "doc" | "sheet" | "mindnote" | "bitable" | "file" | "docx" | "slides";

function userTokenOptions(userAccessToken?: string) {
    return userAccessToken ? Lark.withUserAccessToken(userAccessToken) : undefined;
}

function resolveOpenApiBase(domain?: FeishuDomain): string {
    if (!domain || domain === "feishu") return "https://open.feishu.cn/open-apis";
    if (domain === "lark") return "https://open.larksuite.com/open-apis";
    return `${domain.replace(/\/+$/, "")}/open-apis`;
}

// ============ Actions ============

const WIKI_ACCESS_HINT =
    "To grant wiki access: Open wiki space → Settings → Members → Add the bot. " +
    "See: https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa#a40ad4ca";

async function listSpaces(client: Lark.Client, userAccessToken?: string) {
    const res = await client.wiki.space.list({}, userTokenOptions(userAccessToken));
    if (res.code !== 0) {
        throw new Error(res.msg);
    }

    const spaces =
        res.data?.items?.map((s) => ({
            space_id: s.space_id,
            name: s.name,
            description: s.description,
            visibility: s.visibility,
        })) ?? [];

    return {
        spaces,
        ...(spaces.length === 0 && { hint: WIKI_ACCESS_HINT }),
    };
}

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

async function listNodes(
    client: Lark.Client,
    spaceId: string,
    parentNodeToken?: string,
    userAccessToken?: string,
) {
    const res = await client.wiki.spaceNode.list(
        {
            path: { space_id: spaceId },
            params: { parent_node_token: parentNodeToken },
        },
        userTokenOptions(userAccessToken),
    );
    if (res.code !== 0) {
        throw new Error(res.msg);
    }

    return {
        nodes:
            res.data?.items?.map((n) => ({
                node_token: n.node_token,
                obj_token: n.obj_token,
                obj_type: n.obj_type,
                title: n.title,
                has_child: n.has_child,
            })) ?? [],
    };
}

async function getNode(client: Lark.Client, token: string, userAccessToken?: string) {
    const res = await client.wiki.space.getNode(
        {
            params: { token },
        },
        userTokenOptions(userAccessToken),
    );
    if (res.code !== 0) {
        throw new Error(res.msg);
    }

    const node = res.data?.node;
    return {
        node_token: node?.node_token,
        space_id: node?.space_id,
        obj_token: node?.obj_token,
        obj_type: node?.obj_type,
        title: node?.title,
        parent_node_token: node?.parent_node_token,
        has_child: node?.has_child,
        creator: node?.creator,
        create_time: node?.node_create_time,
    };
}

async function createNode(
    client: Lark.Client,
    spaceId: string,
    title: string,
    objType?: string,
    parentNodeToken?: string,
    userAccessToken?: string,
) {
    const res = await client.wiki.spaceNode.create(
        {
            path: { space_id: spaceId },
            data: {
                obj_type: (objType as ObjType) || "docx",
                node_type: "origin" as const,
                title,
                parent_node_token: parentNodeToken,
            },
        },
        userTokenOptions(userAccessToken),
    );
    if (res.code !== 0) {
        throw new Error(res.msg);
    }

    const node = res.data?.node;
    return {
        node_token: node?.node_token,
        obj_token: node?.obj_token,
        obj_type: node?.obj_type,
        title: node?.title,
    };
}

async function moveNode(
    client: Lark.Client,
    spaceId: string,
    nodeToken: string,
    targetSpaceId?: string,
    targetParentToken?: string,
    userAccessToken?: string,
) {
    const res = await client.wiki.spaceNode.move(
        {
            path: { space_id: spaceId, node_token: nodeToken },
            data: {
                target_space_id: targetSpaceId || spaceId,
                target_parent_token: targetParentToken,
            },
        },
        userTokenOptions(userAccessToken),
    );
    if (res.code !== 0) {
        throw new Error(res.msg);
    }

    return {
        success: true,
        node_token: res.data?.node?.node_token,
    };
}

async function renameNode(
    client: Lark.Client,
    spaceId: string,
    nodeToken: string,
    title: string,
    userAccessToken?: string,
) {
    const res = await client.wiki.spaceNode.updateTitle(
        {
            path: { space_id: spaceId, node_token: nodeToken },
            data: { title },
        },
        userTokenOptions(userAccessToken),
    );
    if (res.code !== 0) {
        throw new Error(res.msg);
    }

    return {
        success: true,
        node_token: nodeToken,
        title,
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

export function registerFeishuWikiTools(api: OpenClawPluginApi) {
    if (!api.config) {
        api.logger.debug?.("feishu_wiki: No config available, skipping wiki tools");
        return;
    }

    const accounts = listEnabledFeishuAccounts(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.("feishu_wiki: No Feishu accounts configured, skipping wiki tools");
        return;
    }

    const firstAccount = accounts[0];
    const toolsCfg = resolveToolsConfig(firstAccount.config.tools);
    if (!toolsCfg.wiki) {
        api.logger.debug?.("feishu_wiki: wiki tool disabled in config");
        return;
    }

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
            name: "feishu_wiki",
            label: "Feishu Wiki",
            description:
                "Feishu knowledge base operations. Actions: spaces, create_space, nodes, get, create, move, rename, delete",
            parameters: FeishuWikiSchema,
            async execute(_toolCallId, params) {
                const p = params as FeishuWikiParams;
                try {
                    const client = getClient();
                    const token = await getToken();
                    switch (p.action) {
                        case "spaces":
                            return json(await listSpaces(client, token));
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
                        case "nodes":
                            return json(
                                await listNodes(client, p.space_id, p.parent_node_token, token),
                            );
                        case "get":
                            return json(await getNode(client, p.token, token));
                        case "search":
                            return json({
                                error:
                                    "Search is not available. Use feishu_wiki with action: 'nodes' to browse or action: 'get' to lookup by token.",
                            });
                        case "create":
                            return json(
                                await createNode(
                                    client,
                                    p.space_id,
                                    p.title,
                                    p.obj_type,
                                    p.parent_node_token,
                                    token,
                                ),
                            );
                        case "move":
                            return json(
                                await moveNode(
                                    client,
                                    p.space_id,
                                    p.node_token,
                                    p.target_space_id,
                                    p.target_parent_token,
                                    token,
                                ),
                            );
                        case "rename":
                            return json(
                                await renameNode(
                                    client,
                                    p.space_id,
                                    p.node_token,
                                    p.title,
                                    token,
                                ),
                            );
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
                        default:
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exhaustive check fallback
                            return json({ error: `Unknown action: ${(p as any).action}` });
                    }
                } catch (err) {
                    return json({ error: err instanceof Error ? err.message : String(err) });
                }
            },
        },
        { name: "feishu_wiki" },
    );

    api.logger.info?.(`feishu_wiki: Registered feishu_wiki tool`);
}

import * as Lark from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { listEnabledFeishuAccounts } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { FeishuDocRawSchema, type FeishuDocRawParams } from "./docx-raw-schema.js";
import { resolveToolsConfig } from "./tools-config.js";
import { getUserAccessToken, type UserTokenParams } from "./user-token.js";

// ============ Helpers ============

function json(data: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        details: data,
    };
}

function userTokenOptions(userAccessToken?: string) {
    return userAccessToken ? Lark.withUserAccessToken(userAccessToken) : undefined;
}

function mapError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("400")) {
        return json({ error: "Invalid block structure", code: 400, detail: msg });
    }
    if (msg.includes("401")) {
        return json({ error: "Authentication failed", code: 401, detail: msg });
    }
    if (msg.includes("403")) {
        return json({ error: "Permission denied", code: 403, detail: msg });
    }
    return json({ error: msg });
}

// Block types that cannot be created via documentBlockChildren.create API
const UNSUPPORTED_CREATE_TYPES = new Set([31, 32]);

const BLOCK_TYPE_NAMES: Record<number, string> = {
    1: "Page",
    2: "Text",
    3: "Heading1",
    4: "Heading2",
    5: "Heading3",
    12: "Bullet",
    13: "Ordered",
    14: "Code",
    15: "Quote",
    17: "Todo",
    18: "Bitable",
    21: "Diagram",
    22: "Divider",
    23: "File",
    27: "Image",
    30: "Sheet",
    31: "Table",
    32: "TableCell",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function cleanBlocksForInsert(blocks: any[]): { cleaned: any[]; skipped: string[] } {
    const skipped: string[] = [];
    const cleaned = blocks.filter((block) => {
        if (UNSUPPORTED_CREATE_TYPES.has(block.block_type)) {
            skipped.push(BLOCK_TYPE_NAMES[block.block_type] || `type_${block.block_type}`);
            return false;
        }
        return true;
    });
    return { cleaned, skipped };
}

// ============ Core Functions ============

async function clearDocumentContent(
    client: Lark.Client,
    docToken: string,
    userAccessToken?: string,
) {
    const existing = await client.docx.documentBlock.list(
        { path: { document_id: docToken } },
        userTokenOptions(userAccessToken),
    );
    if (existing.code !== 0) throw new Error(existing.msg);

    const childIds =
        existing.data?.items
            ?.filter((b) => b.parent_id === docToken && b.block_type !== 1)
            .map((b) => b.block_id) ?? [];

    if (childIds.length > 0) {
        const res = await client.docx.documentBlockChildren.batchDelete(
            {
                path: { document_id: docToken, block_id: docToken },
                data: { start_index: 0, end_index: childIds.length },
            },
            userTokenOptions(userAccessToken),
        );
        if (res.code !== 0) throw new Error(res.msg);
    }
    return childIds.length;
}

async function insertBlocksRaw(
    client: Lark.Client,
    docToken: string,
    blocks: any[],
    parentBlockId?: string,
    index?: number,
    userAccessToken?: string,
): Promise<{ children: any[]; skipped: string[] }> {
    const { cleaned, skipped } = cleanBlocksForInsert(blocks);
    const blockId = parentBlockId ?? docToken;

    if (cleaned.length === 0) {
        return { children: [], skipped };
    }

    const data: any = { children: cleaned };
    if (typeof index === "number") {
        data.index = index;
    }

    const res = await client.docx.documentBlockChildren.create(
        {
            path: { document_id: docToken, block_id: blockId },
            data,
        },
        userTokenOptions(userAccessToken),
    );
    if (res.code !== 0) throw new Error(res.msg);
    return { children: res.data?.children ?? [], skipped };
}

// ============ Actions ============

async function writeBlocks(
    client: Lark.Client,
    docToken: string,
    blocks: any[],
    userAccessToken?: string,
) {
    const deleted = await clearDocumentContent(client, docToken, userAccessToken);
    const { children, skipped } = await insertBlocksRaw(
        client,
        docToken,
        blocks,
        undefined,
        undefined,
        userAccessToken,
    );

    return {
        success: true,
        blocks_deleted: deleted,
        blocks_added: children.length,
        block_ids: children.map((b: any) => b.block_id),
        ...(skipped.length > 0 && {
            warning: `Skipped unsupported block types: ${skipped.join(", ")}`,
        }),
    };
}

async function appendBlocks(
    client: Lark.Client,
    docToken: string,
    blocks: any[],
    userAccessToken?: string,
) {
    const { children, skipped } = await insertBlocksRaw(
        client,
        docToken,
        blocks,
        undefined,
        undefined,
        userAccessToken,
    );

    return {
        success: true,
        blocks_added: children.length,
        block_ids: children.map((b: any) => b.block_id),
        ...(skipped.length > 0 && {
            warning: `Skipped unsupported block types: ${skipped.join(", ")}`,
        }),
    };
}

async function insertBlocksAction(
    client: Lark.Client,
    docToken: string,
    parentBlockId: string,
    blocks: any[],
    index?: number,
    userAccessToken?: string,
) {
    const { children, skipped } = await insertBlocksRaw(
        client,
        docToken,
        blocks,
        parentBlockId,
        index,
        userAccessToken,
    );

    return {
        success: true,
        parent_block_id: parentBlockId,
        blocks_added: children.length,
        block_ids: children.map((b: any) => b.block_id),
        ...(skipped.length > 0 && {
            warning: `Skipped unsupported block types: ${skipped.join(", ")}`,
        }),
    };
}

async function batchUpdate(
    client: Lark.Client,
    docToken: string,
    updates: Array<{ block_id: string; content?: string; elements?: any[] }>,
    userAccessToken?: string,
) {
    const results: Array<{ block_id: string; success: boolean; error?: string }> = [];

    for (const update of updates) {
        try {
            const elements =
                update.elements ?? [{ text_run: { content: update.content ?? "" } }];

            const res = await client.docx.documentBlock.patch(
                {
                    path: { document_id: docToken, block_id: update.block_id },
                    data: {
                        update_text_elements: { elements },
                    },
                },
                userTokenOptions(userAccessToken),
            );
            if (res.code !== 0) {
                results.push({ block_id: update.block_id, success: false, error: res.msg });
            } else {
                results.push({ block_id: update.block_id, success: true });
            }
        } catch (err) {
            results.push({
                block_id: update.block_id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const succeeded = results.filter((r) => r.success).length;
    return {
        success: succeeded === results.length,
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        results,
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============ Tool Registration ============

export function registerFeishuDocRawTools(api: OpenClawPluginApi) {
    if (!api.config) {
        api.logger.debug?.("feishu_doc_raw: No config available, skipping");
        return;
    }

    const accounts = listEnabledFeishuAccounts(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.("feishu_doc_raw: No Feishu accounts configured, skipping");
        return;
    }

    const firstAccount = accounts[0];
    const toolsCfg = resolveToolsConfig(firstAccount.config.tools);
    if (!toolsCfg.docRaw) {
        api.logger.debug?.("feishu_doc_raw: docRaw tool disabled in config");
        return;
    }

    const getClient = () => createFeishuClient(firstAccount);

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
            name: "feishu_doc_raw",
            label: "Feishu Doc Raw",
            description:
                "Feishu document raw block operations (bypass markdown conversion). " +
                "Actions: write_blocks, append_blocks, insert_blocks, batch_update. " +
                "Block types: 2=Text, 3=Heading1, 4=Heading2, 5=Heading3, 12=Bullet, " +
                "13=Ordered, 14=Code, 15=Quote, 17=Todo, 22=Divider. " +
                "Rich text via text_element_style: bold, italic, strikethrough, underline, inline_code, link:{url:'...'}.",
            parameters: FeishuDocRawSchema,
            async execute(_toolCallId, params) {
                const p = params as FeishuDocRawParams;
                try {
                    const client = getClient();
                    const token = await getToken();
                    switch (p.action) {
                        case "write_blocks":
                            return json(await writeBlocks(client, p.doc_token, p.blocks, token));
                        case "append_blocks":
                            return json(await appendBlocks(client, p.doc_token, p.blocks, token));
                        case "insert_blocks":
                            return json(
                                await insertBlocksAction(
                                    client,
                                    p.doc_token,
                                    p.parent_block_id,
                                    p.blocks,
                                    p.index,
                                    token,
                                ),
                            );
                        case "batch_update":
                            return json(await batchUpdate(client, p.doc_token, p.updates, token));
                        default:
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            return json({ error: `Unknown action: ${(p as any).action}` });
                    }
                } catch (err) {
                    return mapError(err);
                }
            },
        },
        { name: "feishu_doc_raw" },
    );

    api.logger.info?.("feishu_doc_raw: Registered feishu_doc_raw tool");
}

import { Type, type Static } from "@sinclair/typebox";

const BlockJson = Type.Any({
    description:
        "Block JSON object. Required field: block_type (2=Text, 3=H1, 4=H2, 5=H3, 12=Bullet, 13=Ordered, 14=Code, 15=Quote, 17=Todo, 22=Divider). " +
        "Content field matches type name, e.g. block_type:2 → text:{elements:[{text_run:{content:'...'}}]}. " +
        "Rich styles via text_element_style: bold, italic, strikethrough, underline, inline_code, link:{url:'...'}.",
});

export const FeishuDocRawSchema = Type.Union([
    Type.Object({
        action: Type.Literal("write_blocks"),
        doc_token: Type.String({ description: "Document token (from URL /docx/XXX)" }),
        blocks: Type.Array(BlockJson, {
            description: "Array of block JSON objects to write (replaces entire document content)",
        }),
    }),
    Type.Object({
        action: Type.Literal("append_blocks"),
        doc_token: Type.String({ description: "Document token" }),
        blocks: Type.Array(BlockJson, {
            description: "Array of block JSON objects to append at end of document",
        }),
    }),
    Type.Object({
        action: Type.Literal("insert_blocks"),
        doc_token: Type.String({ description: "Document token" }),
        parent_block_id: Type.String({ description: "Parent block ID to insert children under" }),
        blocks: Type.Array(BlockJson, {
            description: "Array of block JSON objects to insert as children",
        }),
        index: Type.Optional(
            Type.Number({ description: "Insert position index (default: append at end)" }),
        ),
    }),
    Type.Object({
        action: Type.Literal("batch_update"),
        doc_token: Type.String({ description: "Document token" }),
        updates: Type.Array(
            Type.Object({
                block_id: Type.String({ description: "Block ID to update" }),
                content: Type.Optional(
                    Type.String({ description: "New plain text content (for simple updates)" }),
                ),
                elements: Type.Optional(
                    Type.Array(Type.Any(), {
                        description:
                            "Rich text elements array (overrides content). Format: [{text_run:{content:'...',text_element_style:{bold:true}}}]",
                    }),
                ),
            }),
            { description: "Array of block updates" },
        ),
    }),
]);

export type FeishuDocRawParams = Static<typeof FeishuDocRawSchema>;

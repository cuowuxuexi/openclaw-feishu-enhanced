import { Type, type Static } from "@sinclair/typebox";

export const FeishuWikiExtraSchema = Type.Union([
    Type.Object({
        action: Type.Literal("delete"),
        space_id: Type.String({ description: "Knowledge space ID" }),
        node_token: Type.String({ description: "Node token to delete" }),
    }),
    Type.Object({
        action: Type.Literal("create_space"),
        name: Type.String({ description: "Knowledge space name" }),
        description: Type.Optional(
            Type.String({ description: "Knowledge space description" }),
        ),
    }),
]);

export type FeishuWikiExtraParams = Static<typeof FeishuWikiExtraSchema>;

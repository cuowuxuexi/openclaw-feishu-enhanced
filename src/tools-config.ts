import type { FeishuToolsConfig } from "./types.js";

/**
 * Default tool configuration.
 * - doc, wiki, drive, scopes, docRaw: enabled by default
 * - perm: disabled by default (sensitive operation)
 */
export const DEFAULT_TOOLS_CONFIG: Required<FeishuToolsConfig> = {
    doc: true,
    wiki: true,
    drive: true,
    perm: false,
    scopes: true,
    docRaw: true,
};

/**
 * Resolve tools config with defaults.
 */
export function resolveToolsConfig(cfg?: FeishuToolsConfig): Required<FeishuToolsConfig> {
    return { ...DEFAULT_TOOLS_CONFIG, ...cfg };
}

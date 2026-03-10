import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerFeishuDocRawTools } from "./src/docx-raw.js";
import { registerFeishuWikiExtraTools } from "./src/wiki-extra.js";
import { setFeishuRuntime } from "./src/runtime.js";

const plugin = {
    id: "feishu-enhanced",
    name: "Feishu Enhanced",
    description:
        "Extra Feishu tools: Raw Block writing (feishu_doc_raw) & Wiki delete/create_space (feishu_wiki_extra)",
    configSchema: emptyPluginConfigSchema(),
    register(api: OpenClawPluginApi) {
        setFeishuRuntime(api.runtime);
        registerFeishuDocRawTools(api);
        registerFeishuWikiExtraTools(api);
    },
};

export default plugin;

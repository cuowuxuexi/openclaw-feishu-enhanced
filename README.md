# OpenClaw Feishu Enhanced 🚀

**纯增量工具插件**——在官方 `@openclaw/feishu` 插件基础上，添加官方没有的功能。

## ✨ 提供的工具

| 工具名 | 说明 |
|--------|------|
| `feishu_doc_raw` | Raw Block 直写，绕过 Markdown → block 转换（复杂结构不再 400） |
| `feishu_wiki_extra` | Wiki 扩展操作：删除节点（`delete`）、创建空间（`create_space`） |

> 其他 Feishu 工具（`feishu_doc`、`feishu_wiki`、`feishu_drive`、`feishu_bitable`、`feishu_perm`）由官方插件提供。

## 📦 安装

```bash
cd ~/.openclaw/node_modules/openclaw/extensions/
git clone <repo-url> feishu-enhanced
cd feishu-enhanced && npm install
npx openclaw restart
```

> **重要**：本插件 ID 为 `feishu-enhanced`，与官方 `feishu` 插件**完全独立**，不会冲突，也不会在 OpenClaw 升级时被覆盖。

## ⚙️ 配置

本插件读取与官方插件相同的 `channels.feishu` 配置（appId、appSecret 等），无需额外配置。

工具开关通过 `channels.feishu.tools.docRaw` 控制：

```yaml
channels:
  feishu:
    appId: "cli_xxx"
    appSecret: "xxx"
    userAccessToken: "u-xxx"      # wiki delete 和 create_space 需要
    userRefreshToken: "ur-xxx"    # 自动续期 token
    tools:
      docRaw: true                # Raw Block 直写（默认开启）
```

## 📁 文件结构

```
feishu-enhanced/
├── index.ts                      # 插件入口（仅注册 2 个工具）
├── openclaw.plugin.json          # id: "feishu-enhanced"
├── package.json
├── tsconfig.json
├── src/
│   ├── docx-raw.ts               # ⭐ Raw Block 直写
│   ├── docx-raw-schema.ts        # Raw Block 参数 schema
│   ├── wiki-extra.ts             # ⭐ Wiki delete + create_space
│   ├── wiki-extra-schema.ts      # Wiki 扩展 schema
│   ├── client.ts                 # Lark SDK 客户端（共享依赖）
│   ├── accounts.ts               # 账户解析（共享依赖）
│   ├── user-token.ts             # Token 自动续期（共享依赖）
│   ├── config-schema.ts          # 配置 schema
│   ├── types.ts                  # 类型定义
│   ├── tools-config.ts           # 工具开关
│   └── runtime.ts                # 运行时引用
└── skills/
    └── feishu-doc/SKILL.md       # docRaw 工具技能文档
```

## 🔍 与官方插件的关系

- **不冲突**：ID 不同，工具名不同，频道不注册
- **共享配置**：读取同一个 `channels.feishu` 配置段
- **独立升级**：OpenClaw 升级不影响本插件，本插件更新不影响官方功能

---

**最后更新**：2026-03-09

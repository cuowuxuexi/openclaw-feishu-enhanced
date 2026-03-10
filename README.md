# OpenClaw Feishu Enhanced 🚀

**纯增量工具插件** — 在官方 `@openclaw/feishu` 插件基础上，添加官方没有的功能。

> 与官方插件**完全独立**，不会冲突，也不会在 OpenClaw 升级时被覆盖。

## ✨ 提供的工具

| 工具名 | 说明 |
|--------|------|
| `feishu_doc_raw` | Raw Block 直写，绕过 Markdown → block 转换（复杂结构不再 400） |
| `feishu_wiki_extra` | Wiki 扩展操作：删除节点（`delete`）、创建空间（`create_space`） |

> 其他 Feishu 工具（`feishu_doc`、`feishu_wiki`、`feishu_drive`、`feishu_bitable`、`feishu_perm`）由官方插件提供。

## ❓ 为什么需要 Raw Block 写入

官方插件的 `feishu_doc` write/append 走 **Markdown → 飞书 `document.convert` API → block JSON** 管道。当 Markdown 结构复杂时（嵌套列表、富文本链接、混合格式），`document.convert` 经常返回 **HTTP 400**。

`feishu_doc_raw` 直接提交 block JSON 给 `documentBlockChildren.create` API，完全绕开转换环节，成功率大幅提高。

### `feishu_doc_raw` Actions

| Action | 说明 |
|--------|------|
| `write_blocks` | 清空文档后写入 block JSON 数组 |
| `append_blocks` | 向文档末尾追加 blocks |
| `insert_blocks` | 在指定 parent block 下插入子块 |
| `batch_update` | 批量更新多个 block 的文本内容 |

### `feishu_wiki_extra` Actions

| Action | 说明 |
|--------|------|
| `delete` | 删除 Wiki 节点（自动解析 obj_token → 通过 Drive API 删除，进回收站 30 天可恢复） |
| `create_space` | 创建新的知识空间 |

## 📦 安装

```bash
cd ~/.openclaw/node_modules/openclaw/extensions/
git clone https://github.com/cuowuxuexi/openclaw-feishu-enhanced.git feishu-enhanced
cd feishu-enhanced && npm install
```

然后在 `openclaw.json` 中启用插件：

```json
{
  "plugins": {
    "allow": ["feishu", "feishu-enhanced"],
    "entries": {
      "feishu": { "enabled": true },
      "feishu-enhanced": { "enabled": true }
    }
  }
}
```

重启 OpenClaw 即可生效。

## ⚙️ 配置

本插件读取与官方插件相同的 `channels.feishu` 配置（appId、appSecret 等），无需额外配置。

Wiki delete 和 create_space 操作需要用户级别的 token：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "userAccessToken": "u-xxx",
      "userRefreshToken": "ur-xxx"
    }
  }
}
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
    └── feishu-doc/
        ├── SKILL.md              # docRaw 工具技能文档
        └── references/
            └── block-types.md    # 飞书 Block 类型速查表
```

## 🔍 与官方插件的关系

- **不冲突** — 插件 ID 不同（`feishu-enhanced` vs `feishu`），工具名不同，频道不注册
- **共享配置** — 读取同一个 `channels.feishu` 配置段
- **独立升级** — OpenClaw 升级不影响本插件，本插件更新不影响官方功能

## 📜 许可

MIT License

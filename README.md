# OpenClaw Feishu Enhanced 🚀

[English](#english) | [中文](#中文)

---

<a name="中文"></a>

## 中文

**OpenClaw Feishu Enhanced** 是 [OpenClaw](https://github.com/nicepkg/openclaw) 飞书插件的增强版 Fork。在保留原版全部功能的基础上，新增了 **Raw Block 直写** 能力和 **Wiki 节点删除** 支持。

### ✨ 新增功能

| 功能 | 原版能力 | 增强版新增 |
|------|---------|-----------|
| **文档写入** | Markdown → 自动转换 block（复杂结构易 400） | ✅ `feishu_doc_raw` 直写 block JSON，绕过 Markdown 转换 |
| **Wiki 删除** | ❌ 不支持 | ✅ `feishu_wiki` 新增 `delete` action |
| **错误提示** | 通用错误信息 | ✅ 400/401/403 分别映射为清晰的错误提示 |

### ❓ 为什么需要 Raw Block 写入

原版的 `feishu_doc` write/append 走 **Markdown → 飞书 `document.convert` API → block JSON** 的管道。当 Markdown 结构复杂时（嵌套列表、富文本链接、混合格式），`document.convert` 经常返回 **HTTP 400** 错误。

`feishu_doc_raw` 直接提交 block JSON 给 `documentBlockChildren.create` API，完全绕开转换环节，成功率大幅提高。

### 📦 安装

#### 方式一：替换现有飞书扩展

```bash
# 进入 OpenClaw 扩展目录
cd ~/.openclaw/node_modules/openclaw/extensions/

# 备份原版
mv feishu feishu.bak

# 克隆增强版
git clone https://github.com/YOUR_USERNAME/openclaw-feishu-enhanced.git feishu

# 安装依赖
cd feishu && npm install

# 重启 OpenClaw
npx openclaw restart
```

#### 方式二：作为额外插件安装

```bash
cd ~/.openclaw/node_modules/openclaw/extensions/
git clone https://github.com/YOUR_USERNAME/openclaw-feishu-enhanced.git feishu-enhanced
cd feishu-enhanced && npm install
```

> **注意**：方式二需要修改 `openclaw.plugin.json` 中的插件 `id` 避免与原版冲突。

### ⚙️ 配置

在 OpenClaw 配置文件中添加飞书账户信息：

```yaml
channels:
  feishu:
    appId: "cli_xxx"
    appSecret: "xxx"
    userAccessToken: "u-xxx"      # 用于 wiki delete 等需要用户身份的操作
    userRefreshToken: "ur-xxx"    # 自动续期 token
```

工具开关在 `tools` 中配置：

```yaml
channels:
  feishu:
    tools:
      doc: true       # 原版文档工具（默认开启）
      docRaw: true    # Raw Block 直写（默认开启）
      wiki: true      # Wiki 工具（默认开启）
      drive: true     # 云空间工具（默认开启）
      perm: false     # 权限管理（默认关闭，敏感操作）
      scopes: true    # 应用权限查看（默认开启）
```

### 🔧 工具参考

#### `feishu_doc_raw` — Raw Block 直写

| Action | 说明 |
|--------|------|
| `write_blocks` | 清空文档后写入 block JSON 数组 |
| `append_blocks` | 向文档末尾追加 blocks |
| `insert_blocks` | 在指定 parent block 下插入子块 |
| `batch_update` | 批量更新多个 block 的文本内容 |

**Block 类型速查**：

| block_type | 名称 | 内容字段 |
|------------|------|---------|
| 2 | 文本段落 | `text` |
| 3 / 4 / 5 | 一/二/三级标题 | `heading1` / `heading2` / `heading3` |
| 12 | 无序列表 | `bullet` |
| 13 | 有序列表 | `ordered` |
| 14 | 代码块 | `code` |
| 15 | 引用 | `quote` |
| 17 | 待办事项 | `todo` |
| 22 | 分割线 | *(无内容字段)* |

**完整示例 — 写入富文本**：

```json
{
  "action": "append_blocks",
  "doc_token": "YOUR_DOC_TOKEN",
  "blocks": [
    {
      "block_type": 3,
      "heading1": {
        "elements": [{ "text_run": { "content": "欢迎来到知识库 🎉" } }]
      }
    },
    {
      "block_type": 2,
      "text": {
        "elements": [
          { "text_run": { "content": "这是普通文本，" } },
          { "text_run": { "content": "加粗文本", "text_element_style": { "bold": true } } },
          { "text_run": { "content": "，以及" } },
          { "text_run": {
              "content": "一个链接",
              "text_element_style": { "link": { "url": "https://example.com" } }
          }}
        ]
      }
    },
    { "block_type": 22 },
    {
      "block_type": 12,
      "bullet": {
        "elements": [{ "text_run": { "content": "列表项 1" } }]
      }
    },
    {
      "block_type": 12,
      "bullet": {
        "elements": [{ "text_run": { "content": "列表项 2" } }]
      }
    }
  ]
}
```

#### `feishu_wiki` delete — 删除 Wiki 节点

```json
{
  "action": "delete",
  "space_id": "YOUR_SPACE_ID",
  "node_token": "wikcnXXX"
}
```

> **原理**：飞书没有直接删除 wiki 节点的 API。增强版自动执行两步操作：
> 1. 读取节点信息获取底层文件 token（`obj_token`）
> 2. 通过 Drive API 删除文件（文件进入回收站，30 天内可恢复）

### 🔍 与原版的兼容性

- **100% 向后兼容**：所有原版工具（`feishu_doc`、`feishu_wiki`、`feishu_drive`、`feishu_bitable`、`feishu_perm`、`feishu_message`）行为完全不变
- **零破坏升级**：新功能通过新增工具（`feishu_doc_raw`）和新增 action（`wiki.delete`）实现
- **独立开关**：`docRaw` 可在配置中独立启停

### 📁 文件结构

```
openclaw-feishu-enhanced/
├── index.ts                    # 插件入口
├── package.json
├── openclaw.plugin.json
├── src/
│   ├── docx-raw.ts            # ⭐ 新增：Raw Block 直写核心
│   ├── docx-raw-schema.ts     # ⭐ 新增：参数 schema
│   ├── docx.ts                # 原版文档工具
│   ├── doc-schema.ts
│   ├── wiki.ts                # ⭐ 增强：新增 delete action
│   ├── wiki-schema.ts         # ⭐ 增强：新增 delete 参数
│   ├── tools-config.ts        # ⭐ 增强：新增 docRaw 开关
│   ├── types.ts               # ⭐ 增强：FeishuToolsConfig 加字段
│   ├── bitable.ts             # 多维表格
│   ├── drive.ts               # 云空间
│   ├── perm.ts                # 权限管理
│   ├── client.ts              # Lark SDK 客户端
│   ├── user-token.ts          # Token 自动刷新
│   ├── channel.ts             # 频道消息
│   ├── bot.ts                 # Bot 逻辑
│   └── ...                    # 其他辅助模块
└── skills/
    ├── feishu-doc/SKILL.md    # 工具技能文档
    ├── feishu-wiki/SKILL.md
    ├── feishu-drive/SKILL.md
    └── feishu-perm/SKILL.md
```

### 🤝 贡献

欢迎 PR！如果你有新的增强想法，请先开 Issue 讨论。

### 📜 许可

MIT License

### 🙏 致谢

- [OpenClaw](https://github.com/nicepkg/openclaw) — 底层框架
- [@m1heng](https://github.com/m1heng) — 原版飞书插件作者
- 飞书开放平台文档

---

<a name="english"></a>

## English

**OpenClaw Feishu Enhanced** is an enhanced fork of the [OpenClaw](https://github.com/nicepkg/openclaw) Feishu/Lark plugin. It adds **Raw Block writing** and **Wiki node deletion** on top of all original features.

### Key Additions

- **`feishu_doc_raw`** — Write block JSON directly, bypassing Markdown→block conversion (which often fails with HTTP 400 on complex structures)
- **`feishu_wiki` delete** — Delete wiki nodes via Drive API (two-step: resolve node → delete underlying file)
- **Clear error mapping** — 400/401/403 errors return specific, actionable messages

### Quick Start

```bash
# Replace existing feishu extension
cd ~/.openclaw/node_modules/openclaw/extensions/
mv feishu feishu.bak
git clone https://github.com/YOUR_USERNAME/openclaw-feishu-enhanced.git feishu
cd feishu && npm install
npx openclaw restart
```

100% backward compatible with the original plugin. See the Chinese section above for detailed usage examples.

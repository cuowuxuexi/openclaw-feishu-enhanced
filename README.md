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

### 1. 部署插件文件

```bash
# Docker 容器部署（推荐）
# 将插件目录复制到宿主机，通过 volume 映射到容器内
# volume 路径通常为: /data/docker/volumes/openclaw-data/_data/extensions/

# 容器内路径
cd /home/node/.openclaw/extensions/
git clone https://github.com/cuowuxuexi/openclaw-feishu-enhanced.git feishu-enhanced
cd feishu-enhanced && npm install --production
```

### 2. 修改 openclaw.plugin.json

> ⚠️ **重要**：新版 OpenClaw（≥ 2026.3.8）要求 manifest 必须包含 `configSchema` 字段，否则启动会报 `plugin manifest requires configSchema`。

```json
{
    "id": "feishu-enhanced",
    "skills": ["./skills"],
    "configSchema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {}
    }
}
```

### 3. 启用插件

在 `openclaw.json` 中：

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

## 🔑 用户授权（User Token）

`feishu_doc_raw` 使用应用凭据（app_access_token）即可工作，**无需用户授权**。

`feishu_wiki_extra` 的 `delete` 和 `create_space` 操作需要**用户级别的 token**（user_access_token），因为飞书要求这些操作以用户身份执行。

### 授权流程

#### 第一步：构造授权链接

```
https://open.feishu.cn/open-apis/authen/v1/authorize?app_id={APP_ID}&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback&response_type=code&state=taige&scope={SCOPES}
```

> ⚠️ **必须在 URL 中显式指定 `scope` 参数**。不指定 scope 时飞书只给最小权限 `auth:user.id:read`，wiki 等功能会全部失败。

**推荐的 scope 列表**（用 `%20` 分隔）：

```
auth:user.id:read wiki:wiki docx:document drive:drive bitable:app contact:user.base:readonly im:message im:chat sheets:spreadsheet
```

完整 URL 示例：

```
https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_xxx&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback&response_type=code&state=taige&scope=auth:user.id:read%20wiki:wiki%20docx:document%20drive:drive%20bitable:app%20contact:user.base:readonly%20im:message%20im:chat%20sheets:spreadsheet
```

> 💡 如果 scope 中包含应用未开通的权限，飞书会直接报错（如 `20043` 或 `20027`）。遇到报错时去掉对应的 scope 重试即可。

#### 第二步：用户在浏览器中打开链接并授权

授权成功后浏览器会跳转到：

```
http://127.0.0.1:3000/callback?code=XXXXXX&state=taige
```

#### 第三步：用 code 换取 token

使用 `scripts/exchange.js` 工具（位于 `feishu-user-token-plugin` 目录）：

```bash
node scripts/exchange.js {APP_ID} {APP_SECRET} {CODE}
```

或手动调用飞书 API：

```bash
# 1. 获取 app_access_token
curl -X POST https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal \
  -H "Content-Type: application/json" \
  -d '{"app_id":"cli_xxx","app_secret":"xxx"}'

# 2. 用 code 换取 user token
curl -X POST https://open.feishu.cn/open-apis/authen/v1/oidc/access_token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {APP_ACCESS_TOKEN}" \
  -d '{"grant_type":"authorization_code","code":"XXXXXX"}'
```

返回中包含 `access_token`（2 小时有效）和 `refresh_token`（30 天有效）。

> **务必检查返回的 `scope` 字段**，确认包含 `wiki:wiki` 等所需权限。如果只有 `auth:user.id:read`，说明授权 URL 没有指定 scope，需要重新授权。

#### 第四步：写入 openclaw.json

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

插件内置 token 自动续期机制（`src/user-token.ts`），access_token 过期后会自动使用 refresh_token 刷新，无需手动干预。refresh_token 有效期 30 天，到期前需要重新授权。

### 验证 Token 是否可用

```bash
# 1. 验证用户身份（必须通过）
curl -H "Authorization: Bearer {USER_ACCESS_TOKEN}" \
  https://open.feishu.cn/open-apis/authen/v1/user_info
# 期望：code=0, msg=success

# 2. 验证 refresh token（必须通过）
curl -X POST https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token \
  -H "Authorization: Bearer {APP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"refresh_token","refresh_token":"ur-xxx"}'
# 期望：code=0, 返回新的 access_token 和 refresh_token

# 3. 验证 wiki 权限（最终验证）
curl -H "Authorization: Bearer {USER_ACCESS_TOKEN}" \
  https://open.feishu.cn/open-apis/wiki/v2/spaces
# 期望：code=0, 返回用户可见的知识库空间列表
```

> ⚠️ 如果步骤 1、2 不通过，步骤 3 的失败都是**假失败**。必须按顺序验证。

### 权限层级说明

飞书的 Wiki 权限分两层，两层都要通过才能操作：

| 层级 | 说明 | 如何获取 |
|------|------|---------|
| **应用 scope** | OAuth 授权时指定的权限范围 | 授权 URL 中 `scope=wiki:wiki` |
| **资源侧权限** | 用户是否是知识库空间的成员 | 用户本人在飞书中加入知识库空间 |

即使 scope 包含 `wiki:wiki`，如果用户不是某个知识库空间的成员，API 也会返回空列表。

## ⚙️ 其他配置说明

- `mcpServers` 字段：**容器版 OpenClaw（至少到 2026.3.8）不支持此字段**。如果 `openclaw.json` 中包含 `mcpServers`，会导致 `Unrecognized key` 错误，需要移除。
- 插件通过 OpenClaw 的 extensions 目录自动发现机制加载，不需要显式指定路径。

## 📁 文件结构

```
feishu-enhanced/
├── index.ts                      # 插件入口（注册 2 个工具）
├── openclaw.plugin.json          # manifest（必须含 configSchema）
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

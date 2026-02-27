# Changelog

## v1.0.0 (2026-02-27)

### ✨ 新增功能

- **`feishu_doc_raw` 工具**：Raw Block 直写，绕过 Markdown 转换
  - `write_blocks` — 清空文档并写入 block JSON
  - `append_blocks` — 追加 blocks 到文档末尾
  - `insert_blocks` — 在指定 parent block 下插入子块
  - `batch_update` — 批量更新 block 文本内容
  - 支持全部常用 block 类型（标题、段落、列表、代码、引用、分割线、待办）
  - 支持富文本样式（加粗、斜体、链接、行内代码等）
  - 400/401/403 错误码映射为清晰提示

- **`feishu_wiki` delete action**：Wiki 节点删除
  - 两步法实现：① getNode 获取 obj_token → ② drive API 删除底层文件
  - 文件进入回收站，30 天内可恢复
  - 清晰的权限和错误提示

### 🔧 配置增强

- `tools-config.ts` 新增 `docRaw` 开关（默认开启）
- `FeishuToolsConfig` 类型新增 `docRaw?: boolean`

### 🧹 清理

- 移除遗留的 `.rej` 补丁残留文件

### 📝 兼容性

- 100% 向后兼容原版插件
- 所有原有工具行为完全不变

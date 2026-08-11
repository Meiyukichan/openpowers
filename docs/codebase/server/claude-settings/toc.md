# Claude Settings 配置管理

> 负责 `~/.claude/settings.json` 的完整生命周期管理，包括文件读写、备份恢复、环境变量配置生成。该子模块是 Furina 服务端与 Claude CLI 之间的配置桥梁：通过读写 Claude 的 settings.json 中的 `env` 字段，实现代理模式（所有请求经本地代理转发）和直连模式（直接连接第三方 Provider API）之间的无缝切换。所有文件操作封装为独立、可测试的纯函数，避免业务逻辑层直接操作文件系统。

## Spec Relationship Diagram

```
┌──────────────────────────────┐
│ spec-settings-file           │
│ 文件读写、备份恢复、          │
│ 常量与类型定义                │
│ (read/write/backup/restore)  │
└──────────────┬───────────────┘
               │
               │ readClaudeSettings()
               │ writeClaudeSettings()
               │
               ▼
┌──────────────────────────────┐
│ spec-env-generation          │
│ 环境变量配置生成与写入        │
│ (getProxyEnv/getProviderEnv/ │
│  writeEnvToClaudeSettings)   │
└──────────────────────────────┘
               │
               │ getProxyEnv()
               │ getProviderEnv()
               │ writeEnvToClaudeSettings()
               ▼
        ┌──────────────┐
        │  外部调用方   │
        │ CLI 命令层    │
        │ API 路由层    │
        └──────────────┘
```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-settings-file.md](./spec-settings-file.md) | `~/.claude/settings.json` 文件的底层读写操作与备份恢复机制。涵盖 7 个导出函数：`readClaudeSettings` 以防御性编程读取并解析 JSON（文件不存在或格式错误时返回空对象），`writeClaudeSettings` 以 2 空格缩进格式写入（自动创建目录），`backupClaudeSettings` 将原始配置复制到 `~/.furina/settings.bak.json`，`restoreClaudeSettings` 从备份恢复配置并返回成功标志。同时定义了 `EnvObject` / `ProviderEnvInput` 类型、`TELEMETRY_SUPPRESSION` / `PROXY_BASE_URL` / `PROXY_AUTH_TOKEN` 等内部常量。该 spec 是子模块的基础层，为环境变量生成 spec 提供文件 I/O 依赖。 | `src/server/claude-settings.ts` : 1-182 |
| [spec-env-generation.md](./spec-env-generation.md) | 环境变量配置的生成与写入功能。根据当前运行模式（代理模式 / 直连模式）生成正确的 ANTHROPIC_* 环境变量配置对象并写入 settings.json。`getProxyEnv` 生成固定代理配置（localhost:3939 + sk-1234 + 遥测抑制标志），`getProviderEnv` 将 Provider 的连接信息和模型配置映射为 Claude CLI 识别的环境变量（含空值回退），`writeEnvToClaudeSettings` 作为生成函数与文件系统之间的桥梁，通过"读取-修改-写回"模式仅替换 `env` 字段并保留其他顶层键。被 CLI 命令层（enable/disable）和 API 路由层（providers.ts）调用，实现代理与直连模式的动态切换。 | `src/server/claude-settings.ts` : 14-51, 129-182 |

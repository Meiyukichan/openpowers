# Providers Store

> Providers Store 是 Furina 服务端的 JSON 文件持久化存储层，负责管理所有 LLM Provider 配置数据。采用 `~/.furina/providers.json` 文件作为单一数据源，通过 Zod schema 实现运行时类型校验和向后兼容，默认值填充确保旧版数据平滑升级。模块覆盖 Provider 的完整 CRUD 操作、活跃 Provider 选择与级联清除规则、代理开关/Claude 设置备份守卫/语言偏好等全局设置标志的读写，以及基于模型名称的 Provider 反查等查询操作。所有读写遵循同步 read-modify-write 模式，保证数据一致性。

## Spec Relationship Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  spec-store-schemas                      │
│  Zod schemas (Provider/StoreData/Input/Update)           │
│  File I/O (readStoreData/writeStoreData/ensureFile)      │
│  Types, DEFAULT_STORE_DATA, constants                    │
└────────────────────┬────────────────────────────────────┘
                     │ 所有上层操作均依赖此基础层
          ┌──────────┼──────────┬──────────────┐
          │          │          │              │
          ▼          ▼          ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ spec-provider│ │spec-active-  │ │spec-store-   │ │spec-provider-    │
│ -crud        │ │provider      │ │settings      │ │query             │
│              │ │              │ │              │ │                  │
│ CRUD 操作    │ │活跃 Provider │ │代理开关      │ │默认 Provider     │
│ 级联清除逻辑 │ │选择/清除     │ │备份守卫      │ │解析与模型反查    │
└──────┬───────┘ └──────┬───────┘ │语言偏好      │ │                  │
       │                │         └──────────────┘ └──────────────────┘
       │                │
       └───── 级联 ─────┘
       (updateProvider/deleteProvider
        自动清除 activeProviderId)
```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-store-schemas.md](./spec-store-schemas.md) | 定义整个 providers-store 的数据模型和文件 I/O 基础层。包含四个 Zod schema：`ProviderSchema`（单个 Provider 完整结构，含模型字段默认值填充）、`StoreDataSchema`（存储文件顶层结构，含全局配置标志的 nullable+default 向后兼容模式）、`ProviderInputSchema`（创建时输入校验，模型字段和 apiKey 必填）、`ProviderUpdateSchema`（更新时部分更新语义，所有字段可选，不含 usedTemplate）。三个底层文件操作函数：`readStoreData()` 实现三层容错（文件缺失/JSON 解析失败/Zod 校验失败均返回安全默认数据）、`writeStoreData()` 自动创建目录并格式化写入、`ensureProvidersFile()` 幂等初始化入口。此 spec 是所有其他 spec 的基础依赖。 | `src/server/providers-store.ts:1-167` |
| [spec-provider-crud.md](./spec-provider-crud.md) | 覆盖 Provider 的完整增删改查操作，包括 `loadProviders()`（加载全部列表）、`saveProviders()`（批量替换保留其他字段）、`getProviderById()`（按 UUID 精确查询）、`createProvider()`（自动生成 UUID 和时间戳，名称唯一性校验，重复抛 Error）、`updateProvider()`（spread merge 部分更新，自动追加 updatedAt，禁用活跃 Provider 时级联清除 activeProviderId）、`deleteProvider()`（splice 删除，删除活跃 Provider 时级联清除，不存在返回 false 而非抛异常）。所有写操作遵循 read-modify-write 模式，级联逻辑在此 spec 中实现但影响 spec-active-provider 的状态。 | `src/server/providers-store.ts:167-292` |
| [spec-active-provider.md](./spec-active-provider.md) | 管理"当前使用哪个 LLM Provider"的核心状态。提供四个导出函数：`getActiveProviderId()`（轻量级 ID 读取）、`getActiveProvider()`（完整对象读取，额外做 enabled 检查——禁用的 Provider 视为不存在）、`setActiveProviderId()`（写入前校验 Provider 存在性和启用状态，不满足抛 Error）、`clearActiveProviderId()`（置 null，幂等操作）。级联清除逻辑（禁用或删除活跃 Provider 时自动置 null）实际由 spec-provider-crud 中的 updateProvider/deleteProvider 实现，本 spec 记录了级联规则的完整语义和使用模式。 | `src/server/providers-store.ts:293-347` |
| [spec-store-settings.md](./spec-store-settings.md) | 管理三个与 Provider 无直接关联的全局配置标志，复用同一套 readStoreData/writeStoreData 基础设施。`enableFurinaProxy`（代理开关，getter 默认 false，控制 Anthropic API 代理是否拦截转发）、`neverClaudeSettings`（Claude 设置备份守卫，getter 默认 true，作为一次性备份守卫：首次写入 ~/.claude/settings.json 前先备份原文件，完成后置 false 阻止重复备份）、`language`（UI 语言偏好，enum 限制 'chinese'/'english'，getter 默认 'chinese'）。每个标志遵循 getter/setter 成对设计，getter 使用 `??` 处理空值。 | `src/server/providers-store.ts:349-416` |
| [spec-provider-query.md](./spec-provider-query.md) | 提供两个只读查询函数用于 Provider 解析。`getDefaultProvider()` 实现两级回退策略：优先使用 activeProviderId 指向的 Provider（需 enabled），不可用时回退到第一个启用的 Provider，全部不可用返回 null。`getProviderByModels()` 接受模型名称数组，通过三层嵌套循环（模型列表 -> 启用 Provider -> 四个模型字段 defaultModel/sonnetModel/opusModel/haikuModel）进行精确匹配反查，返回模型名称到 Provider 的映射，未匹配的映射为 null，多 Provider 配置同模型时采用先到先得策略。两个函数均使用 `enabled !== false` 过滤以兼容旧数据（undefined 视为启用）。 | `src/server/providers-store.ts:418-467` |

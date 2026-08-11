# 配置子系统 (Config)

> 基于 Zod 的配置子系统，作为跨进程数据结构的单一真相源。涵盖 Furina 全量配置的 schema 定义（provider 分配、项目、探索、实验、增强），分层配置的深合并策略，带弹性 Zod 校验的配置加载（优雅摘除无效叶子），dot-path 查询访问，以及用户/默认配置文件的读写操作。

## Spec 关系图

```
┌──────────────────────────────────┐
│       config-schemas             │
│ Zod schema 定义, FurinaConfig │
│ 类型推导, DeepPartial 工具类型    │
└──────────────┬───────────────────┘
               │ safeParse 校验; 类型约束
               ▼
┌──────────────────────────────────┐
│       config-loader              │
│ loadConfig: 读取+合并+Zod校验    │
│ deleteByPath: 摘除无效叶子       │
└──────┬───────────────┬───────────┘
       │               │
       │ deepMerge 调用 │ queryConfig 读取
       ▼               ▼
┌────────────────┐  ┌────────────────────┐
│ config-deepmerge│  │ config-query       │
│ deepMerge 合并  │  │ dot-path 安全查询  │
│ isPlainObject   │  └────────────────────┘
└───────┬────────┘
        │ isPlainObject 复用
        ▼
┌──────────────────────────────────┐
│   config-user-default-io         │
│ 用户配置读写, 默认配置写入        │
│ dot-path setter, 目录自建        │
└──────────────────────────────────┘
        │
        ▼
  src/commands/config.ts
  (config set / mode / show 命令)
```

## Spec 文档

| Spec | 描述 | 源文件 |
|------|------|--------|
| [spec-config-schemas.md](./spec-config-schemas.md) | **Zod schema 定义与类型推导**。覆盖 Furina 配置树的全部 Zod schema（`ProviderSwitchSchema`、`CodebaseSchema`、`ExplorationItemSchema`、`ProjectSchema`、`ExplorationSchema`、`ReviewSchema`、`PromptSchema`、`ExperimentalSchema`、`EnhancementRulesSchema`、`MemorySchema`、`EnhancementSchema`、`FurinaConfigSchema`），推导类型 `FurinaConfig`，以及工具类型 `DeepPartial<T>`。是整个配置子系统的类型与验证基础，被 `loadConfig` 用于 `safeParse` 校验，被 `MODE_PRESETS` 用于模式预设的类型约束。根 schema 使用 `.loose()` 允许额外字段。 | `src/utils/config.ts:14-116` |
| [spec-config-deepmerge.md](./spec-config-deepmerge.md) | **深合并引擎**。覆盖递归深合并函数 `deepMerge` 及类型守卫 `isPlainObject`，实现 Furina "默认+覆盖"双层配置的语义合并：嵌套对象逐字段递归叠加、数组追加（非替换）、类型不匹配时直接替换。原地变异设计避免深拷贝开销。`loadConfig` 内部通过两次 `deepMerge` 调用构建完整配置（先合并默认值，再叠加项目覆盖）。`isPlainObject` 同时被 `config-user-default-io` 复用。 | `src/utils/config.ts:121-150` |
| [spec-config-loader.md](./spec-config-loader.md) | **配置加载与弹性校验主入口**。覆盖 `loadConfig` 函数（读取全局默认配置 + 项目覆盖配置，经 `deepMerge` 合并后通过 Zod `safeParse` 校验）和 `deleteByPath` 内部辅助函数。校验失败时遍历错误 issue 摘除无效叶子并记录警告，始终返回可消费的配置对象（永不因配置问题崩溃）。无缓存策略保证每次读取反映最新磁盘状态。依赖 `config-schemas`（schema/类型）、`config-deepmerge`（合并引擎）和 `logger`（警告输出）。 | `src/utils/config.ts:171-236` |
| [spec-config-query.md](./spec-config-query.md) | **Dot-path 配置查询**。覆盖 `queryConfig` 函数，通过点分隔路径字符串（如 `experimental.review.furina`）从嵌套配置对象中安全提取值。遇到 null/undefined/非对象/数组等不可遍历节点时立即返回 `undefined`，永不抛出异常。是 `config show <keys...>` 命令的底层实现，也用于在 Zod 校验删除无效字段后优雅降级查询。纯读取函数，无副作用，无外部依赖。 | `src/utils/config.ts:245-258` |
| [spec-config-user-default-io.md](./spec-config-user-default-io.md) | **用户/默认配置文件读写操作**。覆盖五个函数：`getUserConfigPath`（内部路径计算）、`readUserConfig`（永不抛出的用户配置读取）、`writeUserConfig`（带目录自建的用户配置写入）、`setUserConfigValue`（用户配置 dot-path setter）、`setDefaultConfigValue`（全局默认配置 dot-path setter）。`setUserConfigValue` 封装读取-路径遍历-修改-写回的原子操作，中间节点自动创建；`readUserConfig`/`writeUserConfig` 支持批量修改场景（如 `config mode` 命令的一次性多字段写入）。被 `src/commands/config.ts` 中的 `config set`、`config mode` 等命令直接调用。 | `src/utils/config.ts:260-365` |

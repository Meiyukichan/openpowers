# Memory - 全局记忆子系统

> 全局记忆子系统负责管理 `~/.furina/memory/` 下的 `changes.json` 数据模型，覆盖 Zod schema 定义、changes.json 的读写与自动播种、change entry 生命周期管理（创建/更新/进度同步）、以及七阶段工作流的阶段合并处理。该子系统是 Furina 变更管理的核心数据层，为 CLI 命令、服务端 API 和前端组件提供统一的数据访问入口。

## Spec 关系图

```
┌───────────────────────────────┐
│       Schemas (数据模型)       │
│  Zod schema / TypeScript 类型  │
│  flattenCwdPath 路径工具函数    │
└──────────┬────────────────────┘
           │ 提供类型定义
           ▼
┌───────────────────────────────┐
│     Changes I/O (读写与播种)    │
│  readMemoryChangesJson        │
│  writeMemoryChangesJson       │
│  ensureMemoryChangesJson      │
│  seedFromProjectChangesJson   │
│  checkPathsExist / 归档检测    │
└──────┬────────────┬───────────┘
       │            │
       │            │ 提供 I/O 函数
       ▼            ▼
┌──────────────────────────────────────────────┐
│   Entry Lifecycle (变更条目生命周期管理)         │
│   createOrUpdateChange (唯一写入入口)           │
│   createOrUpdateStage (阶段合并调度器)          │
│   syncEntryProgress / syncEntryFeatures       │
│   buildArtifactsForEntry                      │
└──────────────────────┬───────────────────────┘
                       │ 委托阶段合并
                       ▼
         ┌──────────────────────────────┐
         │  Stage Handlers (阶段合并处理器) │
         │  handleExploreStage           │
         │  handleBrainstormStage        │
         │  handleProposeStage           │
         │  handlePlanStage              │
         │  handleReviewArtifactsStage   │
         │  handleCodingStage            │
         │  handleFinalizeStage          │
         │  closeIfInProgress            │
         └──────────────────────────────┘
```

## Spec 文档

| Spec | 描述 | 源文件 |
|------|------|--------|
| [spec-memory-schemas.md](./spec-memory-schemas.md) | **数据模型层**：定义全局记忆系统的全部 Zod schema 和推导类型。包含 `StageStepSchema`（单个阶段步骤）、`SubAgentDevProgressSchema`（子代理开发进度）、`FinalizeStageSchema`（收尾阶段）、`ChangeStageSchema`（完整七阶段工作流）、`ChangeEntrySchema`（单个变更条目）、`ChangesJsonSchema`（顶层数据结构），以及 `StageUpdate` 宽松输入接口（用于 CLI 部分更新，支持 `review`/`coding` 别名兼容）和 `flattenCwdPath` 路径扁平化工具函数。该 spec 是整个 memory 子系统的基础，所有其他 spec 均依赖其定义的类型。 | `src/utils/memory.ts:1-123` |
| [spec-memory-changes-io.md](./spec-memory-changes-io.md) | **Changes.json 读写与播种机制**：覆盖全局内存文件的 I/O 操作和自动恢复逻辑。核心函数包括 `readMemoryChangesJson`（只读加载，文件不存在时自动播种）、`writeMemoryChangesJson`（按 `updateAt` 降序排序后写入，自动创建目录）、`ensureMemoryChangesJson`（读取+路径存在性校验+归档检测+阶段状态归一化+特性同步，写回磁盘）、`seedFromProjectChangesJson`（从项目本地 `furina/changes.json` 的 `changes`+`archive` 双数组合并为全局内存单数组）。此外包含 `checkPathsExist`（路径校验并标记 `removed`）、`tryFindArchiveDir`（`YYYY-MM-DD-name` 格式归档目录检测）和 `normalizeStageStatuses`（已归档条目的所有阶段状态归一化为 `done`）等辅助函数。该 spec 是 entry-lifecycle 的 I/O 依赖基础。 | `src/utils/memory.ts:125-400` |
| [spec-memory-entry-lifecycle.md](./spec-memory-entry-lifecycle.md) | **变更条目生命周期管理**：记录 `createOrUpdateChange` 入口函数及其内部辅助函数的完整逻辑。`createOrUpdateChange` 是所有 change 写入操作的唯一入口，负责：按 `changeName` 查找或创建 `ChangeEntry`、更新元数据（`description`/`updateAt`）、通过 `createOrUpdateStage` 委托阶段合并、通过 `syncEntryProgress` 从文件系统同步 `features`/`todo`/`artifacts` 进度，最终调用 `writeMemoryChangesJson` 持久化。还包含 `syncEntryFeatures`（轻量版进度同步，仅更新计数，用于高频读取场景）和 `buildArtifactsForEntry`（扫描 6 种已知产物文件：proposal.md、design.md、specs/、api.yaml、database.md、plan.json）。被 `commands/change/new.ts` 和 `commands/change/stage.ts` 广泛调用。 | `src/utils/memory.ts:402-895` |
| [spec-memory-stage-handlers.md](./spec-memory-stage-handlers.md) | **七阶段工作流合并处理器**：实现 explore/brainstorm/propose/plan/reviewArtifacts/subAgentDev/finalize 七个阶段的专用合并 handler。每个 handler 实现专属的字段优先级规则（`title`/`from`/`inputPath` 已存在值优先，`to`/`status`/`outputPath` 新值覆盖）和前置阶段自动关闭机制（通过 `closeIfInProgress`）。`handleExploreStage` 的 done 路径采用选择性更新（仅更新 outputPath/to/status）；`handleCodingStage` 最复杂，支持 featureId + title 双重匹配合并；`handleFinalizeStage` 支持 integration 数组的 title 匹配合并及 integration->codecheck->archive 的级联自动关闭。`createOrUpdateStage` 是唯一的对外导出函数，按固定工作流顺序分发到各 handler，支持 `review`/`coding` 别名映射。 | `src/utils/memory.ts:470-843` |

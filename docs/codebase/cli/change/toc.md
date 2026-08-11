# Change 子命令模块

> Change 子模块管理完整的变更制品生命周期。一个"change"是一个命名工作单元，存储在 `furina/changes/<name>/` 下，包含顺序制品（proposal.md、design.md、specs/、plan.json、api.yaml、database.md）。该子模块负责 change 的创建、列表、状态跟踪（顺序制品流水线逻辑）、归档（制品完成度校验）、JSON 模板指令生成、plan.json 中的 feature 生命周期管理（DFS 循环检测、依赖解析、start/complete/status/next），以及根据 change 状态和 feature 进度将阶段更新智能路由到不同内存位置的阶段进度分发。

## Spec 关系图

```
┌─────────────────────────────┐
│        Barrel (index.ts)    │
│  命令注册入口, 注册7个子命令   │
└──┬──┬──┬──┬──┬──┬──┬────────┘
   │  │  │  │  │  │  │
   │  │  │  │  │  │  └──►┌───────────────┐
   │  │  │  │  │  │      │ Stage (stage) │
   │  │  │  │  │  │      │ 智能阶段路由   │
   │  │  │  │  │  │      └───┬───────────┘
   │  │  │  │  │  │          │ memory/session
   │  │  │  │  │  │          ▼
   │  │  │  │  │  └──►┌──────────────┐
   │  │  │  │  │      │ Feature      │
   │  │  │  │  │      │ 特性生命周期  │
   │  │  │  │  │      └──┬───────────┘
   │  │  │  │  │         │
   │  │  │  │  └──►┌─────┴──────────┐
   │  │  │  │      │ Instruction    │
   │  │  │  │      │ 制品指令生成    │
   │  │  │  │      └────────────────┘
   │  │  │  └──►┌──────────────────────┐
   │  │  │      │ Archive              │
   │  │  │      │ 变更归档与生命周期关闭 │
   │  │  │      └──────┬───────────────┘
   │  │  │             │
   │  │  └──►┌─────────┴────────────────┐
   │  │      │ List & Status            │
   │  │      │ 列表展示 / 制品状态计算    │
   │  │      └──────────────────────────┘
   │  └──►┌─────────────────────────────┐
   │      │ New                          │
   │      │ 创建变更(目录+注册表+内存)    │
   │      └─────────────────────────────┘
   └──►┌─────────────────────────────────┐
       │ Shared (shared.ts)              │
       │ 路径常量 / 校验 / JSON同步 / 工具 │
       └─────────────────────────────────┘

  调用关系说明:
  - Barrel 调用所有其他 spec 的入口函数
  - Archive 依赖 List&Status 的 computeArtifactStatus()
  - New / List&Status / Archive / Instruction / Feature 依赖 Shared
  - Stage 独立依赖 memory.ts 和 session.ts
  - Feature 独立依赖 sync-design.ts
```

## Spec 文档

| Spec | 描述 | 源文件 |
|------|------|--------|
| [spec-change-shared.md](./spec-change-shared.md) | **基础设施层**：为所有 change 命令提供共用的路径常量（CHANGES_DIR、ARCHIVE_DIR、CHANGES_JSON_PATH）、kebab-case 命名校验（`validateChangeName`）、changes.json 的加载/创建与双向同步（`syncChangesJson` 扫描文件系统与 JSON 注册表的一致性）、工件存在性扫描（`buildArtifacts`）、plan.json 进度计算（`computeProgress`）、相对路径转换和相对时间格式化。被所有其他 change spec 依赖，是整个子模块的数据协调核心。 | `src/commands/change/shared.ts` |
| [spec-change-barrel.md](./spec-change-barrel.md) | **命令注册入口**：barrel pattern 集中管理，在 Commander.js 上注册 `change` 父命令及 7 个子命令（list、new、status、archive、instruction、feature、stage）。不包含业务逻辑，仅定义命令结构（参数、选项）并委托给对应的 `run*` 函数。feature 子命令内含互斥选项的 if-else if 分发逻辑。 | `src/commands/change/index.ts` |
| [spec-change-new.md](./spec-change-new.md) | **变更创建**：处理 `change new` 命令的完整生命周期——校验 kebab-case 名称、创建 `furina/changes/<name>/` 目录、在项目级 changes.json 注册条目、同步到全局 memory changes.json。支持幂等操作：重复创建同名 change 时更新 description 和 updateAt 而非报错。覆盖 `runChangeNew` 入口函数及对 `createOrUpdateChange` 的调用。 | `src/commands/change/new.ts` |
| [spec-change-list-status.md](./spec-change-list-status.md) | **列表与状态查询**：覆盖两个互补命令。`change list` 展示所有活跃变更的格式化表格（名称、进度比、描述、相对时间），同步全局 memory。`change status` 查询单个变更的顺序制品流水线状态（proposal -> design -> specs 的 ready/done/blocked 状态机），评估 plan.json 完成度，输出 JSON 含 `isArtsComplete` 标志。核心函数 `computeArtifactStatus` 也被 archive 命令复用。 | `src/commands/change/list.ts`, `src/commands/change/status.ts` |
| [spec-change-archive.md](./spec-change-archive.md) | **变更归档**：change 生命周期的终结机制。验证变更存在且活跃、所有制品（通过 `computeArtifactStatus` 判断）均为 done 状态后，原子性地将目录从 `furina/changes/<name>/` 移动到 `furina/archive/YYYY-MM-DD-<name>/`，更新项目级 changes.json（从 changes 数组移除、追加到 archive 数组含 closedAt 时间戳），并同步全局 memory 将状态标记为 archived。全局 memory 同步失败不阻塞项目级归档。 | `src/commands/change/archive.ts` |
| [spec-change-instruction.md](./spec-change-instruction.md) | **制品指令生成**：实现 `change instruction` 命令，根据 JSON 模板文件（`resources/<artifactId>-template.json`）生成制品创建指令。读取模板、全局替换 `[change-name]` 占位符、检查依赖文件是否存在（design 检查 proposal.md，specs 检查 proposal.md 和 design.md），输出完整 JSON 指令到 stdout。供工作流 agent 在生成 proposal/design/specs 前调用，获取标准化的生成指令和模板内容。 | `src/commands/change/instruction.ts` |
| [spec-change-feature.md](./spec-change-feature.md) | **Feature 生命周期管理**：管理 plan.json 中 feature 条目的状态流转（pending -> in_progress -> done）。提供四个子命令：`--status` 展示进度摘要（含 blocked 计数和 syncDesignToMemory 副作用）、`--next` 获取下一个可执行 feature（含 DFS 循环依赖检测）、`--start` 将 pending feature 流转为 in_progress（校验依赖满足）、`--complete` 将 in_progress 流转为 done。包含完整的依赖解析、DAG 拓扑调度和幂等性保护。 | `src/commands/change/feature.ts` |
| [spec-change-stage.md](./spec-change-stage.md) | **智能阶段进度路由**：实现 `change stage` 命令的核心路由系统。根据 change 状态（是否已结束、plan.json 是否存在、feature 完成情况）将同一 CLI 调用路由到内存中不同存储位置。explore 在 plan.json 存在时自动转发到 coding 流程；coding 在所有 feature done 时路由到 finalize.integration[]，否则路由到 subAgentDev[]；review 根据 feature 状态路由到 reviewArtifacts 或 subAgentDev[]。包含非空覆盖合并策略、change 结束保护（仅允许后期阶段）和会话读取。覆盖10个阶段的路由逻辑。 | `src/commands/change/stage.ts` |

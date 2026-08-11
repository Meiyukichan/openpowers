# 项目视图与变更导航子系统

> 完整的项目/变更导航与详情检视子系统。涵盖侧边栏导航（双标签页：活跃变更与按项目分组的全部变更）和详情视图（阶段进度轴与阶段摘要）。包括变更浏览（搜索与缓存）、变更选择与阶段检视、以及 7 阶段工作流进度可视化。

## Spec 关系图

```
┌─────────────────────────────────────┐
│          ProjectSidebar             │
│  双标签页切换 · 搜索 · API缓存 ·    │
│  数据获取 · 错误/加载/空状态管理     │
└──────┬──────────────┬───────────────┘
       │              │
       ▼              ▼
┌──────────────┐ ┌───────────────────┐
│ ProjectGroup │ │   ChangeCard      │
│ 按cwd折叠分组│ │ 单条变更卡片渲染   │
│ localStorage │ │ 状态图标·选中高亮  │
│ 排序·统计    │ └───────────────────┘
└──────┬───────┘         ▲
       │                 │
       └─────────────────┘
       (ProjectGroup 内渲染 ChangeCard)

┌─────────────────────────────────────┐
│           DetailPanel               │
│  空态引导 · 变更头部信息 ·           │
│  selectedStageKey 状态桥接          │
└──────┬──────────────┬───────────────┘
       │              │
       ▼              ▼
┌──────────────────────┐  ┌─────────────────────┐
│  StageProgressAxis   │──│    StageSummary      │
│  7阶段水平进度轴     │  │  阶段详情条件渲染    │
│  视口窗口·平滑滑动   │  │  finalize/subAgent  │
│  状态着色·焦点导航   │  │  通用阶段分支       │
│  STAGE_CONFIG 导出   │  │  引用 STAGE_CONFIG  │
└──────────────────────┘  └─────────────────────┘
```

## Spec 文档

| Spec | 描述 | 源文件 |
|------|------|--------|
| [spec-project-sidebar.md](./spec-project-sidebar.md) | 侧边栏主容器组件，管理双标签页切换（Active 活跃变更 / Projects 按项目分组）、搜索框与关键词过滤、基于 fetch 的数据获取与 300ms 防抖机制、标签页独立缓存策略（TabCache）、loading/empty/error 三种状态渲染、标签页选择 localStorage 持久化。是整个子系统的数据入口和变更列表入口，协调 ChangeCard 和 ProjectGroup 两个渲染组件。 | `src/client/components/ProjectSidebar.tsx` |
| [spec-project-group.md](./spec-project-group.md) | 可折叠的项目分组容器，按 cwd（工作目录）聚合变更条目。Header 区域显示项目图标、名称、路径和 active/archived 数量徽章，Body 区域在展开时渲染按更新时间降序排列的 ChangeCard 列表。折叠状态通过 localStorage（键 `furina:expandedGroups`）跨会话持久化，采用"每次读取最新集合"策略保证多实例写入安全。 | `src/client/components/ProjectGroup.tsx` |
| [spec-change-card.md](./spec-change-card.md) | 纯展示型变更卡片组件，渲染单条变更记录的状态图标（Zap/Archive）、名称、描述和 cwd 路径标签。实现三态边框颜色状态机：选中蓝色 > 悬停状态对应色（active 绿色 / archived 琥珀色）> 默认灰色。被 ProjectSidebar 的 Active 标签页直接渲染、ProjectGroup 分组列表间接渲染，通过 `cwd::path` 组合键唯一标识。 | `src/client/components/ChangeCard.tsx` |
| [spec-detail-panel.md](./spec-detail-panel.md) | 详情视图主容器组件，充当 StageProgressAxis 与 StageSummary 之间的状态桥接。内部维护 `selectedStageKey` 状态：当用户点击进度轴节点时更新此状态，StageSummary 随即渲染对应阶段详情。处理两种渲染状态：无选中变更时展示引导提示（Sparkles 图标），有选中变更时展示变更头部信息 + 进度轴 + 阶段摘要。通过 React key 机制在变更切换时自动重置阶段选择状态。 | `src/client/components/DetailPanel.tsx` |
| [spec-stage-progress-axis.md](./spec-stage-progress-axis.md) | 7 阶段水平可滚动进度轴组件（Explore / Brainstorm / Propose / Plan / Review / Develop / Finalize）。采用视口窗口设计（仅展示 3 个节点宽度），通过 CSS transform 平移实现居中聚焦与平滑滑动动画。支持受控/受派生/内部三种焦点模式，实现阶段状态着色（done 绿色 / in_progress 蓝色脉冲+光环 / skipped 灰色）。导出 STAGE_CONFIG 常量供 StageSummary 复用。包含 getStageStep 辅助函数，将复合阶段（subAgentDev、finalize）的子数据聚合为统一 StageStep。 | `src/client/components/StageProgressAxis.tsx` |
| [spec-stage-summary.md](./spec-stage-summary.md) | 阶段详情展示组件，根据 selectedStageKey 条件渲染三种分支：通用阶段（explore/brainstorm/propose/plan/reviewArtifacts）渲染单条 StageStepRow；Finalize 阶段渲染三段子阶段列表（integration 数组 + codecheck + archive）；subAgentDev 阶段按 featureId 分组渲染嵌套进度列表。包含 StatusBadge 子组件（in_progress 蓝色 / done 翠绿色 / skipped 灰色）和 getStageData 辅助函数，所有用户可见文案通过 react-i18next 国际化。 | `src/client/components/StageSummary.tsx` |

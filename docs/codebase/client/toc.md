# Client (React SPA 前端)

> Furina Web UI 的 React 单页应用前端模块。采用 VSCode 风格布局架构，通过 ActivityBar 提供 Providers（供应商管理）与 Projects（项目导航）双视图切换。涵盖供应商全生命周期管理（CRUD 对话框、预设模板、API Key 验证）、项目/变更浏览（双标签侧边栏、搜索缓存、按项目分组）、7 阶段工作流进度可视化（水平可滚动进度轴、阶段摘要详情）、中英文 i18n 双语言支持与运行时切换、以及 AI 服务提供商品牌图标体系。

## Module Relationship Diagram

```
┌───────────────────────────────────────────────────────────┐
│                     spec-app-root                         │
│  应用入口 bootstrap · App 根组件                           │
│  顶层状态编排 · Provider REST API 操作                      │
│  refreshTrigger 同步 · activeView 持久化                   │
└────────┬─────────────────┬──────────────────┬─────────────┘
         │                 │                  │
         ▼                 ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────────────┐
│  spec-layout    │ │spec-i18n    │ │ spec-client-utils-   │
│  Layout 外壳    │ │ i18next 初始化│ │ and-mocks            │
│  ActivityBar    │ │LanguageSwitch│ │ logger · SVG mock    │
│  Header 区域    │ │er · 双语资源  │ │ test-setup           │
│  代理开关/重置   │ └─────────────┘ └──────────────────────┘
└────────┬────────┘
         │ 渲染 sidebar + children
         ▼
┌──────────────────────────────┐  ┌──────────────────────────┐
│  project-views (submodule)   │  │  provider-management     │
│  侧边栏导航 · 变更卡片       │  │  (submodule)             │
│  项目分组 · 详情面板         │  │  Provider CRUD 对话框    │
│  7阶段进度轴 · 阶段摘要      │  │  卡片展示 · 预设模板     │
└──────────────────────────────┘  └──────────────────────────┘

共享基础设施：
┌───────────────────────────────────────────────────────────┐
│  spec-icons: 9个SVG品牌图标 · ICON_MAP 映射               │
│  被 provider-management 和 spec-layout 共同消费            │
└───────────────────────────────────────────────────────────┘
```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [project-views/](./project-views/) | 项目视图与变更导航子系统。涵盖侧边栏导航（ProjectSidebar 双标签页：活跃变更 / 按项目分组的全部变更，含搜索、300ms 防抖、TabCache 缓存）、可折叠项目分组（ProjectGroup 按 cwd 聚合、localStorage 折叠持久化）、变更卡片（ChangeCard 三态边框状态机）、详情面板（DetailPanel 作为 StageProgressAxis 与 StageSummary 之间的状态桥接）、7 阶段水平进度轴（视口窗口设计、平滑滑动、状态着色、STAGE_CONFIG 导出）、以及阶段摘要详情（通用阶段 / Finalize 三段子阶段 / subAgentDev 按 featureId 分组）。 | 6 specs | [toc.md](./project-views/toc.md) |
| [provider-management/](./provider-management/) | Provider 完整生命周期管理子系统。覆盖供应商列表（ProviderList 从 API 获取数据，管理加载/空/错误/正常四态）、单个供应商卡片（ProviderCard 品牌图标、悬停操作按钮组、活跃/禁用状态视觉）、完整 CRUD 对话框（AddProviderDialog 含预设模板选择器和 API Key 验证、EditProviderDialog 含预填表单、DeleteConfirmDialog 二次确认）、通用确认对话框（ConfirmResetDialog 复用模态框，支持 Portal 渲染和 ESC 关闭）。 | 6 specs | [toc.md](./provider-management/toc.md) |

## Direct Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-app-root.md](./spec-app-root.md) | 应用入口与根组件。覆盖 HTML 外壳加载（index.html / index.css）、异步引导流程（main.tsx bootstrap 先初始化 i18n 再挂载 React 18 并发模式渲染树）、以及 App 根组件的完整功能：管理 8 个顶层状态（对话框开闭、refreshTrigger、activeProviderId、proxy 开关、Toast、selectedChange、activeView），封装所有 Provider REST API 操作（增删改查、激活、启用/禁用、代理开关、重置），通过 refreshTrigger 计数器驱动 UI 与服务端状态同步。导出 ActivityBarView、ToastType、Provider、ChangeEntryWithCwd 等数据类型，定义 CSS 自定义属性和关键帧动画。 | `src/client/main.tsx`, `src/client/App.tsx`, `src/client/index.html`, `src/client/index.css` |
| [spec-layout.md](./spec-layout.md) | 应用外壳布局与活动栏。Layout 组件渲染固定顶部 Header（品牌标识、Settings 占位、Reset 按钮联动 ConfirmResetDialog、Anthropic API 代理开关 Radio 图标+toggle、会话管理占位、LanguageSwitcher、条件渲染添加 Provider 按钮）和下方内容区域（ActivityBar + sidebar 插槽 + main 区域）。ActivityBar 为 48px 宽垂直图标栏，提供 Providers（Server 图标）与 Projects（FolderKanban 图标）视图切换，活跃状态有蓝色高亮和左侧边框指示器，导出 ActivityBarView 类型。LayoutProps 定义 9 个接口属性，sidebar 和 children 由 App 根据 activeView 条件注入。 | `src/client/components/Layout.tsx`, `src/client/components/ActivityBar.tsx` |
| [spec-i18n.md](./spec-i18n.md) | 国际化子系统。基于 i18next + react-i18next 构建，提供 zh-CN / en-US 双语言支持。initI18n 从后端 API 获取语言配置初始化 i18next 实例（后端不可达时回退中文）；backendLangToLocale 和 localeToHtmlLang 实现后端语言标识与 BCP 47 locale 之间的双向映射；LanguageSwitcher 组件渲染紧凑切换按钮（'中'/'EN'），点击后立即切换 i18next 语言并异步 PUT 持久化到后端。翻译资源 130+ 个键覆盖全部 UI 区域（toast、layout、projectSidebar、providerList、providerCard、form、validate、addProvider、editProvider、deleteConfirm、progressAxis、detailPanel）。 | `src/client/i18n/index.ts`, `src/client/i18n/locales/zh-CN.json`, `src/client/i18n/locales/en-US.json`, `src/client/components/LanguageSwitcher.tsx` |
| [spec-icons.md](./spec-icons.md) | Provider 品牌图标资产体系。定义 9 个 SVG 图标文件（anthropic、deepseek、xiaomimimo、chatglm、minimax、kimi、bailian、openai、claude）的统一规范（1em 尺寸、viewBox、填充策略分类：currentColor / 硬编码品牌色 / CSS 渐变）。ICON_MAP 将 SVG 文件名映射到 Vite `?url` 导入的静态资源 URL，在 ProviderCard（20x20）和 AddProviderDialog 预设选择器（16x16）中分别使用。claude.svg 具有双重用途——既作为 Layout 头部品牌标识，也作为浏览器 favicon，但不在 ICON_MAP 中。提供 ProviderIcon 内部组件和添加新图标的完整流程说明。 | `src/client/icons/*.svg`, `src/client/components/ProviderCard.tsx` (ICON_MAP/ProviderIcon), `src/client/components/AddProviderDialog.tsx` (ICON_MAP) |
| [spec-client-utils-and-mocks.md](./spec-client-utils-and-mocks.md) | 客户端基础设施层。提供三个轻量级支撑能力：(1) 浏览器兼容日志器 logger 对象，error/warn 委托 console.error/console.warn，info/debug 为空操作，保持与服务端 Winston logger 相同接口签名；(2) SVG URL Mock 模块，在 Vitest 测试环境中替代 Vite `?url` 后缀导入，返回固定占位字符串；(3) 测试环境初始化文件，注册 jest-dom DOM 匹配器扩展和 afterEach 自动清理逻辑。logger 被所有客户端组件的 catch 块使用，svg-url-mock 通过 vitest.config.ts 的 resolve.alias 配置自动替换。 | `src/client/utils/logger.ts`, `src/client/__mocks__/svg-url-mock.ts`, `src/client/test-setup.ts` |

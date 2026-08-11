# Provider Management

> Provider 完整生命周期管理子系统。覆盖从 API 获取供应商列表（含加载/空/错误状态）、单个供应商卡片展示（品牌图标、悬停操作按钮：启用/编辑/切换禁用/删除）、完整 CRUD 对话框（新增含预设模板选择器和 API Key 验证、编辑含预填表单、删除确认）、API Key 通过后端端点验证、模板管理（获取/添加/删除预设）、以及重置为默认配置。

## Spec Relationship Diagram

```
┌─────────────────────────┐
│    ProviderList          │
│  数据获取 / 列表渲染      │
│  加载骨架屏 / 空状态       │
└───────────┬─────────────┘
            │ 渲染每个 provider
            ▼
┌─────────────────────────┐
│    ProviderCard          │
│  品牌图标 / 信息展示       │
│  悬停操作按钮组            │
└──┬──────┬───────┬───────┘
   │      │       │
   │编辑   │删除    │空状态下"添加"
   ▼      ▼       ▼
┌────────┐┌─────────┐┌──────────────────┐
│Edit    ││Delete   ││AddProvider       │
│Provider││Confirm  ││Dialog            │
│Dialog  ││Dialog   ││预设模板/API验证    │
│PUT更新  ││DELETE   ││POST创建/模板管理   │
└────────┘└─────────┘└──────────────────┘

独立组件（由 Layout 触发）：
┌─────────────────────────┐
│   ConfirmResetDialog     │
│  通用确认模态框            │
│  重置供应商配置确认         │
└─────────────────────────┘
```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-provider-list.md](./spec-provider-list.md) | ProviderList 列表容器组件。负责从 `/furina/api/providers` 获取供应商列表数据，管理加载/错误/空/正常四种渲染状态：加载时显示 3 个脉冲动画骨架屏，错误时显示 i18n 错误信息和重试按钮，空列表时显示引导界面和"添加第一个供应商"按钮，正常时将每个 Provider 映射为 ProviderCard。通过 `refreshTrigger` prop 接收父组件的刷新信号自动重新拉取数据。包含内部子组件 `LoadingSkeleton`、`EmptyState` 和辅助函数 `getApiUrl`。 | `src/client/components/ProviderList.tsx` |
| [spec-provider-card.md](./spec-provider-card.md) | ProviderCard 单个供应商卡片组件。以卡片形式展示品牌图标（通过 ICON_MAP 映射 SVG 文件名到 Vite 资源 URL）、供应商名称、备注和网站链接。通过 `group` CSS 类实现悬停时操作按钮组渐显效果，提供四个操作入口：设为活跃（Play/Check 图标切换）、编辑（触发 EditProviderDialog）、启用/禁用切换（Power/PowerOff）、删除（触发 DeleteConfirmDialog）。活跃状态显示蓝色渐变背景，禁用状态显示半透明灰度。对"设为活跃"和"切换启用"两个异步操作使用本地 pending 状态防重复点击。自身不发起网络请求，纯展示加事件转发。 | `src/client/components/ProviderCard.tsx` |
| [spec-add-provider-dialog.md](./spec-add-provider-dialog.md) | AddProviderDialog 新增供应商对话框组件。提供完整的 Provider 创建流程：顶部预设模板选择网格（自定义配置 + 从 API 获取的内置/自定义模板），中间表单区域（名称、备注、网站、API Key 含可见性切换、Base URL、4 个模型字段），底部操作栏（取消、添加为模板、提交添加）。支持通过 POST `/providers/validate` 验证 API Key 有效性并展示可用模型数，通过 POST/DELETE `/providers/templates` 管理自定义模板（保存当前配置为模板、删除已有模板）。客户端验证 6 个必填字段，表单打开时自动重置所有状态。 | `src/client/components/AddProviderDialog.tsx` |
| [spec-edit-provider-dialog.md](./spec-edit-provider-dialog.md) | EditProviderDialog 编辑供应商对话框组件。用于修改现有 Provider 配置，打开时通过 useEffect 自动将 Provider 数据预填到表单中。复用了与 AddProviderDialog 相同的表单字段布局和验证逻辑（name/apiKey 必填校验、API Key 验证），但移除了预设模板选择器因为编辑场景下模板已确定。通过 PUT `/providers/:id` 提交更新，支持 baseUrl/apiKey 修改后自动重置验证结果。 | `src/client/components/EditProviderDialog.tsx` |
| [spec-delete-confirm-dialog.md](./spec-delete-confirm-dialog.md) | DeleteConfirmDialog 删除确认对话框组件。在用户请求删除 Provider 之前弹出二次确认模态框，展示警告图标和包含 Provider 名称的确认消息。确认删除后通过 DELETE `/providers/:id` 调用后端 API，成功时触发 onSuccess 回调（刷新列表 + 成功 toast），失败时显示错误 toast 并保持对话框打开供重试。确认按钮在删除进行中显示 loading 状态并禁用所有按钮防止重复提交。 | `src/client/components/DeleteConfirmDialog.tsx` |
| [spec-confirm-reset-dialog.md](./spec-confirm-reset-dialog.md) | ConfirmResetDialog 通用确认对话框组件。设计为可复用的确认模态框，通过 Props 接收标题、消息内容和按钮标签，将确认 UI 关注点从业务组件中剥离。当前主要用于 Layout 组件中的"重置供应商配置"操作，将 Provider 配置还原为 Claude 默认设置。支持 Portal 渲染、ESC 键关闭、背景遮罩点击关闭、body 滚动锁定、i18n 按钮文案回退，符合 WAI-ARIA 模态对话框规范。 | `src/client/components/ConfirmResetDialog.tsx` |

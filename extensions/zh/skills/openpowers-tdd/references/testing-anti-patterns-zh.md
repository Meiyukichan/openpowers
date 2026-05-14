# 测试反模式

**在以下情况下加载此参考：** 编写或修改测试、添加 mock、或动心要为生产代码添加仅供测试用的方法时。

## 概览

测试必须验证真实行为，而非 mock 行为。Mock 是隔离的手段，不是被测试的对象。

**核心原则：** 测试代码做什么，而非测试 mock 做什么。

**遵循严格的 TDD 可以防止这些反模式。**

## 铁律

```
1. 绝不测试 mock 行为
2. 绝不为生产类添加仅供测试用的方法
3. 绝不在不理解依赖的情况下做 mock
```

## 反模式 1：测试 Mock 行为

**违规示例：**
```typescript
// ❌ 坏：测试 mock 是否存在
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**为什么这是错的：**
- 你验证的是 mock 是否工作，而非组件是否工作
- mock 存在时测试通过，不存在时失败
- 对真实行为一无所知

**人类搭档的纠正：** "我们在测试 mock 的行为吗？"

**修复方案：**
```typescript
// ✅ 好：测试真实组件，或者不要 mock 它
test('renders sidebar', () => {
  render(<Page />);  // 不要 mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});

// 或者如果 sidebar 必须为了隔离而 mock：
// 不要对 mock 做断言 —— 测试 Page 在 sidebar 存在时的行为
```

### 把关函数

```
在对任何 mock 元素做断言之前：
  问："我是在测试真实的组件行为还是仅测试 mock 的存在？"

  如果是测试 mock 的存在：
    停止——删除该断言或取消对该组件的 mock

  改为测试真实行为
```

## 反模式 2：生产代码中的仅供测试方法

**违规示例：**
```typescript
// ❌ 坏：destroy() 仅在测试中使用
class Session {
  async destroy() {  // 看起来像一个生产 API！
    await this._workspaceManager?.destroyWorkspace(this.id);
    // ... 清理
  }
}

// 在测试中
afterEach(() => session.destroy());
```

**为什么这是错的：**
- 生产类被仅供测试的代码污染
- 如果在生产环境中意外调用会很危险
- 违反 YAGNI 和关注点分离原则
- 混淆了对象生命周期和实体生命周期

**修复方案：**
```typescript
// ✅ 好：测试工具函数处理测试清理
// Session 没有 destroy() —— 它在生产中是无状态的

// 在 test-utils/ 中
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// 在测试中
afterEach(() => cleanupSession(session));
```

### 把关函数

```
在向生产类添加任何方法之前：
  问："这个方法只被测试使用吗？"

  如果是：
    停止——不要添加它
    改为放在测试工具中

  问："这个类是否拥有此资源的生命周期？"

  如果不是：
    停止——这个方法放在了错误的类中
```

## 反模式 3：不理解就 Mock

**违规示例：**
```typescript
// ❌ 坏：Mock 破坏了测试的逻辑
test('detects duplicate server', () => {
  // Mock 阻止了测试所依赖的配置写入！
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // 应该报错——但不会！
});
```

**为什么这是错的：**
- 被 mock 的方法有测试所依赖的副作用（写入配置）
- 为了"保险"而过度的 mock 破坏了实际行为
- 测试因错误的原因通过或神秘地失败

**修复方案：**
```typescript
// ✅ 好：在正确的层级做 mock
test('detects duplicate server', () => {
  // Mock 慢的部分，保留测试需要的行为
  vi.mock('MCPServerManager'); // 只 mock 慢速的服务器启动

  await addServer(config);  // 配置已写入
  await addServer(config);  // 检测到重复 ✓
});
```

### 把关函数

```
在对任何方法做 mock 之前：
  停止——先不要 mock

  1. 问："真实方法有什么副作用？"
  2. 问："此测试是否依赖这些副作用？"
  3. 问："我是否完全理解此测试需要什么？"

  如果依赖副作用：
    在更低的层级做 mock（真正慢速/外部操作）
    或使用保留了必要行为的测试替身
    而不是测试所依赖的高层方法

  如果不确定测试依赖什么：
    先用真实实现运行测试
    观察实际上需要发生什么
    然后在正确的层级添加最小化的 mock

  红色警报：
    - "我先 mock 这个，保险起见"
    - "这个可能会慢，最好 mock 掉"
    - 不理解依赖链就做 mock
```

## 反模式 4：不完整的 Mock

**违规示例：**
```typescript
// ❌ 坏：部分 mock —— 只有你认为需要的字段
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // 缺失：下游代码使用的 metadata
};

// 之后：当代码访问 response.metadata.requestId 时就会崩溃
```

**为什么这是错的：**
- **部分 mock 隐藏了结构假设** —— 你只 mock 了你已知的字段
- **下游代码可能依赖未包含的字段** —— 静默失败
- **测试通过但集成失败** —— mock 不完整，真实 API 是完整的
- **虚假的信心** —— 测试对真实行为什么都证明不了

**铁律：** Mock 完整的、现实中存在的数据结构，而不仅仅是你的即时测试用到的字段。

**修复方案：**
```typescript
// ✅ 好：反映真实 API 的完整性
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // 真实 API 返回的所有字段
};
```

### 把关函数

```
在创建 mock 响应之前：
  检查："真实 API 响应包含哪些字段？"

  行动：
    1. 从文档/示例中检查实际的 API 响应
    2. 包含系统可能在下游消费的所有字段
    3. 验证 mock 完全匹配真实响应结构

  关键：
    如果你要创建 mock，你必须理解整个结构
    部分 mock 会在代码依赖被遗漏的字段时静默失败

  如果不确定：包含所有文档化的字段
```

## 反模式 5：集成测试作为事后想法

**违规示例：**
```
✅ 实现完成
❌ 没有编写测试
"准备测试"
```

**为什么这是错的：**
- 测试是实现的一部分，不是可选的后缀
- TDD 本应捕获这个
- 没有测试不能声称完成

**修复方案：**
```
TDD 循环：
1. 写失败的测试
2. 实现使其通过
3. 重构
4. 然后才能声称完成
```

## 当 Mock 变得过于复杂时

**警告信号：**
- Mock 准备工作比测试逻辑还长
- Mock 一切来让测试通过
- Mock 缺少真实组件拥有的方法
- Mock 变更时测试就崩溃

**人类搭档的问题：** "我们真的需要在这里用 mock 吗？"

**考虑：** 使用真实组件的集成测试通常比复杂的 mock 更简单

## TDD 如何防止这些反模式

**为什么 TDD 有帮助：**
1. **先写测试** → 强制你思考你真正在测试什么
2. **观察失败** → 确认测试验证的是真实行为，而非 mock
3. **最小化实现** → 没有仅供测试的方法混入
4. **真实依赖** → 在做 mock 之前你就看到测试真正需要什么

**如果你在测试 mock 行为，你违反了 TDD** —— 你在没有先看着测试在真实代码上失败的情况下就添加了 mock。

## 快速参考

| 反模式 | 修复方案 |
|--------------|-----|
| 对 mock 元素做断言 | 测试真实组件或取消 mock |
| 生产代码中的仅供测试方法 | 移到测试工具函数中 |
| 不理解就 mock | 先理解依赖，最小化 mock |
| 不完整的 mock | 完全反映真实 API |
| 测试作为事后想法 | TDD —— 先写测试 |
| 过度复杂的 mock | 考虑集成测试 |

## 红色警告

- 断言检查 `*-mock` 测试 ID
- 方法只在测试文件中被调用
- Mock 准备工作超过测试代码的 50%
- 移除 mock 后测试失败
- 无法解释为什么需要 mock
- "为了保险"而 mock

## 底线

**Mock 是隔离的工具，不是测试的对象。**

如果 TDD 揭示你在测试 mock 行为，你已经走错了路。

修复方案：测试真实行为，或者质疑你为什么需要 mock。


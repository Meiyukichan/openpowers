# Skill: furina-tdd (Test-Driven Development)

> Source files:
> - `marketplace/skills/furina-tdd/SKILL.md` : 1-389
> - `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 1-300

## Overview

furina-tdd 是 Furina 工作流中强制执行 **测试驱动开发（TDD）纪律** 的核心技能，被所有需要编写代码的技能（特别是 `furina-sdd` 的实现者子代理）调用。该技能定义了一套不可妥协的开发铁律、完整的 Red-Green-Refactor 循环流程、以及常见反模式的识别与规避规则。

**设计动机：** AI 代理在编写代码时面临与人类开发者相同的诱惑——跳过测试先写实现、事后补充测试、过度使用 mock。但与人类不同，AI 代理缺乏"常识"来弥补测试不足带来的盲区。TDD 技能通过建立严格的纪律约束，确保每一行生产代码都有对应的失败测试作为"证据"，从而保证代码的正确性、可验证性和可维护性。

**使用场景：**
- 当实现者子代理（`furina-sdd` 的 code-implementer）开始编写任何代码之前，必须强制调用此技能
- 当任何代理需要实现新功能、修复 Bug、重构代码或变更行为时
- 当编写或修改测试、添加 mock、或考虑向生产代码添加测试专用方法时，应参考 `testing-anti-patterns.md`

**核心原则：** 如果你没有看到测试失败，你就无法确认它测试的是正确的东西。违反字面规则就是违反精神实质。

**涉及源文件及各自职责：**

| 源文件 | 职责 |
|--------|------|
| `SKILL.md` | 技能主入口：定义 TDD 铁律（Iron Law）、Red-Green-Refactor 完整循环流程、好测试原则、常见合理化借口反驳、调试集成、卡住时的解决方案、完成验证清单 |
| `references/testing-anti-patterns.md` | 参考文档：定义 5 种测试反模式（测试 mock 行为、生产代码中的测试方法、不理解就 mock、不完整的 mock、事后补充测试），每种均包含违规示例、原因分析、修复方案和门控函数 |

## Architecture / Flow

### TDD 技能整体结构

furina-tdd 是一个纯指导性技能（不包含代码逻辑），其内容由两部分组成：

```
furina-tdd/
  SKILL.md                         -- 主指令文档（389 行）
    |- Iron Law（铁律）
    |- When to Use（适用场景）
    |- Red-Green-Refactor 循环
    |    |- RED: 编写失败测试
    |    |- Verify RED: 确认失败（强制）
    |    |- GREEN: 最小代码
    |    |- Verify GREEN: 确认通过（强制）
    |    |- REFACTOR: 清理代码
    |    |- Repeat: 下一个失败测试
    |- Good Tests（好测试原则）
    |- Why Order Matters（为什么顺序重要）
    |- Common Rationalizations（常见合理化借口）
    |- Red Flags（红线标志）
    |- Example: Bug Fix（完整示例）
    |- Verification Checklist（完成验证清单）
    |- When Stuck（卡住时的方案）
    |- Debugging Integration（调试集成）
    |- Testing Anti-Patterns（引用反模式参考）
    |- Final Rule（最终规则）
  references/
    testing-anti-patterns.md       -- 反模式参考文档（300 行）
      |- Anti-Pattern 1: 测试 mock 行为
      |- Anti-Pattern 2: 生产代码中的测试方法
      |- Anti-Pattern 3: 不理解就 mock
      |- Anti-Pattern 4: 不完整的 mock
      |- Anti-Pattern 5: 事后补充测试
      |- When Mocks Become Too Complex
      |- TDD Prevents These Anti-Patterns
      |- Quick Reference（速查表）
```

### Red-Green-Refactor 循环状态机

TDD 循环是一个带有强制验证门控的状态机：

```
[RED] 编写失败测试
  |
  v
[Verify RED] 运行测试，确认失败?
  |-- 失败原因为预期原因 --> [GREEN] 编写最小代码
  |-- 测试通过（已在测试现有行为） --> 回到 [RED] 修改测试
  |-- 测试报错（非预期失败） --> 修复错误，重新验证
  v
[GREEN] 编写最小代码使测试通过
  |
  v
[Verify GREEN] 运行测试，全部通过?
  |-- 全部通过 --> [REFACTOR] 清理代码
  |-- 有失败 --> 回到 [GREEN] 修复代码（不修改测试）
  v
[REFACTOR] 清理代码
  |
  v
[Verify GREEN] 重构后仍然全绿?
  |-- 是 --> 回到 [RED] 下一个失败测试
  |-- 否 --> 回到 [REFACTOR] 修复回归
```

**关键约束：**
- `Verify RED` 和 `Verify GREEN` 均为 **强制步骤（MANDATORY）**，不可跳过
- 每次循环只测试一个行为
- REFACTOR 阶段不可添加新行为

## Functionality / Interface Details

### 铁律（Iron Law）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 33-48

**Functionality**: 铁律是 TDD 技能的最高准则，定义了"没有失败测试就没有生产代码"这一不可违反的规则。该规则是所有 TDD 纪律的根基，任何违反都意味着必须删除已有代码、从测试重新开始。

**核心规则**:
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

**执行要求**（写在测试之前的代码必须删除）:
- 不可以保留作为"参考"
- 不可以在写测试时"适配"已有代码
- 不可以查看已有代码
- 删除就是删除

**Core Code**:
```markdown
Write code before the test? Delete it. Start over.

**No exceptions:**

- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete

Implement fresh from tests. Period.
```
Source: `marketplace/skills/furina-tdd/SKILL.md` : 39-48

---

### RED - 编写失败测试

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 74-117

**Functionality**: Red-Green-Refactor 循环的第一步，要求开发者编写一个最小的测试来描述期望行为。测试必须清晰命名、只测试一个行为、且优先使用真实代码（非 mock）。

**要求**:
- 一个行为（One behavior）
- 清晰的名称（Clear name）
- 真实代码（Real code，除非不可避免否则不用 mock）

**好测试示例**（Good）:
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
- 清晰的名称描述行为
- 测试真实代码行为，不依赖 mock
- 只测试一个行为（重试机制）

**坏测试示例**（Bad）:
```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```
- 名称含糊不清
- 测试的是 mock 行为而非代码行为
- 无法验证重试的实际逻辑

---

### Verify RED - 确认测试失败

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 118-135

**Functionality**: 在编写测试后、编写任何生产代码之前，**必须**运行测试并确认其以预期方式失败。这是 TDD 纪律中最关键的验证步骤，确保测试确实在测试缺失的功能而非已有的行为。

**验证要点**:
- 测试必须失败（fail），而非报错（error）
- 失败消息必须符合预期
- 失败原因必须是功能缺失（不是拼写错误等意外问题）

**异常情况处理**:
- **测试通过？** 说明你正在测试已有的行为。修改测试。
- **测试报错？** 修复错误，重新运行直到正确失败。

**Core Code**:
```markdown
**MANDATORY. Never skip.**

```bash
npm test path/to/test.test.ts
```

Confirm:

- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**Test passes?** You're testing existing behavior. Fix test.

**Test errors?** Fix error, re-run until it fails correctly.
```
Source: `marketplace/skills/furina-tdd/SKILL.md` : 120-135

---

### GREEN - 编写最小代码

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 136-172

**Functionality**: 确认测试失败后，编写最简单的代码使测试通过。关键约束是"最小化"——不添加额外功能、不过度工程化、不重构其他代码。只做恰好能让当前测试通过的事。

**好实现示例**（Good）:
```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```
- 刚好足够通过测试
- 没有不必要的参数或扩展

**坏实现示例**（Bad - 过度工程化）:
```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  // YAGNI
}
```
- 添加了测试未要求的参数（maxRetries, backoff, onRetry）
- 违反 YAGNI（You Ain't Gonna Need It）原则

**约束**: 不添加功能、不重构其他代码、不"改进"超出测试要求的范围。

---

### Verify GREEN - 确认测试通过

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 174-191

**Functionality**: 编写最小代码后，**必须**运行测试并确认通过。此步骤还需确认其他已有测试不受影响（无回归），且输出纯净无错误/警告。

**验证要点**:
- 当前测试必须通过
- 其他测试仍须全部通过
- 输出纯净（无错误、无警告）

**异常情况处理**:
- **测试失败？** 修复代码，而非修改测试。
- **其他测试失败？** 立即修复。

**Core Code**:
```markdown
**MANDATORY.**

```bash
npm test path/to/test.test.ts
```

Confirm:

- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

**Test fails?** Fix code, not test.

**Other tests fail?** Fix now.
```
Source: `marketplace/skills/furina-tdd/SKILL.md` : 176-191

---

### REFACTOR - 清理代码

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 192-204

**Functionality**: 在测试全绿的前提下，对代码进行清理和改进。重构阶段有严格的约束：只能改善代码结构（去除重复、改进命名、提取辅助函数），不可添加新行为，且必须保持测试全绿。

**允许的操作**:
- 去除重复代码
- 改进变量/函数命名
- 提取辅助函数/工具方法

**禁止的操作**:
- 添加新行为
- 修改测试
- 在测试变红前停止重构

---

### 好测试原则（Good Tests）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 206-213

**Functionality**: 定义了评判测试质量的三个维度，作为编写测试时的参考标准。

| 质量维度 | 好的做法 | 坏的做法 |
|----------|----------|----------|
| **最小化（Minimal）** | 一件事。名称里有"and"？拆分。 | `test('validates email and domain and whitespace')` |
| **清晰（Clear）** | 名称描述行为 | `test('test1')` |
| **展示意图（Shows intent）** | 展示期望的 API 使用方式 | 隐藏代码应该做什么 |

---

### 为什么顺序重要（Why Order Matters）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 214-266

**Functionality**: 系统性地反驳了四种常见的"测试后补"合理化论调，阐述了为什么"先测试后实现"与"先实现后测试"在本质上不同。这部分内容帮助代理理解 TDD 纪律的深层原因而非盲目遵守。

**反驳的核心论点**:

1. **"我之后写测试来验证"**: 事后测试立即通过，立即通过什么都证明不了——可能测试了错误的东西、测试了实现细节而非行为、遗漏了边界情况、从未看到它真正捕获 Bug。

2. **"我已经手动测试了所有边界情况"**: 手动测试是临时性的——没有记录、代码变更后无法重跑、压力下容易遗漏。自动化测试是系统性的，每次运行方式相同。

3. **"删除 X 小时的工作是浪费"**: 沉没成本谬误。时间已经过去，现在的选择是：删除后用 TDD 重写（X 小时更多，高置信度）；保留代码后补测试（30 分钟，低置信度，可能有 Bug）。保留无法信任的代码才是技术债务。

4. **"TDD 太教条，务实意味着适应"**: TDD 本身就是务实的——在提交前发现 Bug（比之后调试更快）、防止回归（测试立即捕获破坏）、记录行为（测试展示如何使用代码）、支持重构（自由修改，测试捕获破坏）。"务实"的捷径 = 生产环境调试 = 更慢。

5. **"事后测试达到同样目的，重精神不重仪式"**: 否。事后测试回答"这做了什么？"，事前测试回答"这应该做什么？"。事后测试被实现所偏见——你测试你构建的，而非需要的。事前测试迫使你在实现前发现边界情况，事后测试验证你是否记得所有情况（你不会）。

---

### 常见合理化借口（Common Rationalizations）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 268-283

**Functionality**: 提供一张速查表，列出 11 种常见的跳过 TDD 的借口及其对应的现实反驳，帮助代理在面对自身或用户的"合理化"时快速识别和回应。

| 借口 | 现实 |
|------|------|
| "太简单了不用测试" | 简单代码也会出错。测试只要 30 秒。 |
| "我之后再测" | 立即通过的测试什么都证明不了。 |
| "事后测试达到同样目的" | 事后 = "这做了什么？" 事前 = "这应该做什么？" |
| "已经手动测过了" | 临时性 ≠ 系统性。无记录，无法重跑。 |
| "删 X 小时太浪费" | 沉没成本谬误。保留未验证的代码是技术债务。 |
| "保留作参考，先写测试" | 你会适配它的。那就是事后测试。删除就是删除。 |
| "需要先探索" | 可以。但丢弃探索成果，从 TDD 开始。 |
| "测试难写 = 设计不清楚" | 听测试的话。难测试 = 难使用。 |
| "TDD 会拖慢我" | TDD 比调试更快。务实 = 先测试。 |
| "手动测试更快" | 手动无法证明边界情况。每次变更都要重新测。 |
| "现有代码没有测试" | 你在改进它。为已有代码补测试。 |

---

### 红线标志（Red Flags）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 284-300

**Functionality**: 定义了 13 种"停机信号"，当代理检测到自己或他人出现这些行为模式时，必须立即停止当前工作，删除代码，从 TDD 重新开始。

**红线标志列表**:
- 代码在测试之前
- 测试在实现之后
- 测试立即通过
- 无法解释测试为什么失败
- 测试是"后来"加的
- 合理化"就这一次"
- "我已经手动测试过了"
- "事后测试达到同样目的"
- "重精神不重仪式"
- "保留作参考"或"适配已有代码"
- "已经花了 X 小时，删了太浪费"
- "TDD 太教条，我在务实"
- "这次情况不同因为..."

**处理方式**: 以上所有情况均意味着：删除代码，从 TDD 重新开始。

---

### 完成验证清单（Verification Checklist）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 343-356

**Functionality**: 在标记工作完成前必须逐项检查的清单。任何一项无法勾选都意味着跳过了 TDD，必须重新开始。这是 TDD 纪律的最终质量门控。

**检查项**:
- [ ] 每个新函数/方法都有测试
- [ ] 亲眼看到每个测试在实现前失败
- [ ] 每个测试因预期原因失败（功能缺失，非拼写错误）
- [ ] 编写最小代码通过每个测试
- [ ] 所有测试通过
- [ ] 输出纯净（无错误、无警告）
- [ ] 测试使用真实代码（仅在不可避免时使用 mock）
- [ ] 边界情况和错误路径已覆盖

---

### 卡住时的方案（When Stuck）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 358-366

**Functionality**: 定义了 TDD 过程中常见的四种困境及对应的解决策略。该部分帮助代理在遇到困难时找到正确的方向而非走捷径。

| 问题 | 解决方案 |
|------|----------|
| 不知道如何测试 | 编写期望的 API。先写断言。询问人类伙伴。 |
| 测试太复杂 | 设计太复杂。简化接口。 |
| 必须 mock 一切 | 代码耦合太紧。使用依赖注入。 |
| 测试设置代码量巨大 | 提取辅助函数。仍然复杂？简化设计。 |

---

### 调试集成（Debugging Integration）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 367-371

**Functionality**: 定义了发现 Bug 时的 TDD 处理流程——先编写一个能复现 Bug 的失败测试，然后遵循 TDD 循环修复。测试既证明修复正确，又防止回归。

**规则**: 永远不要在没有测试的情况下修复 Bug。

**Core Code**:
```markdown
Bug found? Write failing test reproducing it. Follow TDD cycle.
Test proves fix and prevents regression.

Never fix bugs without a test.
```
Source: `marketplace/skills/furina-tdd/SKILL.md` : 367-371

---

### Bug 修复完整示例

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 302-341

**Functionality**: 提供一个完整的 Bug 修复场景（空邮箱被接受），演示 TDD 循环的每个步骤如何在实际场景中执行。该示例是 SKILL.md 中唯一的端到端实战演示。

**场景**: Bug: 空邮箱被接受（应返回错误）

**RED** - 编写失败测试:
```typescript
test("rejects empty email", async () => {
  const result = await submitForm({ email: "" });
  expect(result.error).toBe("Email required");
});
```

**Verify RED** - 确认失败:
```bash
$ npm test
FAIL: expected 'Email required', got undefined
```

**GREEN** - 最小实现:
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: "Email required" };
  }
  // ...
}
```

**Verify GREEN** - 确认通过:
```bash
$ npm test
PASS
```

**REFACTOR** - 如有需要，提取多字段验证逻辑。

---

### 最终规则（Final Rule）

**Source**: `marketplace/skills/furina-tdd/SKILL.md` : 381-389

**Functionality**: 技能的最终总结，将铁律浓缩为一句话。没有人类伙伴的许可，不允许任何例外。

**Core Code**:
```markdown
Production code -> test exists and failed first
Otherwise -> not TDD

No exceptions without your human partner's permission.
```
Source: `marketplace/skills/furina-tdd/SKILL.md` : 381-389

---

### 反模式 1: 测试 Mock 行为

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 21-61

**Functionality**: 识别并修复"测试 mock 存在性而非真实组件行为"的反模式。当断言检查的是 mock 元素（如 `*-mock` 测试 ID）时，实际上验证的是 mock 本身能工作，而非被测组件的行为。

**违规示例**:
```typescript
// BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```
- 断言验证的是 mock 的存在
- mock 存在则通过，不存在则失败
- 对真实行为毫无说明

**修复方案**:
```typescript
// GOOD: Test real component or don't mock it
test('renders sidebar', () => {
  render(<Page />);  // Don't mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

**门控函数**: 在对任何 mock 元素断言前，问自己"我在测试真实组件行为还是仅在测试 mock 存在性？"如果在测试 mock 存在性，停止——删除断言或取消 mock。

---

### 反模式 2: 生产代码中的测试方法

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 63-116

**Functionality**: 识别并修复"向生产类添加仅供测试使用的方法"的反模式。测试专用方法（如 `destroy()`）会污染生产代码、违反 YAGNI 和关注点分离，且在生产环境中被误调用时有危险。

**违规示例**:
```typescript
// BAD: destroy() only used in tests
class Session {
  async destroy() {
    await this._workspaceManager?.destroyWorkspace(this.id);
    // ... cleanup
  }
}
// In tests
afterEach(() => session.destroy());
```

**修复方案**:
```typescript
// GOOD: Test utilities handle test cleanup
// In test-utils/
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}
// In tests
afterEach(() => cleanupSession(session));
```

**门控函数**: 在向生产类添加任何方法前，问"这个方法是否仅被测试使用？"如果是，停止——放到测试工具中。再问"这个类是否拥有该资源的生命周期？"如果不是，放错了类。

---

### 反模式 3: 不理解就 Mock

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 118-175

**Functionality**: 识别并修复"不理解依赖关系就盲目 mock"的反模式。过度 mock（"为了安全起见"）会破坏被测代码依赖的副作用，导致测试要么通过但原因错误，要么莫名其妙地失败。

**违规示例**:
```typescript
// BAD: Mock breaks test logic
test('detects duplicate server', () => {
  // Mock prevents config write that test depends on!
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));
  await addServer(config);
  await addServer(config);  // Should throw - but won't!
});
```
- Mock 了 `ToolCatalog.discoverAndCacheTools`，但该方法有副作用（写配置）是测试依赖的
- 过度 mock 导致测试无法正确检测重复

**修复方案**:
```typescript
// GOOD: Mock at correct level
test('detects duplicate server', () => {
  vi.mock('MCPServerManager'); // Just mock slow server startup
  await addServer(config);  // Config written
  await addServer(config);  // Duplicate detected
});
```

**门控函数**: 在 mock 任何方法前，先停止。问三个问题：(1) 真实方法有什么副作用？(2) 测试是否依赖这些副作用？(3) 我是否完全理解测试的需求？如果依赖副作用，在更低层级 mock（实际的慢/外部操作）。如果不确定测试依赖什么，先用真实实现运行测试，观察实际需要什么，然后在正确层级添加最小 mock。

---

### 反模式 4: 不完整的 Mock

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 177-226

**Functionality**: 识别并修复"mock 只包含你认为需要的字段"的反模式。部分 mock 会隐藏结构性假设，当下游代码访问你未包含的字段时会静默失败，导致测试通过但集成失败的虚假自信。

**违规示例**:
```typescript
// BAD: Partial mock
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // Missing: metadata that downstream code uses
};
// Later: breaks when code accesses response.metadata.requestId
```

**修复方案**:
```typescript
// GOOD: Mirror real API completeness
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // All fields real API returns
};
```

**铁律**: Mock 必须是真实存在的完整数据结构，而非仅包含当前测试使用的字段。

**门控函数**: 创建 mock 响应前，检查"真实 API 响应包含哪些字段？"包括系统可能在下游消费的所有字段。如果不确定，包含所有已记录的字段。

---

### 反模式 5: 事后补充测试

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 228-249

**Functionality**: 识别"实现完成后再写测试"的反模式。测试是实现的一部分，不是可选的后续步骤。TDD 能够在第一时间捕获此类问题。

**违规**:
```
Implementation complete
No tests written
"Ready for testing"
```

**修复**: 严格遵循 TDD 循环——先写失败测试 -> 实现通过 -> 重构 -> 然后才能声称完成。

---

### Mock 过于复杂时的警告

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 251-261

**Functionality**: 定义 mock 复杂度的警告信号，提示代理重新考虑是否应该使用 mock。

**警告信号**:
- mock 设置比测试逻辑更长
- mock 了一切来让测试通过
- mock 缺少真实组件有的方法
- mock 改变时测试就失败

**核心建议**: 使用真实组件的集成测试通常比复杂的 mock 更简单。

---

### TDD 防止这些反模式

**Source**: `marketplace/skills/furina-tdd/references/testing-anti-patterns.md` : 263-271

**Functionality**: 阐述 TDD 如何从源头上预防上述反模式，而非事后发现并修复。

**预防机制**:
1. **先写测试** -> 迫使你思考到底在测试什么
2. **看它失败** -> 确认测试的是真实行为，不是 mock
3. **最小实现** -> 不会偷溜进测试专用方法
4. **真实依赖** -> 你在 mock 前就知道测试到底需要什么

**判断标准**: 如果你在测试 mock 行为，说明你违反了 TDD——你在没有先看测试对真实代码失败的情况下添加了 mock。

## Data Structures

### 适用场景枚举

```
Always（必须使用 TDD）:
  - New features        -- 新功能
  - Bug fixes           -- Bug 修复
  - Refactoring         -- 重构
  - Behavior changes    -- 行为变更

Exceptions（例外，需询问人类伙伴）:
  - Throwaway prototypes  -- 一次性原型
  - Generated code        -- 自动生成的代码
  - Configuration files   -- 配置文件
```

### 反模式速查表

| 反模式 | 修复方案 |
|--------|----------|
| 断言检查 mock 元素 | 测试真实组件或取消 mock |
| 生产代码中的测试方法 | 移至测试工具 |
| 不理解就 mock | 先理解依赖，最小化 mock |
| 不完整的 mock | 完整镜像真实 API |
| 事后补充测试 | TDD - 测试先行 |
| 过于复杂的 mock | 考虑集成测试 |

### 卡住时方案速查表

| 问题 | 解决方案 |
|------|----------|
| 不知道如何测试 | 写期望的 API。先写断言。询问人类伙伴。 |
| 测试太复杂 | 设计太复杂。简化接口。 |
| 必须 mock 一切 | 代码耦合太紧。使用依赖注入。 |
| 测试设置代码量巨大 | 提取辅助函数。仍然复杂？简化设计。 |

## Error Handling and Edge Cases

### 已有代码违反铁律

当代理发现自己已经先写了实现代码而未遵循 TDD 时：
- **铁律要求**：删除所有已写的生产代码，从测试重新开始
- **不允许**：保留作"参考"、适配已有代码、查看已有代码后写测试

### 测试立即通过

当编写的测试在未实现功能的情况下立即通过时：
- 说明测试在测试已有的行为，而非缺失的功能
- **处理方式**：修改测试，使其测试真正缺失的行为

### 测试报错而非失败

当测试因错误（error）而非失败（fail）退出时：
- 区别：error 是测试本身有问题（如语法错误、导入失败）；fail 是断言不通过
- **处理方式**：修复测试代码中的错误，重新运行直到测试正确失败

### Mock 复杂度过高

当 mock 设置代码量超过测试逻辑时：
- **警告信号**：mock 设置比测试逻辑长、mock 了一切、缺少真实组件方法
- **处理方式**：考虑使用真实组件的集成测试替代复杂 mock

### 测试难度过高

当不知如何编写某个行为的测试时：
- **指示**：这通常意味着设计不够清晰
- **处理方式**：先写期望的 API（面向接口设计），先写断言（从结果推导），必要时询问人类伙伴

### Bug 修复但无测试

当发现需要修复的 Bug 但没有现成测试时：
- **铁律**：永远不要在没有测试的情况下修复 Bug
- **处理方式**：先编写能复现 Bug 的失败测试，然后遵循 TDD 循环修复

## Dependencies

### Depends on（TDD 依赖的模块）

TDD 技能是一个纯指导性技能，不依赖任何代码模块或 CLI 命令。它依赖的唯一"运行时"是：
- 测试运行器（如 `npm test`、`vitest`、`jest` 等）
- 人类伙伴（human partner）的审批（用于例外情况的授权）

### Depended by（依赖 TDD 的技能/模块）

| 依赖者 | 用途 | 调用方式 |
|--------|------|----------|
| `furina-sdd` 实现者子代理 (`code-implementer.md`) | 实现者在编写任何代码前必须通过 Skill 工具调用 `furina-tdd`，加载完整的 TDD 工作流 | Skill tool 调用，强制执行 |
| `furina-sdd` 代码实现者提示模板 (`code-implementer-prompt.md`) | 通过引用 `code-implementer.md` 间接要求调用 TDD | 间接依赖 |
| `furina-sdd` 规格合规审查子代理 (`specs-reviewer.md`) | 审查时验证 TDD 纪律是否被遵守（测试是否验证行为而非实现，边界情况是否被覆盖） | 审查验证 |
| `furina-sdd` 代码质量审查子代理 (`quality-reviewer.md`) | 审查时验证 TDD 纪律（驱动实现的失败测试、测试验证行为而非 mock 交互、边界/错误路径覆盖） | 审查验证 |
| `workflow` 命令 | 工作流第 5 阶段（SDD）中通过实现者子代理间接使用 TDD | 间接依赖 |

**关键调用关系**: TDD 不直接被 workflow 或 SDD 主循环调用，而是通过实现者子代理的 `code-implementer.md` 中的"Mandatory: Use TDD Skill"章节被强制加载。

## Usage Examples

### 示例 1：完整的 Red-Green-Refactor 循环

以下演示从一个 Bug（空邮箱被接受）到修复完成的完整 TDD 循环：

```markdown
# 场景：发现 Bug - 空邮箱被接受

# Step 1: RED - 编写失败测试
test("rejects empty email", async () => {
  const result = await submitForm({ email: "" });
  expect(result.error).toBe("Email required");
});

# Step 2: Verify RED - 确认测试失败
$ npm test
FAIL: expected 'Email required', got undefined
# 失败原因：submitForm 中没有邮箱验证逻辑（功能缺失，符合预期）

# Step 3: GREEN - 编写最小代码
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: "Email required" };
  }
  // ...
}

# Step 4: Verify GREEN - 确认测试通过
$ npm test
PASS
# 所有测试通过，输出纯净

# Step 5: REFACTOR - 清理（如有需要）
# 提取通用验证逻辑供多字段使用

# Step 6: 验证清单
# [x] 每个新函数有测试
# [x] 亲眼看到测试失败
# [x] 失败原因为功能缺失
# [x] 最小代码通过
# [x] 所有测试通过
# [x] 输出纯净
# [x] 使用真实代码
# [x] 边界情况已覆盖
```

Explanation: 此示例展示了 TDD 循环在 Bug 修复场景中的完整应用。每个步骤都有明确的输入输出：RED 产生失败测试，Verify RED 确认失败原因为功能缺失，GREEN 用最少代码通过测试，Verify GREEN 确认无回归，REFACTOR 在安全网下清理代码。

### 示例 2：SDD 实现者加载 TDD 技能

以下演示 `furina-sdd` 实现者子代理如何强制加载 TDD 技能：

```markdown
# 实现者子代理的工作流程（来自 code-implementer.md）

# Step 1: 读取参考文档和规格文档（理解上下文）
[Read feature reference docs, spec docs, design docs]

# Step 2: 代码研究（理解现有模式）
[Read existing code files, understand patterns]

# Step 3: 加载 TDD（强制步骤，不可跳过）
[Use Skill tool to call: furina-tdd]
# 加载完整的 Red-Green-Refactor 循环和验证门控

# Step 4: TDD 循环编码
# 将 Feature 分解为小块，每块遵循：
#   RED -> Verify RED -> GREEN -> Verify GREEN -> REFACTOR

# Step 5-8: 验收检查 -> 提交 -> 自我审查 -> 报告
```

Explanation: 此示例展示了 TDD 技能在 SDD 架构中的定位。实现者子代理在编写任何代码之前必须先通过 Skill 工具加载 TDD 技能，获得完整的 Red-Green-Refactor 循环定义和验证门控规则。"先读 TDD 再写代码"的强制顺序确保了 TDD 纪律不会被遗忘或跳过。

### 示例 3：识别和修复反模式

以下演示如何使用 `testing-anti-patterns.md` 中的门控函数来预防常见错误：

```markdown
# 场景：实现者准备编写测试

# Step 1: 准备 mock 时触发门控
# 实现者想 mock ToolCatalog.discoverAndCacheTools

# 门控函数检查（Anti-Pattern 3）：
# Q1: 真实方法有什么副作用？
# A1: 写配置文件、缓存工具列表
# Q2: 测试是否依赖这些副作用？
# A2: 是的，后续测试依赖配置文件已被写入
# Q3: 我是否完全理解测试的需求？
# A3: 是的

# 决策：不在高层 mock，改为仅 mock 底层的慢操作（服务器启动）
vi.mock('MCPServerManager');  // Mock 慢操作，保留配置写入行为

# Step 2: 准备 mock 响应时触发门控
# 实现者想创建 API 响应的 mock

# 门控函数检查（Anti-Pattern 4）：
# 真实 API 响应包含哪些字段？
# -> 查看 API 文档，包含 status, data, metadata 三个字段
# -> 包含所有字段，而非仅当前测试需要的

# 决策：创建完整的 mock 响应
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
};
```

Explanation: 此示例展示了反模式参考文档中门控函数的实际应用。在每次准备 mock 之前，实现者通过门控函数进行自我审查，确保不落入"不理解就 mock"或"不完整 mock"的陷阱。门控函数将反模式知识转化为可执行的决策流程。

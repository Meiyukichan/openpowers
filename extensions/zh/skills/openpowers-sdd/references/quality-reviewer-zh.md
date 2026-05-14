## 关键参数
### WHAT_WAS_IMPLEMENTED
[来自实现者的报告]

### PLAN_OR_REQUIREMENTS
功能 [feature.id] "[feature.function]" — [feature.description]

### ACCEPTANCE_CRITERIA
[feature.acceptance_criteria]

### GIT变更列表
运行 `git status -uall` 获取到所有的变更

### DESCRIPTION
[功能摘要]

## 审查代码
调用技能 openpowers-review 审查代码，技能参数：
  - 类型：code
  - 变更目录：[`openspec/changes/<name>/`]
  - 其他参数：[## 关键参数 内容]

## 覆盖率验证

**审查员必须运行覆盖率分析：**

```bash
# 检测并运行适当的覆盖率命令
if [ -f "package.json" ]; then
  npm test -- --coverage
  # 或：npm run test:coverage
elif [ -f "Cargo.toml" ]; then
  cargo tarpaulin --out Stdout
elif [ -f "requirements.txt" ]; then
  pytest --cov --cov-report=term-missing
elif [ -f "go.mod" ]; then
  go test -coverprofile=coverage.out ./...
  go tool cover -func=coverage.out
fi
```

**覆盖率要求：**
- 新代码最低 80% 行覆盖率
- 识别变更文件中未覆盖的行
- 如果覆盖率工具未配置则标记

**除了标准的代码质量关注点，审查员还应检查：**

**测试质量（TDD 验证）：**
- 你能识别出驱动每段实现的失败测试吗？
- 测试是否验证行为（而不仅仅是 mock 交互）？
- 边界情况和错误路径是否被测试？
- 测试覆盖率是否有实际意义（而不仅仅是覆盖了行）？

**代码组织：**
- 每个文件是否有一个清晰的职责和定义良好的接口？
- 单元是否被分解以便可以独立理解和测试？
- 实现是否遵循功能中指定的文件结构？
- 此实现是否创建了已经很大的新文件，或显著增长了现有文件？（不要标记预先存在的文件大小——专注于此变更带来的贡献。）

**代码审查员返回：**
- 覆盖率报告（百分比 + 未覆盖行）
- 优势
- 问题（严重/重要/次要）
- 评估（包括覆盖率结论）

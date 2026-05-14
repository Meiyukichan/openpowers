## 示例工作流

```
你：我正在使用子代理驱动开发来执行此计划。

$ test -f openspec/changes/auth/plan.json && echo "存在" || echo "不存在"
存在

$ python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py /path/to/project language experimental.review.specs experimental.review.code
语言: zh
规格审查: True
代码质量审查: True

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py status openspec/changes/auth/plan.json
功能列表状态：
  总计：5
  ✅ 已完成：0
  🔄 进行中：0
  ⏳ 待处理：5
  🚫 阻塞：0

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py next openspec/changes/auth/plan.json
下一个功能：auth-001
  类别：authentication
  功能：user-login
  描述：实现邮箱/密码登录

功能 auth-001：用户登录

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py start openspec/changes/auth/plan.json auth-001

[派发参考探索器 — 调用 openpowers-explore 技能，探索 auth-001 的参考资料，输出到 openspec/changes/auth/auth-001-reference.md]

[参考探索器完成，继续下一步]

[派发实现者子代理，附带功能数据、参考文档和上下文]

实现者："开始之前——token 应该 1 小时后过期还是 24 小时后过期？"

你："1 小时，refresh token 支持放在后续功能中"

[回答后重新派发新的实现者子代理，附带功能数据、参考文档、上下文以及上述回答]

实现者："明白了。正在实现……"
[稍后] 实现者：
  - 实现了登录接口
  - 添加了测试，5/5 通过
  - 自我审查：发现遗漏了暴力破解频率限制，已补充
  - 已提交

[experimental.review.specs = True，派发规格合规审查子代理]
规格审查员：❌ 问题：
  - 缺失：登录失败时返回统一错误信息（验收标准写明"不应泄露用户是否存在"）
  - 多余：添加了登录日志记录（未要求）

[派发新的实现者子代理修复规格差距]
实现者：移除了登录日志记录，添加了统一错误信息返回

[规格审查员重新审查]
规格审查员：✅ 所有验收标准现已满足

[experimental.review.code = True，获取 git SHA，派发代码质量审查子代理]
代码审查员：优点：测试覆盖良好，代码清晰。问题：无。批准。

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py complete openspec/changes/auth/plan.json auth-001

[编辑 openspec/changes/auth/tasks.md，找到 auth-001 引用的 task，标记为 [x]]

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py next openspec/changes/auth/plan.json
下一个功能：auth-002
  类别：authentication
  功能：token-refresh
  描述：实现 token 刷新接口

功能 auth-002：Token 刷新

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py start openspec/changes/auth/plan.json auth-002

[派发参考探索器 — 调用 openpowers-explore 技能，探索 auth-002 的参考资料]

[参考探索器完成，继续下一步]

[派发实现者子代理，附带功能数据、参考文档和上下文]

实现者：[无问题，直接继续]
实现者：
  - 添加了 refresh token 接口
  - 8/8 测试通过
  - 自我审查：一切正常
  - 已提交

[experimental.review.specs = True，派发规格合规审查子代理]
规格审查员：❌ 问题：
  - 缺失：Token 轮换（验收标准写明"旧 refresh token 必须失效"）
  - 多余：添加了 token 家族追踪（未要求）

[派发新的实现者子代理修复规格差距]
实现者：移除了 token 家族追踪，添加了正确的 token 失效逻辑

[规格审查员重新审查]
规格审查员：✅ 所有验收标准现已满足

[experimental.review.code = True，派发代码质量审查子代理]
代码审查员：优点：扎实。问题（重要）：魔法数字（TTL 使用了 3600）

[派发新的实现者子代理修复质量问题]
实现者：提取为 TOKEN_TTL_SECONDS 常量

[代码审查员重新审查]
代码审查员：✅ 批准

$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py complete openspec/changes/auth/plan.json auth-002

[编辑 openspec/changes/auth/tasks.md，找到 auth-002 引用的 task，标记为 [x]]

...

[所有功能完成后]
$ python ${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/scripts/feature-manager.py status openspec/changes/auth/plan.json
功能列表状态：
  总计：5
  ✅ 已完成：5
  进度：100.0%

[调用 openpowers-finalize 技能完成开发]

完成！
```

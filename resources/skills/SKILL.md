---
name: typescript-standards-navigator
description: |
  TypeScript 代码规范导航技能。当生成、编写或修改任何 TypeScript 代码之前，必须激活此技能。
  触发场景包括：用户说"写一段 TS 代码"、"生成 TypeScript"、"帮我写个 TS 函数/类/模块"、"用 TypeScript 实现"、"创建一个 TS 文件"等，或者要编写的代码属于TypeScript项目。
  此技能确保生成的代码符合项目的 TypeScript 编码规范。
---

# Coding Standards Navigator

当你生成、编写或修改任何 TypeScript 代码之前，必须先执行以下步骤来查询代码规范。

## 第一步：识别章节并读取详情文档

根据你要编写的代码内容，查询下面的规范章节索引表，识别出相关章节，然后读取对应的详情文档【**重点注意**：如果详情文档你之前已经读取或者你还记得这些文档内容，则不必读取，直接到第二步】。

### 规范章节索引表

| 章节               | 内容                                         | 详情文档                                                                                    |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ## 1. 源文件基础   | UTF-8 编码、空白字符、转义序列               | [source-file-basics.md]({项目路径}/docs/codestyle/ts/source-file-basics.md)                 |
| ## 2. 源文件结构   | 文件顺序、导入导出、命名空间                 | [source-file-structure.md]({项目路径}/docs/codestyle/ts/source-file-structure.md)           |
| ## 3. 语言特性\*\* | 变量声明、数组、对象、类、函数、this、接口等 | [language-features.md]({项目路径}/docs/codestyle/ts/language-features.md)                   |
| ## 4. 命名规范\*\* | 标识符、camelCase、常量命名                  | [naming.md]({项目路径}/docs/codestyle/ts/naming.md)                                         |
| ## 5. 类型系统     | 类型推断、any、Array、接口vs类型             | [type-system.md]({项目路径}/docs/codestyle/ts/type-system.md)                               |
| ## 6. 工具链要求   | 编译器规则、@ts-ignore                       | [toolchain-requirements.md]({项目路径}/docs/codestyle/ts/toolchain-requirements.md)         |
| ## 7. 注释与文档   | JSDoc、注释格式                              | [comments-and-documentation.md]({项目路径}/docs/codestyle/ts/comments-and-documentation.md) |
| ## 8. 策略         | 一致性、弃用、生成代码                       | [policies.md]({项目路径}/docs/codestyle/ts/policies.md)                                     |

**重点注意**：如果详情文档你之前已经读取或者你还记得这些文档内容，则不必读取，直接到第二步。

## 第二步：应用规范生成代码

根据查询到的规范要点，并且必须严格遵守 [style.md]('{项目路径}/docs/codestyle/typescript-core-style.md') 的项目编码风格简约（如果忘记或未读取，必须重新读取）为第一优先级，梳理并生成符合规范的 TypeScript 代码。

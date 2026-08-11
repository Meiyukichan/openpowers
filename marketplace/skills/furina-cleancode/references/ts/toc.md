# TypeScript 编码规范

## 1. 简介

本规范基于 Google TypeScript 风格指南，提供了 TypeScript 代码的最佳实践和建议。所有示例仅用于说明目的，不构成唯一正确答案。

### 术语说明

本规范使用 [RFC 2119](https://tools.ietf.org/html/rfc2119) 术语：*必须（must）*、*禁止（must not）*、*应该（should）*、*不应该（should not）*、*可以（may）*。*建议（prefer）*和*避免（avoid）*分别对应*应该*和*不应该*。

### 指南说明

所有示例均为**非规范性**内容，仅用于说明风格指南的规范性语言。示例中使用 Google Style，但不一定是表示代码的唯一方式。示例中的可选格式选择不应作为规则强制执行。

## 2. 源文件基础

`源文件基础详情文档`: [source-file-basics.md](./docs/codestyle/ts/source-file-basics.md)

### 文件编码：UTF-8

源文件使用 **UTF-8** 编码。除换行符序列外，ASCII 水平空格字符 (0x20) 是源文件中唯一出现的空白字符，所有其他空白字符在字符串字面量中必须转义。

### 空白字符

除换行符序列外，ASCII 水平空格字符 (0x20) 是源文件中唯一允许的空白字符。这意味着字符串字面量中的所有其他空白字符都必须使用转义序列。

### 特殊转义序列

对于有特殊转义序列的字符（`\'`、`\"`、`\\`、`\b`、`\f`、`\n`、`\r`、`\t`、`\v`），必须使用该序列而非数字转义序列（如 `\x0a`、`\u000a` 或 `\u{a}`）。禁止使用八进制转义。

### 非 ASCII 字符

对于其余非 ASCII 字符，使用实际的 Unicode 字符（如 `∞`）。对于不可打印字符，可使用等效的十六进制或 Unicode 转义序列（如 `\u221e`），并添加说明性注释。

## 3. 源文件结构

`源文件结构详情文档`: [source-file-structure.md](./docs/codestyle/ts/source-file-structure.md)

### 文件顺序

文件由版权信息、@fileoverview JSDoc、导入和实现按顺序组成，每个部分之间用空行分隔。

### 版权信息

版权或许可信息应添加在文件顶部的 JSDoc 中。

### @fileoverview JSDoc

文件顶层的 @fileoverview JSDoc 用于描述文件内容、用途或依赖关系。

### 导入

TypeScript 支持四种导入类型：named 导入、module 导入、default 导入和 side-effect 导入。应优先使用相对导入，避免过深的父目录层级。

### 命名空间 vs 具名导入

频繁使用的符号或名称清晰的符号优先使用具名导入；使用大量 API 符号时使用命名空间导入。

### 重命名导入

通过命名空间导入或重命名导出解决名称冲突，或使用 `as` 设置别名。

### 导出

所有代码使用命名导出，禁止默认导出。命名导出提供更好的错误检查和重构支持。

### 导出可见性

只导出在模块外部使用的符号，最小化模块的导出 API 表面。

### 可变导出

禁止使用 `export let`，可变绑定应使用显式 getter 函数访问。

### 容器类

不要创建容器类作为命名空间手段，应导出单个常量和函数。

### Import and export type

`import type` 用于仅作为类型使用的导入；`export type` 用于类型重新导出。

### 使用模块而非命名空间

禁止使用 `namespace` 关键字，代码必须使用 ES6 import/export 形式组织。

## 4. 语言特性

`语言特性详情文档`: [language-features.md](./docs/codestyle/ts/language-features.md)

### 局部变量声明

变量声明应优先使用 const 和 let，避免使用 var。每行只声明一个变量。

### 数组字面量

禁止使用 Array 构造函数，应使用括号表示法。数组上不应定义非数字属性。展开语法只能用于可迭代对象，禁止展开原始类型。

### 对象字面量

禁止使用 Object 构造函数。迭代对象时应使用 Object.keys/values/entries 或 hasOwnProperty 过滤。对象展开语法只能展开对象，禁止展开数组和原始类型。

### 类

类声明禁止以分号结尾，类方法声明也禁止以分号分隔。禁止使用 #private 字段，应使用 TypeScript 可见性注解。属性应使用 readonly 修饰符。避免使用私有静态方法和动态分派。禁止在静态上下文中使用 this。构造函数必须使用括号。getter 必须是纯函数。

### 函数

优先使用函数声明而非箭头函数定义命名函数。函数表达式应使用箭头函数代替。箭头函数体应根据返回值是否使用决定使用简洁体还是块体。禁止在函数中使用 this（除非专门用于重新绑定）。优先传递箭头函数作为回调。谨慎使用默认参数。

### this

只在类构造函数和方法、显式声明 this 类型的函数或箭头函数中使用 this。

### 接口

### 原始类型字面量

字符串字面量使用单引号，禁止使用行延续。模板字面量用于复杂字符串连接。数字可使用十进制、十六进制、八进制或二进制表示。

### 类型转换

可使用 String()/Boolean()/Number() 或 !! 进行类型转换。禁止使用 parseInt/parseFloat 解析数字（radix != 10 时除外）。禁止隐式布尔强制转换。

### 控制结构

控制流语句必须使用大括号。switch 语句必须有 default 分支，且禁止 fall through。优先使用 for-of 遍历数组。空 catch 块必须包含解释注释。

### 异常处理

异常应使用 new Error() 实例化。只抛出 Error 对象及其子类。try 块应保持精简。

### 相等性检查

必须使用严格相等 === 和 !==。与 null 比较时可使用 == 和 !=。

### 类型断言

类型断言是不安全的，应优先使用运行时检查。必须使用 as 语法而非尖括号语法。

### 装饰器

禁止定义新装饰器，只使用框架提供的装饰器（如 Angular 的 @Component）。

### 禁止的特性

禁止使用原始类型包装类、const enum、debugger 语句、with 关键字、eval 和 Function 构造函数。禁止修改内置对象。禁止依赖非标准特性。

## 5. 命名规范

`命名规范详情文档`: [naming.md](./docs/codestyle/ts/naming.md)

### 标识符

标识符只使用 ASCII 字母、数字、下划线和美元符号。命名应具有描述性，不使用不熟悉的缩写。类/接口/类型/枚举等使用 UpperCamelCase，变量/函数/参数等使用 lowerCamelCase，常量使用 CONSTANT_CASE。

### 命名风格

类型信息不应出现在名称中。禁止使用下划线前缀/后缀、opt_ 前缀。不要特别标记接口。Observable 使用 $ 后缀是常见约定。

### 描述性名称

名称必须具有描述性。不使用含义模糊的缩写，不删除单词内部字母缩写。单字母变量可用于 10 行以内的局部作用域。

### Camel case

将缩写视为整词处理，如 loadHttpUrl 而非 loadHTTPURL。

### 常量

CONSTANT_CASE 表示值不应被修改。静态只读属性也是常量。全局常量才能使用 CONSTANT_CASE。

### 别名

创建现有符号的别名时，使用与源相同的大小写格式。

## 6. 类型系统

`类型系统详情文档`: [type-system.md](./docs/codestyle/ts/type-system.md)

### 类型推断

代码可依赖 TypeScript 的类型推断。简单类型如 string、number、boolean 可省略注解，但复杂表达式应添加注解以提高可读性。

### 返回类型

是否添加返回类型注解由作者决定，审查者可要求澄清复杂类型。项目可要求始终包含返回类型。

### Undefined 和 null

TypeScript 支持 undefined 和 null 表示值的缺失。类型别名禁止包含 |null 或 |undefined，应在实际使用时添加。优先使用可选参数而非 |undefined。

### 结构类型

TypeScript 使用结构化类型系统。使用接口定义结构类型，在声明处显式指定类型以获得更好的错误报告。

### 接口优于类型字面量别名

宣言对象类型时应使用接口而非类型别名。接口与类型别名几乎等价，但接口有更好的工具支持。

### Array 类型

简单类型使用 T[] 语法糖，复杂类型使用 Array<T>。多维数组也使用语法糖形式。

### 索引签名

对象作为关联数组使用时使用索引签名 { [key: string]: T }。考虑使用 Map 和 Set 代替。

### 映射和条件类型

这些类型特性功能强大但可能使代码更难理解。应始终使用最简单的类型构造。避免复杂类型表达式。

### any 类型

any 是危险类型，可能掩盖编程错误。应优先使用更具体的类型、unknown 或抑制警告并记录原因。

### 空类型 {}

空接口 {} 表示任何非空值。应优先使用 unknown、Record<string, T> 或 object。

### 元组类型

使用元组类型替代简单的 Pair 接口。

### 包装器类型

禁止使用 String、Boolean、Number 包装器类型，始终使用小写原始类型。

### 仅返回类型的泛型

避免创建仅返回类型的泛型 API。

## 7. 工具链要求

`工具链要求详情文档`: [toolchain-requirements.md](./docs/codestyle/ts/toolchain-requirements.md)

### TypeScript 编译器

所有 TypeScript 文件必须通过标准工具链的类型检查。禁止使用 @ts-ignore、@ts-expect-error 或 @ts-nocheck。测试中可使用 @ts-expect-error 但应谨慎。

### Conformance

Google TypeScript 必须遵守一致性框架规则（tsetse 和 tsec），包括关键限制和安全模式。

## 8. 注释与文档

`注释与文档详情文档`: [comments-and-documentation.md](./docs/codestyle/ts/comments-and-documentation.md)

### JSDoc 与普通注释

使用 `/** JSDoc */` 进行文档化注释，使用 `//` 进行实现注释。多行注释使用 `//` 风格而非 `/* */`。

### JSDoc 格式

JSDoc 注释必须格式良好。单行 JSDoc 可用单行格式。JSDoc 用 Markdown 编写，列表需使用 Markdown 列表语法。

### JSDoc 标签

大多数标签必须占据自己的行。@param 和 @return 仅在添加信息时需要。

### 文档化

模块的所有顶层导出必须文档化。类注释应提供足够信息了解如何使用类。方法描述以第三人称动词短语开头。

### 参数属性注释

参数属性使用 @param 注解文档化。

### JSDoc 类型注解

JSDoc 类型注解在 TypeScript 源代码中是冗余的，禁止重复声明。

### 注释要求

注释必须提供实际信息，避免仅重复类型和名称。调用函数时的参数名称注释放在参数值之前。

### 文档位置

装饰器的 JSDoc 必须放在装饰器之前。

## 9. 策略

`策略详情文档`: [policies.md](./docs/codestyle/ts/policies.md)

### 一致性

未解决的风格问题应与同一文件或目录中的现有代码保持一致。新文件必须使用 Google 风格。

### 重新格式化现有代码

不需要更改所有代码以符合当前指南，但重大更改应同时重新格式化。避免机会主义风格修复。

### 弃用

使用 @deprecated JSDoc 标记弃用的方法、类或接口，并提供清晰的修复指导。

### 生成代码

生成的源代码不需要符合 Google 风格，但被引用的标识符必须遵循命名要求。

### 风格指南目标

规则应避免已知问题、促进一致性、支持长期可维护性，且审查者应关注代码质量而非任意规则。

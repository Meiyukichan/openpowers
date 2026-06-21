# 命名规范

## 标识符

标识符**必须**只使用 ASCII 字母、数字、下划线（用于常量和结构化测试方法名称），以及（很少使用的）美元符号 `$`。

### 命名风格

TypeScript 在类型中表达信息，因此名称**不应**用包含在类型中的信息来装饰。

一些具体规则：

- 不要为私有属性或方法使用尾部下划线或前导下划线。
- 不要使用 `opt_` 前缀表示可选参数。
- 不要特别标记接口（如 `IMyInterface` 或 `MyFooInterface`），除非在特定环境中是惯用做法。
- 为类引入接口时，给它一个表达接口存在原因的名字。
- 给 `Observable` 加上 `$` 后缀是常见的外部约定，有助于解决可观察值与具体值的混淆。

### 描述性名称

名称**必须**具有描述性，对新读者清晰。不要使用读者不熟悉的缩写，不要通过删除单词中的字母来缩写。

**异常**：在范围内不超过 10 行的变量，包括不作为导出 API 一部分的参数，**可以**使用短名称（如单个字母）。

```ts good
// Good identifiers:
errorCount          // No abbreviation.
dnsConnectionIndex  // Most people know what "DNS" stands for.
referrerUrl         // Ditto for "URL".
customerId          // "Id" is both ubiquitous and unlikely to be misunderstood.
```

```ts bad
// Disallowed identifiers:
n                   // Meaningless.
nErr                // Ambiguous abbreviation.
nCompConns          // Ambiguous abbreviation.
wgcConnections      // Only your group knows what this stands for.
pcReader            // Lots of things can be abbreviated "pc".
cstmrId             // Deletes internal letters.
kSecondsPerDay      // Do not use Hungarian notation.
customerID          // Incorrect camelcase of "ID".
```

### Camel case

将名称中的缩写视为整词处理，即使用 `loadHttpUrl`，而不是 `loadHTTPURL`，除非平台名称要求（如 `XMLHttpRequest`）。

### Dollar sign

标识符通常**不应该**使用 `$`，除非第三方框架的命名约定要求。

### 规则 by identifier type

大多数标识符名称应遵循下表中的大小写：

| 风格 | 类别 |
|------|------|
| `UpperCamelCase` | class / interface / type / enum / decorator / type parameters / component functions in TSX / JSXElement type parameter |
| `lowerCamelCase` | variable / parameter / function / method / property / module alias |
| `CONSTANT_CASE` | global constant values, including enum values |
| `#ident` | 私有标识符从不使用 |

### Type parameters

类型参数（如 `Array<T>`）**可以**使用单个大写字符（`T`）或 `UpperCamelCase`。

### Test names

xUnit 风格测试框架中的测试方法名称**可以**使用 `_` 分隔符结构，如 `testX_whenY_doesZ()`。

### `_` prefix/suffix

标识符禁止使用 `_` 作为前缀或后缀。这也意味着 `_` **禁止**单独用作标识符来表示参数未使用。

提示：如果只需要数组（或 TypeScript 元组）中的某些元素，可以在解构语句中插入额外的逗号来忽略中间元素：

```ts
const [a, , b] = [1, 5, 10];  // a <- 1, b <- 10
```

### Imports

模块命名空间导入使用 `lowerCamelCase`，而文件使用 `snake_case`，因此导入的 casing 不会匹配：

```ts good
import * as fooBar from './foo_bar';
```

一些库可能通常使用违反此命名方案的命名空间导入前缀，但极为常见的开源使用使违规风格更具可读性。目前属于此异常的唯一库是：

- jquery，使用 `$` 前缀
- threejs，使用 `THREE` 前缀

### Constants

**不可变**：`CONSTANT_CASE` 表示值是*意图*不改变的，可用于技术上可以修改的值（即不是深度冻结的值），以向用户表明它们不得被修改。

```ts good
const UNIT_SUFFIXES = {
  'milliseconds': 'ms',
  'seconds': 's',
};
// Even though per the rules of JavaScript UNIT_SUFFIXES is
// mutable, the uppercase shows users to not modify it.
```

常量也可以是类的 `static readonly` 属性。

```ts good
class Foo {
  private static readonly MY_SPECIAL_NUMBER = 5;

  bar() {
    return 2 * Foo.MY_SPECIAL_NUMBER;
  }
}
```

**全局**：只有声明在模块级别的符号、模块级别类的静态字段以及模块级别枚举的值**可以**使用 `CONST_CASE`。如果一个值可以在程序生命周期中被实例化多次（例如在函数内声明的局部变量，或嵌套在函数中的类的静态字段），则**必须**使用 `lowerCamelCase`。

如果值是实现接口的箭头函数，则**可以**声明为 `lowerCamelCase`。

### Aliases

创建现有符号的局部作用域别名时，使用现有标识符的格式。局部别名**必须**与源的大小写和格式匹配。对于变量，使用 `const` 作为局部别名；对于类字段，使用 `readonly` 属性。

```ts good
const {BrewStateEnum} = SomeType;
const CAPACITY = 5;

class Teapot {
  readonly BrewStateEnum = BrewStateEnum;
  readonly CAPACITY = CAPACITY;
}
```

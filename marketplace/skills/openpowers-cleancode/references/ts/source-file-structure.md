# 源文件结构

文件按以下顺序组成，**依次排列**：

1. 版权信息（如果有）
2. 带有 `@fileoverview` 的 JSDoc（如果有）
3. 导入语句（如果有）
4. 文件实现

**每个存在的部分之间恰好用一个空行分隔。**

## 版权信息

如果文件需要许可或版权信息，请在文件顶部的 JSDoc 中添加。

## `@fileoverview` JSDoc

文件可以有一个顶层 `@fileoverview` JSDoc。如果存在，它可以提供文件内容、用途或依赖项的描述。换行内容不缩进。

示例：

```ts good
/**
 * @fileoverview Description of file. Lorem ipsum dolor sit amet, consectetur
 * adipiscing elit, sed do eiusmod tempor incididunt.
 */
```

## 导入

ES6 和 TypeScript 中有四种导入语句变体：

| 导入类型 | 示例 | 用于 |
|---------|------|------|
| module | `import * as foo from '...';` | TypeScript 导入 |
| named | `import {SomeThing} from '...';` | TypeScript 导入 |
| default | `import SomeThing from '...';` | 仅用于需要它们的外部代码 |
| side-effect | `import '...';` | 仅用于导入具有加载副作用的库（如自定义元素） |

```ts good
// Good: choose between two options as appropriate (see below).
import * as ng from '@angular/core';
import {Foo} from './foo';

// Only when needed: default imports.
import Button from 'Button';
// 对于 Node.js 内置模块，必须使用默认导入
import fs from 'fs';

// Sometimes needed to import libraries for their side effects:
import 'jasmine';
import '@polymer/paper-button';
```

### Import paths

TypeScript 代码**必须**使用路径导入其他 TypeScript 代码。路径可以是相对路径（以 `.` 或 `..` 开头）或基于根目录的路径（例如 `root/path/to/file`）。

在引用同一（逻辑）项目中的文件时，**应该**使用相对导入（`./foo`）而非绝对导入（`path/to/foo`），这样可以移动项目而无需修改这些导入。

考虑限制父目录层级（`../../../`）的数量，因为这样会使模块和路径结构难以理解。

```ts good
import {Symbol1} from 'path/from/root';
import {Symbol2} from '../parent/file';
import {Symbol3} from './sibling';
```

### Namespace versus named imports

命名空间导入和具名导入都可以使用。

对于频繁使用的符号或名称清晰的符号（如 Jasmine 的 `describe` 和 `it`），优先使用具名导入。可根据需要使用 `as` 为具名导入设置更清晰的别名。

当使用大型 API 中的许多不同符号时，优先使用命名空间导入。命名空间导入虽然使用 `*` 字符，但与其他语言中的"通配符"导入不同。相反，命名空间导入为模块的所有导出提供一个名称，模块导出的每个符号都成为模块名称的属性。对于名称常见（如 `Model` 或 `Controller`）的导出符号，命名空间导入可以提高可读性，无需声明别名。

```ts bad
// Bad: overlong import statement of needlessly namespaced names.
import {Item as TableviewItem, Header as TableviewHeader, Row as TableviewRow,
  Model as TableviewModel, Renderer as TableviewRenderer} from './tableview';

let item: TableviewItem|undefined;
```

```ts good
// Better: use the module for namespacing.
import * as tableview from './tableview';

let item: tableview.Item|undefined;
```

```ts bad
import * as testing from './testing';

// Bad: The module name does not improve readability.
testing.describe('foo', () => {
  testing.it('bar', () => {
    testing.expect(null).toBeNull();
    testing.expect(undefined).toBeUndefined();
  });
});
```

```ts good
// Better: give local names for these common functions.
import {describe, it, expect} from './testing';

describe('foo', () => {
  it('bar', () => {
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
  });
});
```

##### Special case: Apps JSPB protos

Apps JSPB protos 必须使用具名导入，即使这会导致很长的导入行。

此规则存在是为了帮助构建性能和死代码消除，因为 `.proto` 文件通常包含许多不需要一起使用的 `message`。通过利用解构导入，构建系统可以创建更细粒度的 Apps JSPB 消息依赖，同时保留基于路径导入的 ergonomics。

```ts good
// Good: import the exact set of symbols you need from the proto file.
import {Foo, Bar} from './foo.proto';

function copyFooBar(foo: Foo, bar: Bar) {...}
```

### Renaming imports

代码**应该**通过使用命名空间导入或重命名导出本身来修复名称冲突。如果需要，代码**可以**重命名导入（`import {SomeThing as SomeOtherThing}`）。

重命名有帮助的三种情况：

1. 如果需要避免与其他导入符号冲突。
2. 如果导入的符号名称是生成的。
3. 如果导入符号的名称本身不清晰，重命名可以提高代码可读性。例如，使用 RxJS 时，`from` 函数重命名为 `observableFrom` 可能更具可读性。

## 导出

所有代码中使用命名导出：

```ts good
// Use named exports:
export class Foo { ... }
```

不要使用默认导出。这确保所有导入遵循统一的模式。

```ts bad
// Do not use default exports:
export default class Foo { ... } // BAD!
```

**为什么？**

默认导出没有规范名称，这使得集中维护变得困难，而对代码所有者几乎没有好处，包括可能降低可读性：

```ts bad
import Foo from './bar';  // Legal.
import Bar from './bar';  // Also legal.
```

命名导出有一个好处：当导入语句尝试导入未声明的内容时会报错。在 `foo.ts` 中：

```ts bad
const foo = 'blah';
export default foo;
```

在 `bar.ts` 中：

```ts bad
import {fizz} from './foo';
```

导致错误 `error TS2614: Module '"./foo"' has no exported member 'fizz'.` 而 `bar.ts`：

```ts bad
import fizz from './foo';
```

结果是 `fizZ === foo`，这可能出乎意料且难以调试。

此外，默认导出鼓励人们将所有内容放入一个大对象中作为命名空间：

```ts bad
export default class Foo {
  static SOME_CONSTANT = ...
  static someHelpfulFunction() { ... }
  ...
}
```

使用上述模式，我们有文件作用域，可用作命名空间。我们还有一个可能不必要的第二个作用域（类 `Foo`），在其他文件中可能被歧义地用作类型和值。

相反，优先使用文件作用域进行命名空间化和命名导出：

```ts good
export const SOME_CONSTANT = ...
export function someHelpfulFunction()
export class Foo {
  // only class stuff here
}
```

### Export visibility

TypeScript 不支持限制导出符号的可见性。只导出在模块外部使用的符号。通常最小化模块的导出 API 表面。

### Mutable exports

无论技术支持如何，可变导出会产生难以理解和调试的代码，特别是在多个模块之间重新导出时。可以将这种风格点解释为不允许 `export let`。

```ts bad
export let foo = 3;
// In pure ES6, foo is mutable and importers will observe the value change after a second.
// In TS, if foo is re-exported by a second file, importers will not see the value change.
window.setTimeout(() => {
  foo = 4;
}, 1000 /* ms */);
```

如果需要支持外部可访问的可变绑定，**应该**改用显式 getter 函数。

```ts good
let foo = 3;
window.setTimeout(() => {
  foo = 4;
}, 1000 /* ms */);
// Use an explicit getter to access the mutable export.
export function getFoo() { return foo; };
```

对于条件导出两个值之一的常见模式，首先进行条件检查，然后导出。确保模块主体执行后所有导出都是最终的。

```ts good
function pickApi() {
  if (useOtherApi()) return OtherApi;
  return RegularApi;
}
export const SomeApi = pickApi();
```

### Container classes

不要创建带有静态方法或属性的容器类作为命名空间的手段。

```ts bad
export class Container {
  static FOO = 1;
  static bar() { return 1; }
}
```

相反，导出单个常量和函数：

```ts good
export const FOO = 1;
export function bar() { return 1; }
```

## Import and export type

### Import type

当仅将导入的符号用作类型时，可以使用 `import type {...}`。对值使用常规导入：

```ts good
import type {Foo} from './foo';
import {Bar} from './foo';

import {type Foo, Bar} from './foo';
```

**为什么？**

TypeScript 编译器自动处理区别，不插入类型引用的运行时加载。那么为什么要注释类型导入呢？

TypeScript 编译器可以以两种模式运行：

- 在开发模式下，我们通常希望快速迭代循环。编译器转译为 JavaScript 而无需完整类型信息。这更快，但在某些情况下需要 `import type`。
- 在生产模式下，我们希望正确性。编译器类型检查一切并确保正确使用 `import type`。

注意：如果需要强制加载副作用，请使用 `import '...';`。

### Export type

重新导出类型时使用 `export type`，例如：

```ts good
export type {AnInterface} from './foo';
```

**为什么？**

`export type` 对于文件转译中的类型重新导出很有用。

`export type` 也可能有助于避免为 API 导出值符号。然而它不能提供保证：下游代码可能通过不同路径导入 API。分割和保证 API 类型与值用法的好方法是实际将符号拆分为例如 `UserService` 和 `AjaxUserService`。这更不容易出错，也更好地传达意图。

### Use modules not namespaces

TypeScript 支持两种组织代码的方法：**命名空间**和**模块**，但命名空间是禁止的。也就是说，代码**必须**使用 `import {foo} from 'bar';` 形式的导入和导出引用其他文件中的代码。

代码**禁止**使用 `namespace Foo { ... }` 结构。命名空间**只能**在与外部第三方代码接口时使用。要在语义上命名空间化代码，请使用单独的文件。

代码**禁止**使用 `require`（如 `import x = require('...');`）进行导入。使用 ES6 模块语法。

```ts bad
// Bad: do not use namespaces:
namespace Rocket {
  function launch() { ... }
}

// Bad: do not use <reference>
/// <reference path="..."/>

// Bad: do not use require()
import x = require('mydep');
```

> NB: TypeScript `namespace` 以前称为内部模块，使用 `module Foo { ... }` 形式。不要使用它。始终使用 ES6 导入。

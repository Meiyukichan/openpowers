# 注释与文档

## JSDoc versus comments

有两类注释：JSDoc（`/** ... */`）和非 JSDoc 普通注释（`// ...` 或 `/* ... */`）。

- 使用 `/** JSDoc */` 注释进行文档化，即代码用户应阅读的注释。
- 使用 `// 行注释` 进行实现注释，即只涉及代码本身的注释。

JSDoc 注释被工具（如编辑器和文档生成器）理解，而普通注释只对其他人类有用。

### Multi-line comments

多行注释在与周围代码相同的级别缩进。**必须**使用多个单行注释（`//` 风格），而不是块注释风格（`/* */`）。

```ts good
// This is
// fine
```

```ts bad
/*
 * This should
 * use multiple
 * single-line comments
 */

/* This should use // */
```

注释不要用星号或其他字符绘制的盒子包围。

## JSDoc general form

JSDoc 注释的基本格式如下例所示：

```ts good
/**
 * Multiple lines of JSDoc text are written here,
 * wrapped normally.
 * @param arg A number to do something to.
 */
function doSomething(arg: number) { … }
```

或此单行示例：

```ts good
/** This short jsdoc describes the function. */
function doSomething(arg: number) { … }
```

如果单行注释溢出到多行，**必须**使用多行样式，`/**` 和 `*/` 单独成行。

许多工具提取 JSDoc 注释的元数据以执行代码验证和优化。因此，这些注释**必须**是格式良好的。

## Markdown

JSDoc 用 Markdown 编写，尽管它可以在必要时包含 HTML。

这意味着解析 JSDoc 的工具会忽略普通文本格式，所以如果这样做：

```ts bad
/**
 * Computes weight based on three factors:
 *   items sent
 *   items received
 *   last timestamp
 */
```

它会呈现为：

```
Computes weight based on three factors: items sent items received last timestamp
```

相反，写一个 Markdown 列表：

```ts good
/**
 * Computes weight based on three factors:
 *
 * - items sent
 * - items received
 * - last timestamp
 */
```

## JSDoc tags

Google 风格允许 JSDoc 标签的子集。大多数标签必须占据自己的行，标签在行首。

```ts good
/**
 * The "param" tag must occupy its own line and may not be combined.
 * @param left A description of the left param.
 * @param right A description of the right param.
 */
function add(left: number, right: number) { ... }
```

```ts bad
/**
 * The "param" tag must occupy its own line and may not be combined.
 * @param left @param right
 */
function add(left: number, right: number) { ... }
```

## Line wrapping

行包裹的块标签缩进四个空格。包裹的描述文本**可以**与前几行的描述对齐，但不鼓励这种水平对齐。

```ts good
/**
 * Illustrates line wrapping for long param/return descriptions.
 * @param foo This is a param with a particularly long description that just
 *     doesn't fit on one line.
 * @return This returns something that has a lengthy description too long to fit
 *     in one line.
 */
exports.method = function(foo) {
  return 5;
};
```

不要在包裹 `@desc` 或 `@fileoverview` 描述时缩进。

## Document all top-level exports of modules

使用 `/** JSDoc */` 注释向代码用户传达信息。避免仅仅重复属性或参数名称。审查者判断，如果属性和方法的用途不是从名称中立即显而易见的，**应该**也文档化所有属性和方法（无论是导出/公开与否）。

**异常**：仅为了被工具消费而导出的符号（如 @NgModule 类）不需要注释。

## Class comments

类的 JSDoc 注释应为读者提供足够的信息来了解如何使用类，以及正确使用类需要哪些额外考虑。构造函数的文本描述可以省略。

## Method and function comments

如果方法签名中的 JSDoc 或方法名称和类型从其余部分显而易见，则可以省略方法、参数和返回描述。

方法描述以描述方法作用的动词短语开头。这个短语不是祈使句，而是以第三人称书写，就好像在它前面有一个隐含的"此方法 ..."。

## Parameter property comments

参数属性是带有 `private`、`protected`、`public` 或 `readonly` 修饰符前缀的构造函数参数。参数属性同时声明参数和实例属性，并隐式赋值。例如，`constructor(private readonly foo: Foo)` 声明构造函数接受参数 `foo`，但也声明私有只读属性 `foo`，并在执行构造函数剩余部分之前将参数赋值给该属性。

要文档化这些字段，使用 JSDoc 的 `@param` 注解。编辑器在构造函数调用和属性访问时显示描述。

```ts good
/** This class demonstrates how parameter properties are documented. */
class ParamProps {
  /**
   * @param percolator The percolator used for brewing.
   * @param beans The beans to brew.
   */
  constructor(
    private readonly percolator: Percolator,
    private readonly beans: CoffeeBean[]) {}
}
```

```ts good
/** This class demonstrates how ordinary fields are documented. */
class OrdinaryClass {
  /** The bean that will be used in the next call to brew(). */
  nextBean: CoffeeBean;

  constructor(initialBean: CoffeeBean) {
    this.nextBean = initialBean;
  }
}
```

## JSDoc type annotations

JSDoc 类型注解在 TypeScript 源代码中是冗余的。不要在 `@param` 或 `@return` 块中声明类型，不要在使用 `implements`、`enum`、`private`、`override` 等关键字的代码上写 `@implements`、`@enum`、`@private`、`@override` 等。

## Make comments that actually add information

对于非导出符号，有时函数或参数的名称和类型就足够了。但代码通常会从比仅变量名更多的文档中受益！

- 避免只是重复参数名称和类型的注释，例如
```ts bad
/** @param fooBarService The Bar service for the Foo application. */
```
- 因此，`@param` 和 `@return` 行仅在添加信息时才需要，否则**可以**省略。

```ts good
/**
 * POSTs the request to start coffee brewing.
 * @param amountLitres The amount to brew. Must fit the pot size!
 */
brew(amountLitres: number, logger: Logger) {
  // ...
}
```

### Comments when calling a function

每当方法名称和参数值不能充分传达参数含义时，应使用"参数名称"注释。

在添加这些注释之前，考虑重构方法以改为接受接口并解构它，这可以大大提高调用站点的可读性。

"参数名称"注释放在参数值之前，包括参数名称和 `=` 后缀：

```ts good
someFunction(obviousParam, /* shouldRender= */ true, /* name= */ 'hello');
```

现有代码可能使用遗留的参数名称注释样式，将这些注释放在参数值之后并省略 `=`。在文件内保持一致地继续使用此样式是可以接受的。

```ts
someFunction(obviousParam, true /* shouldRender */, 'hello' /* name */);
```

## Place documentation prior to decorators

当类、方法或属性同时有装饰器（如 `@Component`）和 JSDoc 时，请确保在装饰器之前编写 JSDoc。

- 不要在装饰器和被装饰语句之间写 JSDoc。

```ts bad
@Component({
  selector: 'foo',
  template: 'bar',
})
/** Component that prints "bar". */
export class FooComponent {}
```

- 在装饰器之前写 JSDoc 块。

```ts good
/** Component that prints "bar". */
@Component({
  selector: 'foo',
  template: 'bar',
})
export class FooComponent {}
```

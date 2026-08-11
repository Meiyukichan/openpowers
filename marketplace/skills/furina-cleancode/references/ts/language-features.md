# 语言特性

本节说明哪些特性可以使用，哪些特性禁止使用，以及它们的任何附加约束。

本风格指南未讨论的语言特性**可以**使用，不对其使用提供建议。

## Local variable declarations

### Use const and let

始终使用 `const` 或 `let` 声明变量。默认使用 `const`，除非变量需要重新赋值。禁止使用 `var`。

```ts good
const foo = otherValue;  // Use if "foo" never changes.
let bar = someValue;     // Use if "bar" is ever assigned into later on.
```

`const` 和 `let` 是块作用域的，像大多数其他语言中的变量。JavaScript 中的 `var` 是函数作用域的，可能导致难以理解的 bug。不要使用它。

```ts bad
var foo = someValue;     // Don't use - var scoping is complex and causes bugs.
```

变量**禁止**在声明之前使用。

### One variable per declaration

每个局部变量声明只声明一个变量：不使用 `let a = 1, b = 2;` 这样的声明。

## Array literals

### Do not use the `Array` constructor

**禁止**使用 `Array()` 构造函数，无论是否带 `new`。它有令人困惑和矛盾的行为：

```ts bad
const a = new Array(2); // [undefined, undefined]
const b = new Array(2, 3); // [2, 3];
```

相反，始终使用括号表示法初始化数组，或使用 `from` 初始化具有特定大小的 `Array`：

```ts good
const a = [2];
const b = [2, 3];

// Equivalent to Array(2):
const c = [];
c.length = 2;

// [0, 0, 0, 0, 0]
Array.from<number>({length: 5}).fill(0);
```

### Do not define properties on arrays

不要在数组上定义或使用非数字属性（除了 `length`）。使用 `Map`（或 `Object`）代替。

### Using spread syntax

使用展开语法 ` [...foo];` 是浅拷贝或连接可迭代对象的便捷简写。

```ts good
const foo = [
  1,
];

const foo2 = [
  ...foo,
  6,
  7,
];

const foo3 = [
  5,
  ...foo,
];

foo2[1] === 6;
foo3[1] === 1;
```

使用展开语法时，被展开的值**必须**与正在创建的内容匹配。创建数组时，只展开可迭代对象。禁止展开原始类型（包括 `null` 和 `undefined`）。

```ts bad
const foo = [7];
const bar = [5, ...(shouldUseFoo && foo)]; // might be undefined

// Creates {0: 'a', 1: 'b', 2: 'c'} but has no length
const fooStrings = ['a', 'b', 'c'];
const ids = {...fooStrings};
```

```ts good
const foo = shouldUseFoo ? [7] : [];
const bar = [5, ...foo];
const fooStrings = ['a', 'b', 'c'];
const ids = [...fooStrings, 'd', 'e'];
```

### Array destructuring

数组字面量可以在赋值的左侧使用，以执行解构（例如从单个数组或可迭代对象解包多个值）。可以包含一个最终的"rest"元素（`...` 和变量名之间没有空格）。如果元素未使用，应省略。

```ts good
const [a, b, c, ...rest] = generateResults();
let [, b,, d] = someArray;
```

解构也可以用于函数参数。如果解构的数组参数是可选的，始终指定 `[]` 作为默认值，并在左侧提供默认值：

```ts good
function destructured([a = 4, b = 2] = []) { … }
```

不允许：

```ts bad
function badDestructuring([a, b] = [4, 2]) { … }
```

提示：对于将多个值打包到函数参数或返回值中时，尽可能使用对象解构而非数组解构，因为它允许命名各个元素并为每个元素指定不同类型。

## Object literals

### Do not use the `Object` constructor

`Object` 构造函数是禁止的。使用对象字面量（`{}` 或 `{a: 0, b: 1, c: 2}`）代替。

### Iterating objects

使用 `for (... in ...)` 迭代对象容易出错。它会包含原型链中的可枚举属性。

不要使用未过滤的 `for (... in ...)` 语句：

```ts bad
for (const x in someObj) {
  // x could come from some parent prototype!
}
```

使用 `if` 语句显式过滤值，或使用 `for (... of Object.keys(...))`。

```ts good
for (const x in someObj) {
  if (!someObj.hasOwnProperty(x)) continue;
  // now x was definitely defined on someObj
}
for (const x of Object.keys(someObj)) { // note: for _of_!
  // now x was definitely defined on someObj
}
for (const [key, value] of Object.entries(someObj)) { // note: for _of_!
  // now key was definitely defined on someObj
}
```

### Using spread syntax

使用展开语法 `{...bar}` 是创建对象浅拷贝的便捷简写。在对象初始化中使用展开语法时，后面的值会替换同一键的较早值。

```ts good
const foo = {
  num: 1,
};

const foo2 = {
  ...foo,
  num: 5,
};

const foo3 = {
  num: 5,
  ...foo,
}

foo2.num === 5;
foo3.num === 1;
```

使用展开语法时，被展开的值**必须**与正在创建的内容匹配。也就是说，创建对象时，只展开对象；禁止展开数组和原始类型（包括 `null` 和 `undefined`）。避免展开具有非 Object 原型的对象（例如类定义、类实例、函数），因为行为是不直观的（只浅拷贝可枚举的非原型属性）。

```ts bad
const foo = {num: 7};
const bar = {num: 5, ...(shouldUseFoo && foo)}; // might be undefined

// Creates {0: 'a', 1: 'b', 2: 'c'} but has no length
const fooStrings = ['a', 'b', 'c'];
const ids = {...fooStrings};
```

```ts good
const foo = shouldUseFoo ? {num: 7} : {};
const bar = {num: 5, ...foo};
```

### Computed property names

计算属性名（例如 `{['key' + foo()]: 42}`）是允许的，被视为字典样式（带引号）的键（即不能与非引号键混合），除非计算属性是 [symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol)（例如 `[Symbol.iterator]`）。

### Object destructuring

对象解构模式可以在赋值的左侧使用，以执行解构并从单个对象解包多个值。

解构的对象也可以用作函数参数，但应尽可能保持简单：单层非引号简写属性。不能在参数解构中使用更深层次的嵌套和计算属性。在解构参数的左侧指定默认值（`{str = 'some default'} = {}`，而不是 `{str} = {str: 'some default'}`），如果解构的对象本身是可选的，它必须默认为 `{}`。

示例：

```ts good
interface Options {
  /** The number of times to do something. */
  num?: number;

  /** A string to do stuff to. */
  str?: string;
}

function destructured({num, str = 'default'}: Options = {}) {}
```

不允许：

```ts bad
function nestedTooDeeply({x: {num, str}}: {x: Options}) {}
function nontrivialDefault({num, str}: Options = {num: 42, str: 'default'}) {}
```

## Classes

### Class declarations

类声明**禁止**以分号结尾：

```ts good
class Foo {
}
```

```ts bad
class Foo {
}; // Unnecessary semicolon
```

相反，包含类表达式的语句**必须**以分号结尾：

```ts good
export const Baz = class extends Bar {
  method(): number {
    return this.x;
  }
}; // Semicolon here as this is a statement, not a declaration
```

```ts bad
exports const Baz = class extends Bar {
  method(): number {
    return this.x;
  }
}
```

类声明的大括号与其他类内容之间是否有空行都是可以的：

```ts good
// No spaces around braces - fine.
class Baz {
  method(): number {
    return this.x;
  }
}

// A single space around both braces - also fine.
class Foo {

  method(): number {
    return this.x;
  }

}
```

### Class method declarations

类方法声明**禁止**使用分号分隔各个方法声明：

```ts good
class Foo {
  doThing() {
    console.log("A");
  }
}
```

```ts bad
class Foo {
  doThing() {
    console.log("A");
  }; // <-- unnecessary
}
```

方法声明应该用单个空行与周围代码分隔：

```ts good
class Foo {
  doThing() {
    console.log("A");
  }

  getOtherThing(): number {
    return 4;
  }
}
```

```ts bad
class Foo {
  doThing() {
    console.log("A");
  }
  getOtherThing(): number {
    return 4;
  }
}
```

##### Overriding toString

`toString` 方法可以被重写，但必须始终成功且不得有可见的副作用。

提示：要特别注意不要从 toString 调用其他方法，因为异常条件可能导致无限循环。

### Static methods

##### Avoid private static methods

在不干扰可读性的情况下，优先使用模块本地函数而非私有静态方法。

##### Do not rely on dynamic dispatch

代码**不应该**依赖静态方法的动态分派。静态方法**应该**只在其定义的基类本身上调用。静态方法**不应该**在可能是一个构造函数或子类构造函数的动态实例的变量上调用（如果这样做，必须用 `@nocollapse` 定义），并且**禁止**直接在未定义该方法的子类上调用。

不允许：

```ts bad
// Context for the examples below (this class is okay by itself)
class Base {
  /** @nocollapse */ static foo() {}
}
class Sub extends Base {}

// Discouraged: don't call static methods dynamically
function callFoo(cls: typeof Base) {
  cls.foo();
}

// Disallowed: don't call static methods on subclasses that don't define it themselves
Sub.foo();

// Disallowed: don't access this in static methods.
class MyClass {
  static foo() {
    return this.staticField;
  }
}
MyClass.staticField = 1;
```

##### Avoid static `this` references

代码**禁止**在静态上下文中使用 `this`。

JavaScript 允许通过 `this` 访问静态字段。与其他语言不同，静态字段也是可继承的。

```ts bad
class ShoeStore {
  static storage: Storage = ...;

  static isAvailable(s: Shoe) {
    // Bad: do not use `this` in a static method.
    return this.storage.has(s.id);
  }
}

class EmptyShoeStore extends ShoeStore {
  static storage: Storage = EMPTY_STORE;  // overrides storage from ShoeStore
}
```

**为什么？**

这段代码通常令人惊讶：作者可能不会期望静态字段可以通过 this 指针访问，并且可能会惊讶地发现它们可以被覆盖——这个特性并不常用。

这段代码还鼓励一种反模式，即拥有大量静态状态，这会导致可测试性问题。

### Constructors

构造函数调用**必须**使用括号，即使没有参数传递：

```ts bad
const x = new Foo;
```

```ts good
const x = new Foo();
```

省略括号会导致微妙的错误。这两行是不等价的：

```ts good
new Foo().Bar();
new Foo.Bar();
```

提供一个空构造函数或只是委托给父类的构造函数是不必要的，因为 ES2015 如果未指定会提供默认类构造函数。但是，具有参数属性、可视性修饰符或参数装饰器的构造函数**不应该**省略，即使构造函数体是空的。

```ts bad
class UnnecessaryConstructor {
  constructor() {}
}
```

```ts bad
class UnnecessaryConstructorOverride extends Base {
    constructor(value: number) {
      super(value);
    }
}
```

```ts good
class DefaultConstructor {
}

class ParameterProperties {
  constructor(private myService) {}
}

class ParameterDecorators {
  constructor(@SideEffectDecorator myService) {}
}

class NoInstantiation {
  private constructor() {}
}
```

构造函数应该用单个空行与上方和下方的周围代码分隔：

```ts good
class Foo {
  myField = 10;

  constructor(private readonly ctorParam) {}

  doThing() {
    console.log(ctorParam.getThing() + myField);
  }
}
```

```ts bad
class Foo {
  myField = 10;
  constructor(private readonly ctorParam) {}
  doThing() {
    console.log(ctorParam.getThing() + myField);
  }
}
```

### Class members

##### No #private fields

不要使用私有字段（也称为私有标识符）：

```ts bad
class Clazz {
  #ident = 1;
}
```

相反，使用 TypeScript 的可见性注解：

```ts good
class Clazz {
  private ident = 1;
}
```

**为什么？**

私有标识符在 TypeScript 降级时会导致大量代码大小和性能回归，并且在 ES2015 之前不受支持。它们只能降级到 ES2015，不能更低。同时，当使用静态类型检查来强制可见性时，它们没有提供实质性的好处。

##### Use readonly

用 `readonly` 修饰符标记在构造函数外部从不重新赋值的属性（这些属性不必是深度不可变的）。

##### Parameter properties

不要通过类成员引入明显的初始化器，而是使用 TypeScript 的 parameter property。

```ts bad
class Foo {
  private readonly barService: BarService;

  constructor(barService: BarService) {
    this.barService = barService;
  }
}
```

```ts good
class Foo {
  constructor(private readonly barService: BarService) {}
}
```

如果参数属性需要文档说明，使用 `@param` JSDoc 标签。

##### Field initializers

如果类成员不是参数，在声明处初始化它，这有时可以完全省略构造函数。

```ts bad
class Foo {
  private readonly userList: string[];

  constructor() {
    this.userList = [];
  }
}
```

```ts good
class Foo {
  private readonly userList: string[] = [];
}
```

提示：属性在构造函数完成后不应添加或删除实例，因为这会严重阻碍 VM 优化类的"shape"。稍后可能填充的可选字段应显式初始化为 `undefined` 以防止后续 shape 变化。

##### Properties used outside of class lexical scope

在包含类的词法作用域之外使用的属性，例如 Angular 组件属性在模板中使用，**禁止**使用 `private` 可视性，因为它们在其包含类的词法作用域之外使用。

根据相关属性，使用 `protected` 或 `public`。Angular 和 AngularJS 模板属性应使用 `protected`，但 Polymer 应使用 `public`。

TypeScript 代码**禁止**使用 `obj['foo']` 来绕过属性的可见性。

**为什么？**

当属性是 `private` 时，你是在向自动化系统和人类声明属性访问仅限于声明类的方法，他们将依赖这一点。例如，未使用代码检查会标记一个看起来未使用的私有属性，即使某个其他文件设法绕过了可见性限制。

虽然看起来 `obj['foo']` 可以绕过 TypeScript 编译器中的可见性，但这种模式可以通过重新排列构建规则来破坏，也违反了优化兼容性。

##### Getters and setters

类的 getter 和 setter（也称为访问器）**可以**使用。getter 方法**必须**是纯函数（即结果一致且没有副作用：getter **禁止**改变可观察状态）。它们还可用于限制内部或冗长实现细节的可见性（如下所示）。

```ts good
class Foo {
  constructor(private readonly someService: SomeService) {}

  get someMember(): string {
    return this.someService.someVariable;
  }

  set someMember(newValue: string) {
    this.someService.someVariable = newValue;
  }
}
```

```ts bad
class Foo {
  nextId = 0;
  get next() {
    return this.nextId++; // Bad: getter changes observable state
  }
}
```

如果访问器用于隐藏类属性，隐藏的属性**可以**使用任何整词作为前缀或后缀，如 `internal` 或 `wrapped`。使用这些私有属性时，尽可能通过访问器访问值。属性的至少一个访问器**必须**是非平凡的：不要仅为隐藏属性而定义"直通"访问器。相反，将属性设为 public（或考虑将其设为 `readonly` 而不只是定义一个没有 setter 的 getter）。

```ts good
class Foo {
  private wrappedBar = '';
  get bar() {
    return this.wrappedBar || 'bar';
  }

  set bar(wrapped: string) {
    this.wrappedBar = wrapped.trim();
  }
}
```

```ts bad
class Bar {
  private barInternal = '';
  // Neither of these accessors have logic, so just make bar public.
  get bar() {
    return this.barInternal;
  }

  set bar(value: string) {
    this.barInternal = value;
  }
}
```

**禁止**使用 `Object.defineProperty` 定义 getter 和 setter，因为这会干扰属性重命名。

##### Computed properties

计算属性只能在类中使用，当属性是 symbol 时。字典样式属性（即带引号或计算的非 symbol 键）是不允许的（参见混用键类型的理由）。对于逻辑上可迭代的类，应定义 `[Symbol.iterator]` 方法。除此之外，应谨慎使用 `Symbol`。

提示：小心使用任何其他内置 symbol（例如 `Symbol.isConcatSpreadable`），因为它们不会被编译器 polyfill，因此在旧版浏览器中不工作。

### Visibility

限制属性、方法和整个类型的可见性有助于保持代码解耦。

- 尽可能限制符号可见性。
- 考虑将私有方法转换为同一文件内但在任何类外部的非导出函数，并将私有属性移动到单独的、非导出的类中。
- TypeScript 符号默认是 public。除非要声明非只读 public 参数属性（在构造函数中），否则不要使用 `public` 修饰符。

```ts bad
class Foo {
  public bar = new Bar();  // BAD: public modifier not needed

  constructor(public readonly baz: Baz) {}  // BAD: readonly implies it's a property which defaults to public
}
```

```ts good
class Foo {
  bar = new Bar();  // GOOD: public modifier not needed

  constructor(public baz: Baz) {}  // public modifier allowed
}
```

另请参阅导出可见性。

### Disallowed class patterns

##### Do not manipulate `prototype`s directly

`class` 关键字允许比定义 `prototype` 属性更清晰、更易读类定义。普通实现代码不应该操作这些对象。Mixins 和修改内置对象的 prototype 是明确禁止的。

**异常**：框架代码（如 Polymer 或 Angular）可能需要使用 `prototype`，不应为了避免这样做而采取更糟糕的解决方法。

## Functions

### Terminology

有多种不同类型的函数，它们之间有细微的区别。本指南使用以下术语，与 [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions) 保持一致：

- "function declaration"：使用 `function` 关键字的声明（即不是表达式）
- "function expression"：表达式，通常用于赋值或作为参数传递，使用 `function` 关键字
- "arrow function"：使用 `=>` 语法的表达式
- "block body"：带大括号的箭头函数右侧
- "concise body"：不带大括号的箭头函数右侧

方法和类/构造函数不在本节讨论范围内。

### Prefer function declarations for named functions

定义命名函数时，优先使用函数声明而非箭头函数或函数表达式。

```ts good
function foo() {
  return 42;
}
```

```ts bad
const foo = () => 42;
```

箭头函数**可以**在需要显式类型注解等情况下使用。

```ts good
interface SearchFunction {
  (source: string, subString: string): boolean;
}

const fooSearch: SearchFunction = (source, subString) => { ... };
```

### Nested functions

嵌套在其他方法或函数中的函数可以使用函数声明或箭头函数，视情况而定。特别是在方法体中，优先使用箭头函数，因为它们可以访问外部的 `this`。

### Do not use function expressions

不要使用函数表达式。使用箭头函数代替。

```ts good
bar(() => { this.doSomething(); })
```

```ts bad
bar(function() { ... })
```

**异常**：只有当代码必须动态重新绑定 `this` 时才**可以**使用函数表达式（但这是不鼓励的），或者对于没有箭头语法的生成器函数。

### Arrow function bodies

根据情况使用带简洁体（即表达式）或块体的箭头函数。

```ts good
// Top level functions use function declarations.
function someFunction() {
  // Block bodies are fine:
  const receipts = books.map((b: Book) => {
    const receipt = payMoney(b.price);
    recordTransaction(receipt);
    return receipt;
  });

  // Concise bodies are fine, too, if the return value is used:
  const longThings = myValues.filter(v => v.length > 1000).map(v => String(v));

  function payMoney(amount: number) {
    // function declarations are fine, but must not access `this`.
  }

  // Nested arrow functions may be assigned to a const.
  const computeTax = (amount: number) => amount * 0.12;
}
```

只有当函数的返回值实际被使用时，才使用简洁体。块体确保返回类型是 `void` 并防止潜在的副作用。

```ts bad
// BAD: use a block body if the return value of the function is not used.
myPromise.then(v => console.log(v));
// BAD: this typechecks, but the return value still leaks.
let f: () => void;
f = () => 1;
```

```ts good
// GOOD: return value is unused, use a block body.
myPromise.then(v => {
  console.log(v);
});
// GOOD: code may use blocks for readability.
const transformed = [1, 2, 3].map(v => {
  const intermediate = someComplicatedExpr(v);
  const more = acrossManyLines(intermediate);
  return worthWrapping(more);
});
// GOOD: explicit `void` ensures no leaked return value
myPromise.then(v => void console.log(v));
```

提示：`void` 运算符可用于确保具有表达式体的箭头函数在结果未使用时返回 `undefined`。

### Rebinding `this`

除非函数专门为重新绑定 `this` 指针而存在，否则**禁止**在函数表达式和函数声明中使用 `this`。在大多数情况下，可以通过使用箭头函数或显式参数来避免重新绑定 `this`。

```ts bad
function clickHandler() {
  // Bad: what's `this` in this context?
  this.textContent = 'Hello';
}
// Bad: the `this` pointer reference is implicitly set to document.body.
document.body.onclick = clickHandler;
```

```ts good
// Good: explicitly reference the object from an arrow function.
document.body.onclick = () => { document.body.textContent = 'hello'; };
// Alternatively: take an explicit parameter
const setTextFn = (e: HTMLElement) => { e.textContent = 'hello'; };
document.body.onclick = setTextFn.bind(null, document.body);
```

优先使用箭头函数而非其他绑定 `this` 的方法，例如 `f.bind(this)`、`goog.bind(f, this)` 或 `const self = this`。

### Prefer passing arrow functions as callbacks

回调可以带有意外的参数调用，这些参数可以通过类型检查但仍会导致逻辑错误。

避免将命名回调传递给高阶函数，除非你确信两个函数的调用签名都稳定。特别要注意不常用的可选参数。

```ts bad
// BAD: Arguments are not explicitly passed, leading to unintended behavior
// when the optional `radix` argument gets the array indices 0, 1, and 2.
const numbers = ['11', '5', '10'].map(parseInt);
// > [11, NaN, 2];
```

相反，优先传递显式转发参数到命名回调的箭头函数。

```ts good
// GOOD: Arguments are explicitly passed to the callback
const numbers = ['11', '5', '3'].map((n) => parseInt(n));
// > [11, 5, 3]

// GOOD: Function is locally defined and is designed to be used as a callback
function dayFilter(element: string|null|undefined) {
  return element != null && element.endsWith('day');
}

const days = ['tuesday', undefined, 'juice', 'wednesday'].filter(dayFilter);
```

### Arrow functions as properties

类通常**不应该**包含初始化为箭头函数的属性。箭头函数属性要求调用函数了解被调用的 `this` 已经绑定，这增加了对 `this` 是什么的混淆，并且使用此类处理程序的调用点和引用看起来是破损的（即需要非本地知识来确定它们是正确的）。代码**应该**始终使用箭头函数调用实例方法（`const handler = (x) => { this.listener(x); };`），并且**不应该**获取或传递实例方法的引用（<del>`const handler = this.listener; handler(x);`</del>）。

> 注意：在某些特定情况下，例如在模板中绑定函数，箭头函数作为属性非常有用，可以创建更具可读性的代码。根据此规则判断。另请参阅下面的事件处理程序部分。

```ts bad
class DelayHandler {
  constructor() {
    // Problem: `this` is not preserved in the callback. `this` in the callback
    // will not be an instance of DelayHandler.
    setTimeout(this.patienceTracker, 5000);
  }
  private patienceTracker() {
    this.waitedPatiently = true;
  }
}
```

```ts bad
// Arrow functions usually should not be properties.
class DelayHandler {
  constructor() {
    // Bad: this code looks like it forgot to bind `this`.
    setTimeout(this.patienceTracker, 5000);
  }
  private patienceTracker = () => {
    this.waitedPatiently = true;
  }
}
```

```ts good
// Explicitly manage `this` at call time.
class DelayHandler {
  constructor() {
    // Use anonymous functions if possible.
    setTimeout(() => {
      this.patienceTracker();
    }, 5000);
  }
  private patienceTracker() {
    this.waitedPatiently = true;
  }
}
```

### Event handlers

当不需要卸载处理程序时（例如事件由类本身发出），事件处理程序**可以**使用箭头函数。如果处理程序需要卸载，箭头函数属性是正确的选择，因为它们自动捕获 `this` 并提供稳定的卸载引用。

```ts good
// Event handlers may be anonymous functions or arrow function properties.
class Component {
  onAttached() {
    // The event is emitted by this class, no need to uninstall.
    this.addEventListener('click', () => {
      this.listener();
    });
    // this.listener is a stable reference, we can uninstall it later.
    window.addEventListener('onbeforeunload', this.listener);
  }
  onDetached() {
    // The event is emitted by window. If we don't uninstall, this.listener will
    // keep a reference to `this` because it's bound, causing a memory leak.
    window.removeEventListener('onbeforeunload', this.listener);
  }
  // An arrow function stored in a property is bound to `this` automatically.
  private listener = () => {
    confirm('Do you want to exit the page?');
  }
}
```

不要在安装事件处理程序的表达式中使用 `bind`，因为它会创建一个无法卸载的临时引用。

```ts bad
// Binding listeners creates a temporary reference that prevents uninstalling.
class Component {
  onAttached() {
    // This creates a temporary reference that we won't be able to uninstall
    window.addEventListener('onbeforeunload', this.listener.bind(this));
  }
  onDetached() {
    // This bind creates a different reference, so this line does nothing.
    window.removeEventListener('onbeforeunload', this.listener.bind(this));
  }
  private listener() {
    confirm('Do you want to exit the page?');
  }
}
```

### Parameter initializers

可选函数参数**可以**在省略参数时给定要使用的默认初始化器。初始化器**禁止**有任何可观察的副作用。初始化器应尽可能保持简单。

```ts good
function process(name: string, extraContext: string[] = []) {}
function activate(index = 0) {}
```

```ts bad
// BAD: side effect of incrementing the counter
let globalCounter = 0;
function newId(index = globalCounter++) {}

// BAD: exposes shared mutable state, which can introduce unintended coupling
// between function calls
class Foo {
  private readonly defaultPaths: string[];
  frobnicate(paths = defaultPaths) {}
}
```

谨慎使用默认参数。当有超过少数几个没有自然顺序的可选参数时，优先使用解构来创建可读的 API。

### Prefer rest and spread when appropriate

使用 rest 参数代替访问 `arguments`。永远不要将局部变量或参数命名为 `arguments`，这会令人困惑地遮蔽内置名称。

```ts good
function variadic(array: string[], ...numbers: number[]) {}
```

使用函数展开语法代替 `Function.prototype.apply`。

### Formatting functions

函数体开头或结尾不允许有空行。

可以在函数体内谨慎使用单个空行来创建*逻辑分组*的语句。

生成器应将 `*` 附加到 `function` 和 `yield` 关键字，如 `function* foo()` 和 `yield* iter`，而不是 <del>`function *foo()`</del> 或 <del>`yield *iter`</del>。

单参数箭头函数的左侧括号是推荐的但不是必需的。

不要在 rest 或展开语法的 `...` 后加空格。

```ts good
function myFunction(...elements: number[]) {}
myFunction(...array, ...iterable, ...generator());
```

## this

只在类构造函数和方法、具有显式声明的 `this` 类型的函数（例如 `function func(this: ThisType, ...)`）、或在可以使用的 `this` 的作用域中定义的箭头函数中使用 `this`。

永远不要使用 `this` 引用全局对象、eval 的上下文、事件的目标，或不必要的 `call()` 或 `apply()` 调用的函数。

```ts bad
this.alert('Hello');
```

## Interfaces

## Primitive literals

### String literals

##### Use single quotes

普通字符串字面量用单引号（`'`）分隔，而不是双引号（`"`）。

提示：如果字符串包含单引号字符，考虑使用模板字符串以避免必须转义引号。

##### No line continuations

不要使用*行延续*（即在以反斜杠结尾的字符串字面量中结束一行）。即使 ES5 允许这样做，但如果斜杠后有任何尾随空格，会导致棘手的错误，而且对读者来说也不太明显。

不允许：

```ts bad
const LONG_STRING = 'This is a very very very very very very very long string. \
    It inadvertently contains long stretches of spaces due to how the \
    continued lines are indented.';
```

相反，写：

```ts good
const LONG_STRING = 'This is a very very very very very very long string. ' +
    'It does not contain long stretches of spaces because it uses ' +
    'concatenated strings.';
const SINGLE_STRING =
    'http://it.is.also/acceptable_to_use_a_single_long_string_when_breaking_would_hinder_search_discoverability';
```

##### Template literals

使用模板字面量（用 `` ` `` 分隔）代替复杂的字符串连接，特别是在涉及多个字符串字面量时。模板字面量可以跨越多行。

如果模板字面量跨越多行，它不需要遵循封闭块的缩进，尽管如果添加的空白不重要，也可以遵循。

示例：

```ts good
function arithmetic(a: number, b: number) {
  return `Here is a table of arithmetic operations:
${a} + ${b} = ${a + b}
${a} - ${b} = ${a - b}
${a} * ${b} = ${a * b}
${a} / ${b} = ${a / b}`;
}
```

### Number literals

数字可以用十进制、十六进制、八进制或二进制指定。对于十六进制、八进制和二进制，分别使用精确的 `0x`、`0o` 和 `0b` 前缀，并使用小写字母。除非立即跟随 `x`、`o` 或 `b`，否则不要包含前导零。

### Type coercion

TypeScript 代码**可以**使用 `String()` 和 `Boolean()`（注意：没有 `new`！）函数、字符串模板字面量或 `!!` 来强制类型。

```ts good
const bool = Boolean(false);
const str = String(aNumber);
const bool2 = !!str;
const str2 = `result: ${bool2}`;
```

枚举类型（包括枚举类型和其他类型的联合）的值**禁止**使用 `Boolean()` 或 `!!` 转换为布尔值，而必须使用比较运算符进行显式比较。

```ts bad
enum SupportLevel {
  NONE,
  BASIC,
  ADVANCED,
}

const level: SupportLevel = ...;
let enabled = Boolean(level);

const maybeLevel: SupportLevel|undefined = ...;
enabled = !!maybeLevel;
```

```ts good
enum SupportLevel {
  NONE,
  BASIC,
  ADVANCED,
}

const level: SupportLevel = ...;
let enabled = level !== SupportLevel.NONE;

const maybeLevel: SupportLevel|undefined = ...;
enabled = level !== undefined && level !== SupportLevel.NONE;
```

**为什么？**

对于大多数目的，枚举名称映射到的运行时数字或字符串值并不重要，因为枚举类型的值在源代码中按名称引用。因此，工程师习惯于不考虑这一点，所以 *确实* 重要的场景是不可取的，因为它们会令人惊讶。枚举到布尔值的转换就是这样一种情况；特别是，默认情况下，第一个声明的枚举值是假值（因为它是 0），而其他的是真值，这可能是出乎意料的。阅读使用枚举值的代码的人甚至可能不知道它是否是第一个声明的值。

使用字符串连接强制转换为字符串是不鼓励的，因为我们检查加法运算符的操作数是否类型匹配。

代码**必须**使用 `Number()` 来解析数值，并且**必须**显式检查其返回的 `NaN` 值，除非从上下文中解析失败是不可能的。

注意：`Number('')`、`Number(' ')` 和 `Number('\t')` 会返回 `0` 而不是 `NaN`。`Number('Infinity')` 和 `Number('-Infinity')` 会分别返回 `Infinity` 和 `-Infinity`。此外，指数表示法如 `Number('1e+309')` 和 `Number('-1e+309')` 可能溢出到 `Infinity`。这些情况可能需要特殊处理。

```ts good
const aNumber = Number('123');
if (!isFinite(aNumber)) throw new Error(...);
```

代码**禁止**使用一元加号（`+`）将字符串强制转换为数字。解析数字可能失败，有令人惊讶的边缘情况，而且可能是代码异味。在代码审查中给定这个，一元加号太容易被忽视。

```ts bad
const x = +y;
```

代码也**禁止**使用 `parseInt` 或 `parseFloat` 来解析数字，除了非十进制字符串（见下文）。这两个函数都会忽略字符串中的尾随字符，这可能会掩盖错误条件（例如将 `12 dwarfs` 解析为 `12`）。

需要使用radix解析的代码**必须**在调用 `parseInt` 之前检查其输入仅包含该radix的适当数字；

```ts good
if (!/^[a-fA-F0-9]+$/.test(someString)) throw new Error(...);
// Needed to parse hexadecimal.
// tslint:disable-next-line:ban
const n = parseInt(someString, 16);  // Only allowed for radix != 10
```

使用 `Number()` 然后使用 `Math.floor` 或 `Math.trunc`（在可用时）来解析整数：

```ts good
let f = Number(someString);
if (isNaN(f)) handleError();
f = Math.floor(f);
```

##### Implicit coercion

不要在有隐式布尔强制转换的条件子句中使用显式布尔强制转换。那些是 `if`、`for` 和 `while` 语句中的条件。

```ts bad
const foo: MyInterface|null = ...;
if (!!foo) {...}
while (!!foo) {...}
```

```ts good
const foo: MyInterface|null = ...;
if (foo) {...}
while (foo) {...}
```

与显式转换一样，枚举类型（包括枚举类型和其他类型的联合）的值**禁止**隐式强制转换为布尔值，而必须使用比较运算符进行显式比较。

```ts bad
enum SupportLevel {
  NONE,
  BASIC,
  ADVANCED,
}

const level: SupportLevel = ...;
if (level) {...}

const maybeLevel: SupportLevel|undefined = ...;
if (level) {...}
```

```ts good
enum SupportLevel {
  NONE,
  BASIC,
  ADVANCED,
}

const level: SupportLevel = ...;
if (level !== SupportLevel.NONE) {...}

const maybeLevel: SupportLevel|undefined = ...;
if (level !== undefined && level !== SupportLevel.NONE) {...}
```

其他类型的值可以隐式强制转换为布尔值，也可以使用比较运算符进行显式比较：

```ts good
// Explicitly comparing > 0 is OK:
if (arr.length > 0) {...}
// so is relying on boolean coercion:
if (arr.length) {...}
```

## Control structures

### Control flow statements and blocks

控制流语句（`if`、`else`、`for`、`do`、`while` 等）总是使用大括号包围包含的代码，即使体只包含单个语句。非空块的第一个语句必须从自己的行开始。

```ts good
for (let i = 0; i < x; i++) {
  doSomethingWith(i);
}

if (x) {
  doSomethingWithALongMethodNameThatForcesANewLine(x);
}
```

```ts bad
if (x)
  doSomethingWithALongMethodNameThatForcesANewLine(x);

for (let i = 0; i < x; i++) doSomethingWith(i);
```

**异常**：可以放在一行上的 `if` 语句**可以**省略大括号。

```ts good
if (x) x.doFoo();
```

##### Assignment in control statements

优先避免在控制语句中赋值。赋值很容易在控制语句中与相等检查混淆。

```ts bad
if (x = someFunction()) {
  // Assignment easily mistaken with equality check
  // ...
}
```

```ts good
x = someFunction();
if (x) {
  // ...
}
```

在首选控制语句内赋值的情况下，用额外的括号包围赋值以表明这是故意的。

```ts
while ((x = someFunction())) {
  // Double parenthesis shows assignment is intentional
  // ...
}
```

##### Iterating containers

优先使用 `for (... of someArr)` 遍历数组。`Array.prototype.forEach` 和普通的 `for` 循环也是允许的：

```ts good
for (const x of someArr) {
  // x is a value of someArr.
}

for (let i = 0; i < someArr.length; i++) {
  // Explicitly count if the index is needed, otherwise use the for/of form.
  const x = someArr[i];
  // ...
}
for (const [i, x] of someArr.entries()) {
  // Alternative version of the above.
}
```

`for`-`in` 循环只能用于字典样式对象（有关更多信息，请参见下面的优化兼容性属性访问）。不要使用 `for (... in ...)` 遍历数组，因为它会反直觉地给出数组的索引（作为字符串！），而不是值：

```ts bad
for (const x in someArray) {
  // x is the index!
}
```

`Object.prototype.hasOwnProperty` 应在 `for`-`in` 循环中使用以排除不需要的原型属性。尽可能优先使用 `for`-`of` 配合 `Object.keys`、`Object.values` 或 `Object.entries`。

```ts good
for (const key in obj) {
  if (!obj.hasOwnProperty(key)) continue;
  doWork(key, obj[key]);
}
for (const key of Object.keys(obj)) {
  doWork(key, obj[key]);
}
for (const value of Object.values(obj)) {
  doWorkValOnly(value);
}
for (const [key, value] of Object.entries(obj)) {
  doWork(key, value);
}
```

### Grouping parentheses

只有作者和审查者同意代码在没有它们的情况下没有合理的被误解的机会，或者它们使代码更容易阅读时，才省略可选的分组括号。不假设每个读者都记住了整个运算符优先级表是合理的。

不要在 `delete`、`typeof`、`void`、`return`、`throw`、`case`、`in`、`of` 或 `yield` 之后的整个表达式周围使用不必要的括号。

### Exception handling

异常是语言的重要组成部分，应该在出现异常情况时使用。

自定义异常提供了从函数传递额外错误信息的好方法。它们应该在原生 `Error` 类型不足的任何地方定义和使用。

优先抛出异常而不是临时错误处理方法（例如传递错误容器引用类型，或返回带有错误属性的对象）。

##### Instantiate errors using `new`

实例化异常时始终使用 `new Error()`，而不仅仅是调用 `Error()`。两种形式都创建一个新的 `Error` 实例，但使用 `new` 与其他对象的实例化方式更一致。

```ts good
throw new Error('Foo is not a valid bar.');
```

```ts bad
throw Error('Foo is not a valid bar.');
```

##### Only throw errors

JavaScript（因此 TypeScript）允许抛出或拒绝带有任意值的 Promise。但是，如果抛出或拒绝的值不是 `Error`，它不会填充堆栈跟踪信息，使调试变得困难。这种处理扩展到 `Promise` 拒绝值，因为 `Promise.reject(obj)` 等同于 async 函数中的 `throw obj`。

```ts bad
// bad: does not get a stack trace.
throw 'oh noes!';
// For promises
new Promise((resolve, reject) => void reject('oh noes!'));
Promise.reject();
Promise.reject('oh noes!');
```

相反，只抛出（的子类）`Error`：

```ts good
// Throw only Errors
throw new Error('oh noes!');
// ... or subtypes of Error.
class MyError extends Error {}
throw new MyError('my oh noes!');
// For promises
new Promise((resolve) => resolve()); // No reject is OK.
new Promise((resolve, reject) => void reject(new Error('oh noes!')));
Promise.reject(new Error('oh noes!'));
```

##### Catching and rethrowing

捕获错误时，代码**应该**假设所有抛出的错误都是 `Error` 的实例。

```ts good
function assertIsError(e: unknown): asserts e is Error {
  if (!(e instanceof Error)) throw new Error("e is not an Error");
}

try {
  doSomething();
} catch (e: unknown) {
  // All thrown errors must be Error subtypes. Do not handle
  // other possible values unless you know they are thrown.
  assertIsError(e);
  displayError(e.message);
  // or rethrow:
  throw e;
}
```

除非被调用的 API 确定知道会抛出非 `Error` 来违反上述规则，否则异常处理程序**禁止**防御性地处理非 `Error` 类型。在这种情况下，应包含注释以特别识别非 `Error` 的来源。

```ts good
try {
  badApiThrowingStrings();
} catch (e: unknown) {
  // Note: bad API throws strings instead of errors.
  if (typeof e === 'string') { ... }
}
```

**为什么？**

避免过度防御性编程。对一个在大多数代码中不存在的问题重复相同的防御措施会导致无用的样板代码。

##### Empty catch blocks

很少有情况下在响应捕获的异常时什么都不做是正确。当确实适合在 catch 块中完全不采取行动时，应在注释中解释这是正当的理由。

```ts good
  try {
    return handleNumericResponse(response);
  } catch (e: unknown) {
    // Response is not numeric. Continue to handle as text.
  }
  return handleTextResponse(response);
```

不允许：

```ts bad
  try {
    shouldFail();
    fail('expected an error');
  } catch (expected: unknown) {
  }
```

提示：与某些其他语言不同，上面的模式不起作用，因为这会捕获 `fail` 抛出的错误。使用 `assertThrows()` 代替。

### Switch statements

所有 `switch` 语句**必须**包含一个 `default` 语句组，即使它不包含代码。`default` 语句组必须放在最后。

```ts good
switch (x) {
  case Y:
    doSomethingElse();
    break;
  default:
    // nothing to do.
}
```

在 switch 块中，每个语句组要么通过 `break`、`return` 语句或抛出异常突然终止，要么通过抛出一个异常。非空语句组（`case ...`）**禁止** fall through（由编译器强制）：

```ts bad
switch (x) {
  case X:
    doSomething();
    // fall through - not allowed!
  case Y:
    // ...
}
```

空的语句组允许 fall through：

```ts good
switch (x) {
  case X:
  case Y:
    doSomething();
    break;
  default: // nothing to do.
}
```

### Equality checks

始终使用严格相等（`===`）和不等于（`!==`）。双等运算符会导致容易出错的类型强制转换，难以理解，且对 JavaScript 虚拟机实现起来更慢。另请参阅 JavaScript 相等表。

```ts bad
if (foo == 'bar' || baz != bam) {
  // Hard to understand behaviour due to type coercion.
}
```

```ts good
if (foo === 'bar' || baz !== bam) {
  // All good here.
}
```

**异常**：与字面量 `null` 值的比较**可以**使用 `==` 和 `!=` 运算符来同时覆盖 `null` 和 `undefined` 值。

```ts good
if (foo == null) {
  // Will trigger when foo is null or undefined.
}
```

### Type and non-nullability assertions

类型断言（`x as SomeType`）和非空断言（`y!`）是不安全的。两者都只是让 TypeScript 编译器静音，但不会插入任何运行时检查来匹配这些断言，因此可能导致程序在运行时崩溃。

因此，如果没有明显或明确的原因，**不应该**使用类型和非空断言。

不要使用以下形式：

```ts bad
(x as Foo).foo();

y!.bar();
```

当你想断言类型或非空性时，最好的答案是编写一个执行该检查的显式运行时检查。

```ts good
// assuming Foo is a class.
if (x instanceof Foo) {
  x.foo();
}

if (y) {
  y.bar();
}
```

有时由于代码的某些局部属性，你可以确定断言形式是安全的。在那些情况下，你应该添加说明来解释为什么你可以接受不安全的行为：

```ts good
// x is a Foo, because ...
(x as Foo).foo();

// y cannot be null, because ...
y!.bar();
```

如果类型或非空断言背后的推理是显而易见的，注释**可以**不是必需的。例如，生成的 proto 代码总是可空的，但可能在代码上下文中众所周知某些字段总是由后端提供。根据你的判断。

##### Type assertion syntax

类型断言**必须**使用 `as` 语法（而不是尖括号语法）。这会在访问成员时强制在断言周围添加括号。

```ts bad
const x = (<Foo>z).length;
const y = <Foo>z.length;
```

```ts good
// z must be Foo because ...
const x = (z as Foo).length;
```

##### Double assertions

TypeScript 只允许类型断言转换为更具体或更不具体的类型版本。添加不满足此条件的类型断言将给出错误："类型 'X' 到类型 'Y' 的转换可能是错误的，因为两种类型都不足以重叠。"

如果你确定断言是安全的，可以执行*双重断言*。这涉及通过 `unknown` 转换，因为它比所有类型都不具体。

```ts good
// x is a Foo here, because...
(x as unknown as Foo).fooMethod();
```

使用 `unknown`（而不是 `any` 或 `{}`）作为中间类型。

##### Type assertions and object literals

使用类型注解（`: Foo`）而不是类型断言（`as Foo`）来指定对象字面量的类型。这允许在接口字段随时间变化时检测重构错误。

```ts bad
interface Foo {
  bar: number;
  baz?: string;  // was "bam", but later renamed to "baz".
}

const foo = {
  bar: 123,
  bam: 'abc',  // no error!
} as Foo;

function func() {
  return {
    bar: 123,
    bam: 'abc',  // no error!
  } as Foo;
}
```

```ts good
interface Foo {
  bar: number;
  baz?: string;
}

const foo: Foo = {
  bar: 123,
  bam: 'abc',  // complains about "bam" not being defined on Foo.
};

function func(): Foo {
  return {
    bar: 123,
    bam: 'abc',   // complains about "bam" not being defined on Foo.
  };
}
```

### Keep try blocks focused

在不损害可读性的情况下，限制 try 块内的代码量。

```ts bad
try {
  const result = methodThatMayThrow();
  use(result);
} catch (error: unknown) {
  // ...
}
```

```ts good
let result;
try {
  result = methodThatMayThrow();
} catch (error: unknown) {
  // ...
}
use(result);
```

将非抛出行移出 try/catch 块可以帮助读者了解哪个方法抛出异常。某些不抛出异常的 inline 调用可以保留在里面，因为它们可能不值得额外的临时变量的复杂性。

**异常**：如果 try 块在循环内，会有性能问题。扩大 try 块以覆盖整个循环是可以的。

## Decorators

装饰器是带有 `@` 前缀的语法，如 `@MyDecorator`。

不要定义新的装饰器。只使用框架定义的装饰器：

- Angular（例如 `@Component`、`@NgModule` 等）
- Polymer（例如 `@property`）

**为什么？**

我们通常要避免装饰器，因为它们是实验性功能，已偏离 TC39 提案，并且有已知不会修复的错误。

使用装饰器时，装饰器**必须**紧跟在其装饰的符号前面，两者之间没有空行：

```ts
/** JSDoc comments go before decorators */
@Component({...})  // Note: no empty line after the decorator.
class MyComp {
  @Input() myField: string;  // Decorators on fields may be on the same line...

  @Input()
  myOtherField: string;  // ... or wrap.
}
```

## Disallowed features

### Wrapper objects for primitive types

TypeScript 代码**禁止**实例化原始类型 `String`、`Boolean` 和 `Number` 的包装器类。包装器类有令人惊讶的行为，例如 `new Boolean(false)` 求值为 `true`。

```ts bad
const s = new String('hello');
const b = new Boolean(false);
const n = new Number(5);
```

包装器可以调用作为强制转换（比使用 `+` 或连接空字符串更可取）或创建符号。另请参阅类型强制转换了解更多信息。

### Automatic Semicolon Insertion

不要依赖自动分号插入（ASI）。使用分号显式结束所有语句。这可以防止由于不正确的分号插入而导致的错误，并确保与有限 ASI 支持的工具（如 clang-format）兼容。

### Const enums

代码**禁止**使用 `const enum`；使用普通的 `enum` 代替。

**为什么？**

TypeScript 枚举已经是不可变的；`const enum` 是一个与优化相关的单独语言功能，使枚举对 JavaScript 模块用户不可见。

### Debugger statements

**禁止**在生产代码中包含 debugger 语句。

```ts bad
function debugMe() {
  debugger;
}
```

### `with`

不要使用 `with` 关键字。它使你的代码更难理解，并且自 ES5 以来已在严格模式中禁止。

### Dynamic code evaluation

不要使用 `eval` 或 `Function(...string)` 构造函数（代码加载器除外）。这些功能具有潜在危险性，在使用严格内容安全策略的环境中根本无法工作。

### Non-standard features

不要使用非标准的 ECMAScript 或 Web 平台功能。

这包括：

- 已被标记为弃用或完全从 ECMAScript / Web 平台移除的旧功能
- 尚未标准化的新 ECMAScript 功能
  - 避免使用当前 TC39 工作草案中或当前处于提案流程中的功能
  - 只使用当前 ECMA-262 规范中定义的 ECMAScript 功能
- 已提出但尚未完成的 Web 标准
  - 尚未完成提案流程的 WHATWG 提案
- 非标准语言"扩展"（例如某些外部转译器提供的）
- 针对特定 JavaScript 运行时的项目（如 latest-Chrome-only、Chrome 扩展、Node.JS、Electron）显然可以使用这些 API。在考虑仅在某些浏览器中实现的专有 API 表面时要谨慎；考虑是否有可以为你抽象这个 API 表面的通用库。

### Modifying builtin objects

永远不要修改内置类型，无论是通过向其构造函数添加方法还是向其原型添加方法。避免依赖这样做的库。

除非绝对必要（例如第三方 API 需要），否则不要向全局对象添加符号。

# 类型系统

## Type inference

代码**可以**依赖 TypeScript 编译器的类型推断来处理所有类型表达式（变量、字段、返回类型等）。

```ts good
const x = 15;  // Type inferred.
```

对于可以轻松推断的类型（初始化为 `string`、`number`、`boolean`、`RegExp` 字面量或 `new` 表达式的变量或参数），省略类型注解。

```ts bad
const x: boolean = true;  // Bad: 'boolean' here does not aid readability
```

```ts bad
// Bad: 'Set' is trivially inferred from the initialization
const x: Set<string> = new Set();
```

显式指定类型可能需要防止泛型类型参数被推断为 `unknown`。例如，使用没有值初始化泛型类型时（如空数组、对象、`Map` 或 `Set`）。

```ts good
const x = new Set<string>();
```

对于更复杂的表达式，类型注解可以帮助提高程序的可读性：

```ts bad
// Hard to reason about the type of 'value' without an annotation.
const value = await rpc.getSomeValue().transform();
```

```ts good
// Can tell the type of 'value' at a glance.
const value: string[] = await rpc.getSomeValue().transform();
```

是否需要注解由代码审查者决定。

### Return types

是否为函数和方法包含返回类型注解取决于代码作者。审查者**可以**要求注解以澄清难以理解的复杂返回类型。项目**可以**有本地策略要求始终包含返回类型，但这不是一般的 TypeScript 风格要求。

显式输入函数和方法的隐式返回值有两个好处：

- 为代码读者提供更精确的文档。
- 如果未来有改变函数返回类型的代码更改，可以更快地发现潜在类型错误。

## Undefined and null

TypeScript 支持 `undefined` 和 `null` 类型。可空类型可以构造为联合类型（`string|null`）；`undefined` 也是如此。没有 `undefined` 和 `null` 联合的特殊语法。

TypeScript 代码可以使用 `undefined` 或 `null` 来表示值的缺失，没有一般性指导优先选择其中一个。许多 JavaScript API 使用 `undefined`（如 `Map.get`），而许多 DOM 和 Google API 使用 `null`（如 `Element.getAttribute`），因此适当的缺失值取决于上下文。

### Nullable/undefined type aliases

类型别名**禁止**在联合类型中包含 `|null` 或 `|undefined`。可空别名通常表示空值正在通过太多应用程序层传递，这模糊了导致 `null` 的原始问题的来源。它们还使类或接口上的特定值何时可能缺失变得不清楚。

相反，代码**必须**只在实际使用别名时添加 `|null` 或 `|undefined`。代码**应该**在值出现的附近处理空值。

```ts bad
// Bad
type CoffeeResponse = Latte|Americano|undefined;

class CoffeeService {
  getLatte(): CoffeeResponse { ... };
}
```

```ts good
// Better
type CoffeeResponse = Latte|Americano;

class CoffeeService {
  getLatte(): CoffeeResponse|undefined { ... };
}
```

### Prefer optional over `|undefined`

此外，TypeScript 支持使用 `?` 的可选参数和字段的特殊构造：

```ts good
interface CoffeeOrder {
  sugarCubes: number;
  milk?: Whole|LowFat|HalfHalf;
}

function pourCoffee(volume?: Milliliter) { ... }
```

可选参数在其类型中隐式包含 `|undefined`。但是，它们是不同的，因为在构造值或调用方法时可以省略。例如，`{sugarCubes: 1}` 是一个有效的 `CoffeeOrder`，因为 `milk` 是可选的。

使用可选字段（在接口或类上）和参数而不是 `|undefined` 类型。

对于类，最好避免这种模式，尽可能多地初始化字段。

```ts good
class MyClass {
  field = '';
}
```

## Use structural types

TypeScript 的类型系统是结构化的，不是名义上的。也就是说，如果值至少具有类型要求的所有属性，并且属性的类型匹配（递归地），则值匹配类型。

在提供基于结构的实现时，在符号的声明处显式包含类型（这允许更精确的类型检查和错误报告）。

```ts good
const foo: Foo = {
  a: 123,
  b: 'abc',
}
```

```ts bad
const badFoo = {
  a: 123,
  b: 'abc',
}
```

使用接口定义结构类型，而不是类

```ts good
interface Foo {
  a: number;
  b: string;
}

const foo: Foo = {
  a: 123,
  b: 'abc',
}
```

```ts bad
class Foo {
  readonly a: number;
  readonly b: number;
}

const foo: Foo = {
  a: 123,
  b: 'abc',
}
```

**为什么？**

上面的"badFoo"对象依赖于类型推断。可以向"badFoo"添加额外字段，类型是根据对象本身推断的。

当将"badFoo"传递给接受"Foo"的函数时，错误会在函数调用点，而不是在对象声明点。当跨广泛代码库更改接口表面时，这也很有用。

## Prefer interfaces over type literal aliases

TypeScript 支持为类型表达式命名提供类型别名。这可用于命名原始类型、联合、元组和任何其他类型。

但是，声明对象的类型时，使用接口而不是对象字面量表达式的类型别名。

```ts good
interface User {
  firstName: string;
  lastName: string;
}
```

```ts bad
type User = {
  firstName: string,
  lastName: string,
}
```

**为什么？**

这些形式几乎相同，所以根据从两种形式中选择一种以防止变化的原则，我们应该选择一种。此外，也有有趣的技术原因倾向于接口。

## `Array<T>` Type

对于简单类型（只包含字母数字字符和点），使用数组的语法糖 `T[]` 或 `readonly T[]`，而不是更长的形式 `Array<T>` 或 `ReadonlyArray<T>`。

对于简单类型的多维非 `readonly` 数组，使用语法糖形式（`T[][]`、`T[][][]` 等），而不是更长的形式。

对于任何更复杂的情况，使用更长的形式 `Array<T>`。

这些规则适用于嵌套的每一级，即嵌套在更复杂类型中的简单 `T[]` 仍然拼写为 `T[]`，使用语法糖。

```ts good
let a: string[];
let b: readonly string[];
let c: ns.MyObj[];
let d: string[][];
let e: Array<{n: number, s: string}>;
let f: Array<string|number>;
let g: ReadonlyArray<string|number>;
let h: InjectionToken<string[]>;  // Use syntax sugar for nested types.
let i: ReadonlyArray<string[]>;
let j: Array<readonly string[]>;
```

```ts bad
let a: Array<string>;  // The syntax sugar is shorter.
let b: ReadonlyArray<string>;
let c: Array<ns.MyObj>;
let d: Array<string[]>;
let e: {n: number, s: string}[];  // The braces make it harder to read.
let f: (string|number)[];         // Likewise with parens.
let g: readonly (string | number)[];
let h: InjectionToken<Array<string>>;
let i: readonly string[][];
let j: (readonly string[])[];
```

## Indexable types / index signatures (`{[key: string]: T}`)

在 JavaScript 中，通常使用对象作为关联数组（又名"map"、"hash"或"dict"）。这些对象可以使用 TypeScript 中的索引签名（`[k: string]: T`）来类型化：

```ts
const fileSizes: {[fileName: string]: number} = {};
fileSizes['readme.txt'] = 541;
```

在 TypeScript 中，为键提供一个有意义的标签。（标签仅用于文档；否则不使用。）

```ts bad
const users: {[key: string]: number} = ...;
```

```ts good
const users: {[userName: string]: number} = ...;
```

> 考虑使用 ES6 的 `Map` 和 `Set` 类型而不是这些。JavaScript 对象有令人惊讶的不良行为，而 ES6 类型更明确地传达你的意图。此外，`Map` 可以用——而 `Set` 可以包含——除了 `string` 之外的类型的键。

TypeScript 的内置 `Record<Keys, ValueType>` 类型允许使用一组定义的键构造类型。这与关联数组不同，因为键是静态知道的。

## Mapped and conditional types

TypeScript 的映射类型和条件类型允许基于其他类型指定新类型。TypeScript 标准库包含几个基于这些的类型运算符（`Record`、`Partial`、`Readonly` 等）。

这些类型系统特性允许简洁地指定类型并构造强大而类型安全的抽象。但它们也有很多缺点：

- 与显式指定属性和类型关系（例如使用接口和扩展）相比，类型运算符要求读者在心中评估类型表达式。这会使程序更难阅读，特别是与跨文件边界的类型推断和表达式结合时。
- 映射和条件类型的求值模型，特别是与类型推断结合时，是未指定的，并非总是被很好地理解，并且经常在 TypeScript 编译器版本中更改。代码可以"意外"编译或似乎给出正确结果。这增加了使用类型运算符的代码的未来支持成本。
- 映射和条件类型在从复杂和/或推断类型派生类型时最强大。另一方面，这也是它们最容易创建难以理解和维护的程序的时候。
- 一些语言工具不能很好地与这些类型系统特性一起工作。例如，你的 IDE 的查找引用（以及重命名属性重构）不会在 `Pick<T, Keys>` 类型中找到属性，代码搜索也不会将它们超链接。

风格建议：

- 始终使用可以表达代码的最简单类型构造。
- 一点重复或冗长通常比复杂类型表达式的长期成本要便宜得多。
- 映射和条件类型可以按照这些考虑来使用。

例如，TypeScript 的内置 `Pick<T, Keys>` 类型允许通过子集化另一个类型 `T` 来创建新类型，但简单的接口扩展通常更容易理解。

## `any` Type

TypeScript 的 `any` 类型是所有其他类型的超类型和子类型，并允许取消引用所有属性。因此，`any` 是危险的——它可以掩盖严重的编程错误，其使用从一开始就破坏了静态类型的价值。

**考虑*不*要使用 `any`**。在你想要使用 `any` 的情况下，考虑以下之一：

- 提供更具体的类型
- 使用 `unknown`
- 抑制 lint 警告并记录原因

### Providing a more specific type

使用接口、内联对象类型或类型别名：

```ts good
// Use declared interfaces to represent server-side JSON.
declare interface MyUserJson {
  name: string;
  email: string
}

// Use type aliases for types that are repetitive to write.
type MyType = number|string;

// Or use inline object types for complex returns.
function getTwoThings(): {something: number, other: string} {
  // ...
  return {something, other};
}

// Use a generic type, where otherwise a library would say `any` to represent
// they don't care what type the user is operating on (but note "Return type
// only generics" below).
function nicestElement<T>(items: T[]): T {
  // Find the nicest element in items.
  // Code can also put constraints on T, e.g. <T extends HTMLElement>.
}
```

### Using `unknown` over `any`

`any` 类型允许赋值到任何其他类型并取消引用其上的任何属性。通常这种行为不是必要或期望的，代码只需要表达类型是未知的。在那种情况下使用内置类型 `unknown`——它表达了这个概念，而且更安全，因为它不允许取消引用任意属性。

```ts good
// Can assign any value (including null or undefined) into this but cannot
// use it without narrowing the type or casting.
const val: unknown = value;
```

```ts bad
const danger: any = value /* result of an arbitrary expression */;
danger.whoops();  // This access is completely unchecked!
```

要安全地使用 `unknown` 值，使用类型守卫缩小类型。

### Suppressing `any` lint warnings

有时使用 `any` 是合理的，例如在测试中构造模拟对象。在这种情况下，添加一个注释来抑制 lint 警告，并记录为什么它是合理的。

```ts good
// This test only needs a partial implementation of BookService, and if
// we overlooked something the test will fail in an obvious way.
// This is an intentionally unsafe partial mock
// tslint:disable-next-line:no-any
const mockBookService = ({get() { return mockBook; }} as any) as BookService;
// Shopping cart is not used in this test
// tslint:disable-next-line:no-any
const component = new MyComponent(mockBookService, /* unused ShoppingCart */ null as any);
```

## `{}` Type

`{}` 类型，也称为*空接口*类型，表示没有属性的接口。空接口类型没有指定属性，因此任何非空值都可以赋值给它。

```ts bad
let player: {};

player = {
  health: 50,
}; // Allowed.

console.log(player.health) // Property 'health' does not exist on type '{}'.
```

```ts bad
function takeAnything(obj:{}) {

}

takeAnything({});
takeAnything({ a: 1, b: 2 });
```

Google3 代码**不应该**将 `{}` 用于大多数用例。`{}` 代表任何非空原始类型或对象类型，这很少是合适的。优先选择以下更描述性的类型之一：

- `unknown` 可以保存任何值，包括 `null` 或 `undefined`，对于不透明值通常更合适。
- `Record<string, T>` 用于类似字典的对象，并通过对包含值的类型 `T`（它本身可能是 `unknown`）更明确来提供更好的类型安全。
- `object` 也排除原始类型，只留下非空函数和对象，但不对可能可用的属性做出任何其他假设。

## Tuple types

如果你想创建 Pair 类型，改用元组类型：

```ts bad
interface Pair {
  first: string;
  second: string;
}
function splitInHalf(input: string): Pair {
  ...
  return {first: x, second: y};
}
```

```ts good
function splitInHalf(input: string): [string, string] {
  ...
  return [x, y];
}

// Use it like:
const [leftHalf, rightHalf] = splitInHalf('my string');
```

然而，通常为属性提供有意义的名称会更清晰。

如果声明 `interface` 太重，你可以使用内联对象字面量类型：

```ts good
function splitHostPort(address: string): {host: string, port: number} {
  ...
}

// Use it like:
const address = splitHostPort(userAddress);
use(address.port);

// You can also get tuple-like behavior using destructuring:
const {host, port} = splitHostPort(userAddress);
```

## Wrapper types

有几类与 JavaScript 原始类型相关的类型*不应该*被使用：

- `String`、`Boolean` 和 `Number` 与相应的原始类型 `string`、`boolean` 和 `number` 有不同的含义。始终使用小写版本。
- `Object` 与 `{}` 和 `object` 有相似之处，但稍松。对于包含除 `null` 和 `undefined` 之外的所有内容的类型使用 `{}`，或使用小写 `object` 进一步排除其他原始类型（上述三个，加上 `symbol` 和 `bigint`）。

此外，永远不要使用 `new` 作为构造函数调用包装器类型。

## Return type only generics

避免创建仅返回类型的泛型 API。使用具有仅返回类型泛型的现有 API 时，始终显式指定泛型。

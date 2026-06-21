# 源文件基础

## 文件编码：UTF-8

源文件使用 **UTF-8** 编码。除换行符序列外，ASCII 水平空格字符 (0x20) 是源文件中唯一出现的空白字符。这意味着字符串字面量中的所有其他空白字符都必须使用转义序列。

### 空白字符

除换行符序列外，ASCII 水平空格字符 (0x20) 是源文件中唯一允许的空白字符。这适用于源文件的任何位置。

### 特殊转义序列

对于任何有特殊转义序列的字符（`\'`、`\"`、`\\`、`\b`、`\f`、`\n`、`\r`、`\t`、`\v`），必须使用该序列而非对应的数字转义（如 `\x0a`、`\u000a` 或 `\u{a}`）。禁止使用八进制转义。

### 非 ASCII 字符

对于其余非 ASCII 字符，使用实际的 Unicode 字符（例如 `∞`）。对于不可打印字符，可以配合说明性注释使用等效的十六进制或 Unicode 转义序列（例如 `\u221e`）。

```ts good
// Perfectly clear, even without a comment.
const units = 'μs';

// Use escapes for non-printable characters.
const output = '\ufeff' + content;  // byte order mark
```

```ts bad
// Hard to read and prone to mistakes, even with the comment.
const units = '\u03bcs'; // Greek letter mu, 's'

// The reader has no idea what this is.
const output = '\ufeff' + content;
```

# Common Utilities

> Source files:
> - `src/utils/common.ts` : 1-21

## Overview

Common 模块提供跨层共享的通用工具函数，目前仅包含路径标准化函数 `normalizePath`。该函数在 memory 子系统中被 `flattenCwdPath` 调用，用于将 Windows 反斜杠路径和混合分隔符路径统一为正斜杠规范形式，确保路径比较、哈希键生成和文件系统操作的一致性。

**设计动机**：Furina 在 Windows 和 Unix 平台上运行，不同平台路径分隔符不同（Windows 使用 `\`，Unix 使用 `/`）。在路径被用于 JSON 注册表键名、目录遍历或跨平台比较时，需要统一为规范格式。`normalizePath` 作为底层工具函数，为上层业务逻辑屏蔽平台差异。

**涉及源文件及职责**：
- `src/utils/common.ts`：提供 `normalizePath` 函数，将任意路径字符串转换为正斜杠、无尾斜杠的规范形式

## Architecture / Flow

```
normalizePath(inputPath)
    |
    +---> replace(/\\/g, '/')      // 反斜杠 -> 正斜杠
    +---> replace(/\/+/g, '/')     // 连续斜杠合并为单斜杠
    +---> replace(/\/$/, '')       // 去除尾部斜杠
    |
    v
返回规范化路径 (string)
```

## Functionality / Interface Details

### `normalizePath(p: string): string`

**Source**: `src/utils/common.ts`:15-20

**Functionality**: 将文件系统路径字符串标准化为统一格式。执行三步转换：(1) 将所有反斜杠 `\` 替换为正斜杠 `/`，(2) 将连续多个正斜杠合并为单个正斜杠，(3) 去除尾部正斜杠。Windows 驱动器盘符（如 `C:`）在替换后自然保留，无需特殊处理。

**Parameters**:
- `p` (`string`): 原始路径字符串，可能包含混合或重复的路径分隔符（如 `C:\\Users\\foo//bar/`）

**Return Value**:
- `string`: 标准化后的路径，使用正斜杠、无连续斜杠、无尾部斜杠（如 `C:/Users/foo/bar`）

**Core Logic**:
函数通过三次链式 `replace` 调用依次完成三种标准化操作。使用正则表达式 `/\\/g` 全局替换反斜杠，`/\/+/g` 匹配一个或多个连续正斜杠并替换为单个正斜杠，`/\/$/` 匹配字符串末尾的单个正斜杠并移除。这三步顺序不可交换：先统一斜杠方向，再合并，最后去除尾部。

**Core Code**:
```typescript
export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')       // unify backslashes
    .replace(/\/+/g, '/')      // collapse consecutive slashes
    .replace(/\/$/, '');       // strip trailing slash
}
```
Source: `src/utils/common.ts`:15-20

**Usage Example**:
```typescript
import { normalizePath } from './utils/common.js';

normalizePath('C:\\Users\\me\\project')       // => "C:/Users/me/project"
normalizePath('/home/user//project/')          // => "/home/user/project"
normalizePath('D:\\code\\\\foo\\\\bar\\')      // => "D:/code/foo/bar"
```
Explanation: 将 Windows 风格路径 `C:\Users\me\project` 转换为 `C:/Users/me/project`，去除尾部斜杠和合并连续斜杠。

## Data Structures

本模块不定义任何数据结构或类型，仅导出一个纯函数。

## Error Handling and Edge Cases

- **空字符串输入**：`normalizePath('')` 返回空字符串 `''`，三次 replace 对空字符串均无操作
- **仅含分隔符的输入**：`normalizePath('\\\\')` 或 `normalizePath('///')` 返回空字符串（所有斜杠被合并为一个后被尾部去除）
- **Windows 盘符路径**：`normalizePath('C:\\')` 返回 `C:`，盘符自然保留
- **无分隔符的纯文件名**：`normalizePath('file.txt')` 返回 `file.txt`，无任何变化
- **网络路径**：`normalizePath('\\\\server\\share')` 返回 `//server/share`，前导双斜杠被合并为单斜杠（注意：这会丢失 UNC 路径的双斜杠语义，但在本项目中无此场景）

## Dependencies

- **Depends on**：无外部依赖，仅使用 JavaScript 内置的 `String.prototype.replace`

- **Depended by**：
  - `src/utils/memory.ts`：`flattenCwdPath` 函数内部调用 `normalizePath` 将 `cwd` 标准化后用于 `~/.furina/memory/{flatCwd}/` 目录路径的生成

## Usage Examples

```typescript
import { normalizePath } from './utils/common.js';

// 在 memory 子系统中用于路径规范化
const cwd = process.cwd(); // Windows 下返回 "D:\project-code\llm\furina"
const flatCwd = normalizePath(cwd).replace(/\//g, '_').replace(/:/g, '');
// => "D_project-code_llm_furina"

// 用于构建全局内存目录路径
const memoryDir = path.join(os.homedir(), '.furina', 'memory', flatCwd);
```

Explanation: 在 memory 子系统中，`normalizePath` 是 `flattenCwdPath` 的第一步——先将 `cwd` 中的反斜杠统一为正斜杠，再将正斜杠替换为下划线生成扁平目录名，用于存储各项目在全局内存中的隔离目录。

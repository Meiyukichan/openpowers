
### 代码风格

- 使用 Node.js ES 模块
- 对于 第三方库或有多个导出 的模块，使用命名空间导入
- **对于 Node.js 内置模块，必须使用默认导入，比如 `import fs from 'fs'`**
- 使用单引号（'）
- 禁止使用console.log，通过logger输出日志
- **缩进风格必须采用 2 个空格缩进**
- 代码中的所有注释、日志、打印提示等，都需要使用英文
- 禁止使用console.log打印日志；要使用专门的日志框架，然后日志需要输出到文件，文件为Openpowers的安装目录
- 推荐在使用 execSync 时配置 cwd 参数
- 涉及路径拼接，使用系统兼容的path.join
- 所有写入JSON的操作，必须格式化，incident=2

### 文档注释和版权

- 使用 TypeScript 官方推荐的 JSDoc 注释
- 文件头部声明采用如下样式：
  ```ts
  /**
   * Brief description of this file
   * @author Meiyuki <meiyukichan@163.com>
   * @copyright {当前年份} Meiyuki
   */
  ```
- 类、main方法、`export`方法、以及确实重要的方法必须要有 JSDoc 注释，对于常量则使用行前'//'注释
  
### 文件行数
- 普通业务文件：300-500 行，大多数情况下的理想范围
- 组件/类文件：200-300 行，保持职责单一，易于测试
- 工具/配置文件：100-200 行，通常较简单，不宜过长
- 大型模块：不超过 800 行，如必须超过，需有充分理由

### 测试用例

- 测试用例和被测文件同目录，文件名增加.test，比如 ipc.ts -> ipc.test.ts

## 安全规则

- **禁止使用任何 rm、rm -rf、del 等任何用于删除文件/目录的破坏性命令**，建议使用Python或者js脚本删除。

## 代码编写前执行

- 编写 TypeScript 代码之前，必须调用 skill: typescript-standards-navigator 进行编码规范约束

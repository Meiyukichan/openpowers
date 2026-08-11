# 代码风格

## TypeScript

- 推荐使用 Node.js ES 模块
- 对于 第三方库或有多个导出 的模块，使用命名空间导入
- **对于 Node.js 内置模块，必须使用默认导入，比如 `import fs from 'fs'`**
- 使用单引号（'）
- 显式使用分号
- 禁止使用console.log，通过logger输出日志
- **TypeScript 的缩进风格必须采用 2 个空格缩进**

## 文档注释和版权

- 使用 TypeScript 官方推荐的 JSDoc 注释
- 文件头部声明采用如下样式：
  ```ts
  /**
   * Brief description of this file
   * @author {author} {author email}
   * @copyright {当前年份} {author}
   */
  ```
- 类、main方法、`export`方法、以及确实重要的方法必须要有 JSDoc 注释，对于常量则使用行前'//'注释

## 文件行数
- 普通业务文件：300-500 行，大多数情况下的理想范围
- 组件/类文件：200-300 行，保持职责单一，易于测试
- 工具/配置文件：100-200 行，通常较简单，不宜过长
- 大型模块：不超过 800 行，如必须超过，需有充分理由

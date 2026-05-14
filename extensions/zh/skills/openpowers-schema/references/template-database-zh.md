# [产品名称] - 数据库设计

## 文档信息
- **版本**：1.0
- **最后更新**：[日期]
- **数据库类型**：[例如，PostgreSQL、MySQL、SQLite、MongoDB]

## 1. 数据库概述

### 1.1 数据库选择理由
[为什么选择此数据库]

### 1.2 模式图
[关系的文本表示]

```
users (1) ---> (N) posts
users (1) ---> (N) comments
posts (1) ---> (N) comments
```

## 2. 表定义

[对每个表：]

### 表：`[table_name]`

**用途**：[此表存储什么]

**列：**

| 列 | 类型 | 约束 | 描述 |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | 唯一标识符 |
| name | VARCHAR(255) | NOT NULL | 用户姓名 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 用户邮箱 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 最后更新时间 |

**索引：**
- `idx_email` on `email` - 用于快速邮箱查找
- `idx_created_at` on `created_at` - 用于按日期排序

**外键：**
- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

**示例 SQL：**
```sql
CREATE TABLE table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email ON table_name(email);
```

## 3. 关系

[描述表之间的关键关系]

- **users → posts**：一对多（一个用户可以有多个帖子）
- **posts → comments**：一对多（一个帖子可以有多个评论）

## 4. 数据完整性规则

[在数据库层面强制执行的业务规则]

## 5. 迁移策略

[如何管理模式变更]

## 6. 备份与恢复

[备份频率、保留策略]

## 7. 性能考量

[查询优化说明、缓存策略]


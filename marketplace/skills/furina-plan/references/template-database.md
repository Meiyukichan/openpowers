# [Product Name] - Database Design

## Document Information
- **Version**: 1.0
- **Last Updated**: [Date]
- **Database Type**: [e.g., PostgreSQL, MySQL, SQLite, MongoDB]

## 1. Database Overview

### 1.1 Database Choice Rationale
[Why this database was chosen]

### 1.2 Schema Diagram
[Text representation of relationships]

```
users (1) ---> (N) posts
users (1) ---> (N) comments
posts (1) ---> (N) comments
```

## 2. Table Definitions

[For each table:]

### Table: `[table_name]`

**Purpose**: [What this table stores]

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | User's name |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User's email |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_email` on `email` - For fast email lookups
- `idx_created_at` on `created_at` - For sorting by date

**Foreign Keys:**
- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

**Example SQL:**
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

## 3. Relationships

[Describe key relationships between tables]

- **users → posts**: One-to-many (one user can have many posts)
- **posts → comments**: One-to-many (one post can have many comments)

## 4. Data Integrity Rules

[Business rules enforced at database level]

## 5. Migration Strategy

[How schema changes will be managed]

## 6. Backup and Recovery

[Backup frequency, retention policy]

## 7. Performance Considerations

[Query optimization notes, caching strategy]

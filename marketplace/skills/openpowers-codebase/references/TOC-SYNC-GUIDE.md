# Index File (toc.md) Sync Update Guidelines

> **Important Reminder**: Before updating any toc.md file, **you must re-read this file** and strictly follow all the specifications below.
>
> This specification is fully consistent with `openpowers-codebase-generator`'s toc.md generation rules, ensuring that index files updated via `openpowers-codebase-sync` can be seamlessly queried by `openpowers-codebase-explorer`.

---

## I. Core Principles

1. **Index files are the navigation entry point for the retriever.** Descriptions must be detailed enough to support smooth navigation path: root → module index → submodule index → spec document.
2. **Bottom-up updates.** Update order must be: submodule toc.md → module toc.md → root toc.md. Confirm lower-level content is correct first, then update upper-level indices.
3. **Index files ≤ 500 lines.** They are indices, not detailed documents. Information completeness takes priority over line count control, but keep them as concise as possible.
4. **Each entry must have a detailed description**, not just a name. Descriptions should explain responsibility, coverage scope, and key features.
5. **All links use relative paths.**

---

## II. Three-Level toc.md Format Specification

### 2.1 Root toc.md

**Path**: `{doc-tree-path}/toc.md`

**Format**:

```markdown
# {ProjectName} — Codebase

> Automatically generated project documentation for `{project-path}`.

## Module Overview

### {Module A Name}

> {Detailed module A introduction: responsibilities, business domains covered, key features}

- **Submodules**
  - `{submodule-1}` — {Detailed submodule 1 introduction: responsibility description, coverage scope} (N specs)
  - `{submodule-2}` — {Detailed submodule 2 introduction: responsibility description, coverage scope} (M specs)
- **Direct Specs**
  - `spec-xxx.md` — {Detailed spec introduction: features/interfaces covered}
  - `spec-yyy.md` — {Detailed spec introduction: features/interfaces covered}
- **Index File**: [ModuleA/toc.md](./module-a/toc.md)

### {Module B Name}

> {Detailed module B introduction: responsibilities, business domains covered, key features}

- **Submodules**
  - `{submodule-3}` — {Detailed submodule 3 introduction: responsibility description, coverage scope} (K specs)
- **Direct Specs**
  - `spec-zzz.md` — {Detailed spec introduction: features/interfaces covered}
- **Index File**: [ModuleB/toc.md](./module-b/toc.md)
```

**Key Requirements**:
- Each module must include detailed introductions for its submodules and direct specs
- Introductions should explain responsibility and coverage scope, not just names
- Descriptions must be detailed enough to support retriever navigation
- **Do not** add any statistics section at the end of the root toc (e.g., "Generation Statistics", "Document Statistics", etc.)

### 2.2 Module toc.md

**Path**: `{doc-tree-path}/{module}/toc.md`

**Format**:

```markdown
# {Module Readable Name}

> {Detailed module introduction: responsibilities, business domains covered, key features}

## Module Relationship Diagram

```
┌─────────────────────────┐
│     {SubmoduleA / Direct spec name} │
│     {Description or responsibility}  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│     {SubmoduleB / Direct spec name} │
│     {Description or responsibility}  │
└─────────────────────────┘
```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [submodule-1/](./submodule-1/) | {Detailed description: responsibility description, coverage scope} | N specs | [toc.md](./submodule-1/toc.md) |
| [submodule-2/](./submodule-2/) | {Detailed description: responsibility description, coverage scope} | M specs | [toc.md](./submodule-2/toc.md) |

## Direct Spec Documents

| Spec | Description | Source File |
|------|-------------|-------------|
| [spec-zzz.md](./spec-zzz.md) | {Detailed description: features/interfaces covered} | `src/.../file.ts` |
```

**Key Requirements**:
- Module relationship diagram uses ASCII box-drawing characters to show call/dependency relationships between submodules
- Submodule table includes: name link, detailed description, spec count, index file link
- Direct spec table includes: name link, detailed description, source file path

### 2.3 Submodule toc.md

**Path**: `{doc-tree-path}/{module}/{submodule}/toc.md`

**Format**:

```markdown
# {Submodule Readable Name}

> {Detailed submodule introduction: responsibility description, coverage scope}

## Spec Relationship Diagram

```
┌─────────────────────────┐
│       {Spec A Name}              │
│       {Feature summary covered}   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│       {Spec B Name}              │
│       {Feature summary covered}   │
└─────────────────────────┘
```

## Spec Documents

| Spec | Description | Source File |
|------|-------------|-------------|
| [spec-xxx.md](./spec-xxx.md) | {Detailed description: features/interfaces covered} | `src/.../file.ts` |
| [spec-yyy.md](./spec-yyy.md) | {Detailed description: features/interfaces covered} | `src/.../file2.ts` |
```

**Key Requirements**:
- Spec relationship diagram uses ASCII box-drawing characters to show call/dependency relationships between specs
- Spec table includes: name link, detailed description, source file path

---

## III. Update Rules

### 3.1 Update Rules When Adding a Spec

When adding a new spec document:

1. **Submodule toc.md**: Add a row to the Spec Documents table, including spec name link, detailed description, source file path. Update the Spec Relationship Diagram if necessary.
2. **Module toc.md**: If the spec is under a submodule, update the submodule's spec count. If it's a direct spec under the module, add a row to the Direct Spec Documents table. Update the Module Relationship Diagram if necessary.
3. **Root toc.md**: Add/update detailed introductions for the submodule or direct spec under the corresponding module entry.

### 3.2 Update Rules When Updating a Spec

When updating an existing spec's content (e.g., source file path changes, feature description changes):

1. **Submodule toc.md**: Update the corresponding spec entry's description and/or source file path.
2. **Module toc.md**: If the description has significant changes, sync the update.
3. **Root toc.md**: If the description has significant changes, sync the update.

### 3.3 Update Rules When Adding a Submodule

When adding a new submodule directory:

1. Create the submodule directory and submodule `toc.md` (initial skeleton version).
2. **Module toc.md**: Add a new row to the submodule table, including submodule directory link, detailed description, spec count, index file link. Update the Module Relationship Diagram.
3. **Root toc.md**: Add a new entry to the submodule list under the corresponding module entry.

### 3.4 Update Rules When Deleting a Spec

When a spec document needs to be removed because its source code was deleted:

1. Delete the corresponding spec file.
2. **Submodule toc.md**: Remove the corresponding row from the Spec Documents table. Update the Spec Relationship Diagram if necessary.
3. **Module toc.md**: If the spec is under a submodule, update the submodule's spec count. If it's a direct spec, remove the corresponding row from the Direct Spec Documents table. Update the Module Relationship Diagram if necessary.
4. **Root toc.md**: Remove the spec's detailed introduction from under the corresponding module entry.

### 3.5 Update Rules When Deleting a Submodule

When a deletion operation causes a submodule to have fewer than 5 specs, promote the remaining specs to direct specs under the module and delete the submodule directory:

1. Move remaining spec files from the submodule to the module directory.
2. Delete the submodule directory and its `toc.md`.
3. **Module toc.md**: Remove the submodule row from the submodule table. Add promoted specs to the Direct Spec Documents table. Update the Module Relationship Diagram.
4. **Root toc.md**: Remove the submodule's detailed introduction from under the corresponding module entry, add the promoted spec introductions.

### 3.6 Description Update Rules

All descriptions in toc.md must meet the following requirements:

- **Detail**: Must not just state names — must explain responsibility, coverage scope, key features
- **Navigability**: When a user provides a query description (e.g., "MCP implementation"), they should be able to smoothly locate it through the path root → module index → submodule index → spec document
- **Consistency**: Descriptions of the same module/submodule/spec across different levels of toc.md should remain consistent

---

## IV. ASCII Relationship Diagram Specification

All relationship diagrams use Unicode box-drawing characters, formatted as follows:

```
┌─────────────────────────┐
│       {Name}                    │
│       {Brief description}        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│       {Name}                    │
│       {Brief description}        │
└─────────────────────────┘
```

**Rules**:
- Each box contains a name and brief description
- Arrows use `│` + `▼` to indicate call/dependency direction
- Box width is uniformly 25 characters (including borders)
- Relationship diagrams should reflect actual call or dependency relationships between modules/specs

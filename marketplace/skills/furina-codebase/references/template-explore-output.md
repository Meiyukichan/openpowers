# Output Guide

> **Important reminder**: Before outputting final results, **you must carefully read and understand this document**, and strictly follow all format specifications below. Re-read this document each time before generating results to ensure full compliance.

---

## 1. No-results Handling

If `matched_specs` is empty (Phase 1 hit no modules/specs, or Phase 3 relevance verification filtered out all entries), output the following message and stop:

```
========================================
Query: "{query description}"
Document tree: {document tree path}
Match results: no relevant specs found
========================================

Possible reasons:
1. The query description is not precise enough; try more specific keywords
2. The document tree does not yet cover this feature module
3. The feature may exist in the document tree under a different name
```

---

## 2. Output Structure When Results Exist

Output in the following order and format, with each section separated by `---`:

### 2.1 Query Summary

```
========================================
Query: "{query description}"
Document tree: {document tree path}
Match results: N relevant specs found (M irrelevant entries filtered out)
========================================
```

### 2.2 Navigation Path

Based on each entry's `match_source` and `spec_path` in `matched_specs`, reconstruct the full navigation path from the master index to the spec:

```
Path {number}:
  (master index direct hit) Master index → spec-{feature-name}.md
  (module direct spec) Master index → {module name} → spec-{feature-name}.md
  (submodule spec) Master index → {module name} → {submodule name} → spec-{feature-name}.md
  Match reason: {match_reason}
```

### 2.3 Spec Summary

For each matched spec, output its core content summary (extracted from the spec document):

```
---
## Spec: {spec title}

Source files:
- {source file path} : {line range}

Overview: {spec overview — be more detailed for parts relevant to the queried feature}

Key functions/interfaces:
- {interface 1 signature}: {one-line description}
- {interface 2 signature}: {one-line description}

Core data structures:
- {type name}: {one-line description}
```

### 2.4 Source Code Snippets

For each matched spec, output its complete source code implementation, including both the spec's directly associated source code and upstream/downstream traced source code:

#### Source Code Length Rules

- When the excerpt is ≤ 100 lines, output in full without trimming
- When > 100 lines, non-essential code may be appropriately omitted, but sufficient rich code detail must be retained, especially for core logic. Do not produce output dominated by comments with minimal actual code.

#### [Mandatory] Omission Annotation Requirements (for source code snippets)

When omitting code, the following three conditions must all be met:

1. Write a comment at the omission point explaining which lines were omitted and the logic/function of the original code
2. On the line immediately below the comment, write `...` on its own line — do not put the ellipsis inside the comment
3. Irrelevant comments from the original source should also be omitted (deleted), keeping only the model-generated omission annotation

**Example**:
```typescript
export async function registerTool(def: ToolDef): Promise<void> {
  if (!def.name || typeof def.name !== 'string') {
    throw new Error('tool name must be a non-empty string');
  }
// (lines 15-30 omitted: schema validation and default value population logic)
...
  registry.set(def.name, def);
}
```

#### [Mandatory] Upstream/Downstream Callers (for source code snippets)

Upstream/downstream caller source code snippets are functional references; valuable core snippets should be preserved and not omitted.

#### Source Code Snippet Format Template

````
---
## Source Code: {spec title}

### Direct Source

Source: {file path}:{start line}-{end line} (this excerpt: {end-start+1} lines total)

```{language}
// spec's directly associated source file code
// (lines 25-80 omitted: parameter validation and default value handling logic)
...
```

Description: {what this code does, which feature/interface in the spec it corresponds to}

### Upstream Callers

Source: {caller file path}:{start line}-{end line} (this excerpt: {end-start+1} lines total)

```{language}
// upstream code snippet that calls the above code
```

Description: {how the upstream calls this feature, in what scenario it is triggered}

### Downstream Dependencies

Source: {dependency file path}:{start line}-{end line} (this excerpt: {end-start+1} lines total)

```{language}
// downstream code snippet that this feature depends on
```

Description: {what underlying capabilities this feature depends on, key call relationships}
````

---

## 3. [Mandatory] Source Code Must Be Output

**Every matched spec must output its associated source code snippets** alongside the spec document summary. **Must identify and prioritize the file that carries the core functionality** — do not arbitrarily pick peripheral files or enumerate all related files; determine which file contains the main implementation of the core logic. Even if substantial omissions are needed, core code snippets must be preserved and **must never be left empty**.

Each source code snippet contains three parts, and each must be present:
- **Direct Source**: spec's directly associated source file code
- **Upstream Callers**: upstream code snippets that call this code
- **Downstream Dependencies**: downstream code snippets that this feature depends on

---

## 4. [Mandatory] Pre-output Self-check Checklist

Before outputting final results, check item by item:

1. [ ] "No results" message follows the standard format, with no omissions
2. [ ] Query summary's `========================================` separator line is complete
3. [ ] Each spec has a corresponding `---` separator
4. [ ] Each spec has all three source code snippet sections (direct source, upstream callers, downstream dependencies) — **none may be left empty**
5. [ ] When source code is omitted, the three requirements are met: omission annotation line, `...` on its own line, irrelevant comments deleted
6. [ ] In omission examples, `...` is on its own line, not inside a comment
7. [ ] Upstream/downstream callers retain core snippets and are not omitted
8. [ ] The overview section in the spec summary describes query-relevant features in detail

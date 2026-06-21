# Clean-TS Instruction

Before generating, writing, or modifying any TypeScript code, you must follow the steps below to consult coding standards.

## Output language
{`language`}

## Execution Phases

Execute strictly in the following phases. Do not skip or merge phases.

### Phase 1: Analyze requirements / changes → Identify relevant chapters

Carefully analyze the user's input. First, read [toc.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/toc.md) to understand the full standards catalog, then take different approaches based on the input type:

#### Case A: User provides a requirement description

1. **Understand the requirement**: Read the user's requirement carefully to clarify the feature to implement or behavior to modify.
2. **Derive code features**: Infer which TypeScript code features are likely involved (e.g., defining new classes/interfaces, modifying imports/exports, adding type annotations, writing functions, exception handling, etc.).
3. **Match chapters**: Consult the [Chapter Index](#chapter-index) below to determine which chapters need to be reviewed for this requirement. Examples:
   - Class definitions → "Language Features", "Naming"
   - Type declarations → "Type System"
   - Imports/exports → "Source File Structure"

#### Case B: User provides file content or a file list

1. **Identify changes**: Analyze the changed file content or file list, extracting the code features and syntax structures involved.
2. **Match chapters**: Consult the [Chapter Index](#chapter-index) below to determine the relevant chapters based on the code features. Examples:
   - Changes contain class/function/variable declarations → "Language Features", "Naming"
   - Changes contain type definitions/generics → "Type System"
   - Changes contain imports/exports/module structure → "Source File Structure"
   - Changes contain JSDoc/comments → "Comments & Documentation"
   - Overall file structure changes → "Source File Basics", "Source File Structure"

### Phase 2: Read the standards

Based on the chapter list identified in Phase 1, perform the following steps:

1. **Read detail documents**: Read the detail documents for each identified chapter one by one (paths listed in the [Chapter Index](#chapter-index) below), extracting the points directly relevant to this requirement or change.
2. **Read project coding style**: Required — read [style.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/typescript-core-style.md), which takes top priority.

### Phase 3: Output coding guidelines (final output of this Skill)

Synthesize the standards gathered in Phase 2, then output a coding guidelines document in Markdown. This is the final output of this Skill — do not write to a file; it is for direct reference by subsequent coding steps. Use the following format:

```md
## Coding Guidelines

### 1. Scope

- **Requirement summary**: <one-sentence description of what to implement or modify>
- **Code features affected**: <features identified in Phase 1, e.g., class definitions, type declarations, imports or exports, exception handling>

### 2. Guidelines

Organized by concrete code feature as sub-headings (not chapter names), list each one:

#### <Feature name>

- **Applicable scenario**: <which parts of this requirement or change trigger this rule>
- **Rule**: <one sentence stating the core rule>
- **Good**:
  ```ts
  // compliant
  ```
- **Bad**:
  ```ts
  // non-compliant
  ```

### 3. Project style overrides

- **Source**: [style.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/typescript-core-style.md)
- **Style requirements**: <list project-specific rules relevant to this requirement or change; style.md takes top priority>
```

## Chapter Index

| Chapter | Contents | Detail Document |
|---------|----------|-----------------|
| 1. Source File Basics | UTF-8 encoding, whitespace, escape sequences | [source-file-basics.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/source-file-basics.md) |
| 2. Source File Structure | File ordering, imports/exports, namespaces | [source-file-structure.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/source-file-structure.md) |
| 3. Language Features | Variable declarations, arrays, objects, classes, functions, this, interfaces, etc. | [language-features.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/language-features.md) |
| 4. Naming | Identifiers, camelCase, constant naming | [naming.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/naming.md) |
| 5. Type System | Type inference, any, Array, interface vs type alias | [type-system.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/type-system.md) |
| 6. Toolchain Requirements | Compiler rules, @ts-ignore | [toolchain-requirements.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/toolchain-requirements.md) |
| 7. Comments & Documentation | JSDoc, comment formatting | [comments-and-documentation.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/comments-and-documentation.md) |
| 8. Policies | Consistency, deprecation, generated code | [policies.md](${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/references/ts/policies.md) |

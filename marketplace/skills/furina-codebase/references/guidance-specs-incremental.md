# Spec Document Sync Generation Guidelines

> **Important Reminder**: Before generating or updating any spec document, **you must re-read this file** and strictly follow all the specifications below. This file is the standard reference for spec document generation and must not be skipped.
>
> This specification is fully consistent with `furina-codebase`'s `generate` instruction (see `guidance-specs.md`), ensuring that specs generated via `furina-codebase`'s `synchronize` instruction can be seamlessly queried by `furina-codebase`'s `explore` instruction.

---

## I. Core Principles

1. **Must be detailed, complete, and professional.** A spec document is a complete technical specification for one or more related source code files, not a simple feature list.
2. **Each spec must re-scan source files.** When writing a spec document, you must re-read the actual source files. Planning files are only guidance; source code is the truth.
3. **Core code must be carefully determined.** Not all code deserves inclusion in spec documents. Prioritize code that truly embodies core logic, key algorithms, and important interface implementations. Avoid including simple wrapper code, repetitive code, or glue code with no critical logic as core code.
4. **Content length should be sufficient, do not skimp.**

---

## II. Source File Reading Scope

When generating a spec document, in addition to reading the source files directly related to the spec, extend upward and downward:

- **Upward**: Check which source files call this code, understand how the spec is used externally
- **Downward**: Check which other source files/modules this spec depends on, understand its underlying support
- Based on call relationships and usage scenarios, supplement relevant context into the spec document (e.g., "Usage Examples", "Dependency Relationships" sections)

> **Incremental Mode Exception**: In `furina-codebase`'s `synchronize` instruction incremental update mode, reading scope is constrained by the synchronize instruction Phase 3 rules:
> - Only read the changed files themselves, do not expand scope
> - If the change does not affect external interfaces, no need to read dependency files
> - If the change affects external interfaces, you may read directly imported modules (one level only), but do not trace upward to callers
> - When updating an existing spec, only modify content sections corresponding to changes, preserving all other parts unchanged

---

## III. Required Content for Spec Documents

### 3.1 Overview

A detailed description of the business logic/functionality covered by this spec, including:
- The spec's role and positioning within the system
- Design motivation: why it was designed this way, what problem it solves
- Usage scenarios: under what circumstances these features are invoked
- List of involved source files and their respective responsibilities

### 3.2 Overall Architecture / Process Flow (if applicable)

If multi-step processes, state machines, call chains, etc. are involved, describe the overall flow.

### 3.3 Feature Details / Interface Details

Provide detailed interpretation of **each** important feature, interface, and method. Each interface must include:

- **Feature Description**: Detailed description, not one sentence. Explain clearly what it does and why it's needed.
- **Parameter Details**: Type, meaning, defaults, constraints for each parameter.
- **Return Value Details**: Type, meaning, possible errors/edge cases.
- **Core Logic Explanation**: What the function does internally, key decisions and branches. Not just code — include textual interpretation.
- **Core Code**: Actual code snippets extracted from source files (15-30 lines), demonstrating key implementation.
- **Code Source Annotation**: File path + line number range.
- **Usage Example** (must include): How to call this interface, typical input/output, explanation of what the example code does.

### 3.4 Data Structures

Key types, interfaces, enums, constants involved in this spec, listing definitions and field descriptions.

### 3.5 Error Handling and Edge Cases

Error handling strategy, exception types, boundary conditions for this spec.

### 3.6 Dependencies

- **Depends On**: Which other modules/specs this spec depends on
- **Depended By**: Which other modules/specs depend on this spec

### 3.7 Usage Examples

Demonstrate complete usage scenario code for this spec, including:
- How to initialize/create required objects
- How to call core interfaces
- Typical input/output examples
- Common usage patterns

Include step-by-step explanations so readers can use it directly.

---

## IV. Spec Document Format Template

```markdown
# {Spec Title}

> Source files:
> - `{source-file-path-1}` : {start-line}-{end-line}
> - `{source-file-path-2}` : {start-line}-{end-line}
> - (may include multiple source files)

## Overview

{Detailed description of the business logic/functionality covered by this spec, including:}
- The spec's role and positioning within the system
- Design motivation: why it was designed this way, what problem it solves
- Usage scenarios: under what circumstances these features are invoked
- List of involved source files and their respective responsibilities

## Overall Architecture / Process

{If applicable, describe overall call flow, data flow, state machine, etc. May use pseudocode or step descriptions.}

## Feature Details / Interface Details

### `functionName(param1: Type, param2: Type) -> ReturnType`

**File Source**: `{file-path}`:{start-line}-{end-line}

**Feature Description**: {Detailed description of what the function does. Not one sentence — explain clearly what it does and why it's needed.}

**Parameter Details**:
- `param1` (`Type`): {Detailed description of parameter meaning, constraints, defaults}
- `param2` (`Type`): {Detailed description}

**Return Value**:
- `ReturnType`: {Detailed description of return value meaning}
- Possible errors/edge cases: {Description}

**Core Logic**:
{Detailed description of key internal logic, decision branches, core algorithms. Not just code — include textual interpretation.}

**Core Code**:
```language
// Actual code snippet extracted from source file (15-30 lines, demonstrating key implementation)
```
Source: `{file}`:{start-line}-{end-line}

**Usage Example**:
```language
// Typical invocation of this function
```
Explanation: {What this example code demonstrates}

---

### `anotherFunction(params) -> ReturnType`

{Same detailed format, expand for each important interface/method}
...

## Data Structures

### `TypeName`
```language
// Type definition code
```
- `field1` (`Type`): {Field meaning}
- `field2` (`Type`): {Field meaning}

### `EnumName`
```language
// Enum definition code
```
- `value1`: {Meaning}
- `value2`: {Meaning}

## Error Handling and Edge Cases

{Describe error handling strategy, possible exception types, how boundary conditions are handled.}

## Dependencies

- **Depends On**: Which other modules/specs this spec depends on
- **Depended By**: Which other modules/specs depend on this spec

## Usage Examples

{Demonstrate complete usage scenario code for this spec, including:}
- How to initialize/create required objects
- How to call core interfaces
- Typical input/output examples
- Common usage patterns

Explanation: {Step-by-step explanation of what the example code does, so readers can use it directly}

```language
// Complete usage example code
```

---

## V. Notes

1. **A spec document is not a simple description of a single source file**, but a complete technical specification for one or more source code files that share the same minimal business logic, related logic, or strong correlation.
2. **Core code snippets must be extracted from actual source files**, not fabricated.
3. **Usage examples must be based on actual code**, not fabricated.
4. **Per-interface usage examples** are key to readers understanding how to call that interface.
5. **Overall usage examples** are key to readers understanding how to integrate the spec into actual business scenarios.

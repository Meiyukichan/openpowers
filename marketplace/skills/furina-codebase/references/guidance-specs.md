# Spec Document Generation Guide

> **Important**: Before generating any spec document, **you MUST re-read this file** and strictly follow all specifications below. This file is the standard reference for spec document generation and cannot be skipped.

---

## 1. Core Principles

1. **Must be thorough, complete, and professional.** A spec document is a complete technical specification for one or several related source files — not a simple feature list.
2. **Each spec must re-scan source files.** When writing spec documents, you must re-read actual source files. Planning files are only guidance; source code is truth.
3. **Core code requires careful judgment.** Not all code deserves inclusion in spec documents. Prioritize code that truly represents core logic, key algorithms, and important interface implementations. Avoid including simple wrappers, duplicated code, or glue code without critical logic.
4. **Length should be sufficient — do not be cursory or overly concise.**

---

## 2. Source File Reading Scope

When generating spec documents, besides reading the directly related source files for that spec, you also need to extend upward and downward:

- **Upward**: Check which source files call this code to understand how the spec is used externally.
- **Downward**: Check which other source files/modules this spec depends on to understand its underlying support.
- Based on call relationships and usage scenarios, supplement relevant context into the spec document (e.g., "Usage Examples", "Dependencies" sections).

---

## 3. Required Spec Document Content

### 3.1 Overview

Detailed description of the business logic/functionality covered by this spec, including:
- The spec's role and positioning in the system
- Design motivation: why it's designed this way, what problem it solves
- Usage scenarios: when these functionalities are called
- List of involved source files and their respective responsibilities

### 3.2 Architecture / Flow Description (if applicable)

If multi-step flows, state machines, call chains, etc. are involved, describe the overall flow.

### 3.3 Functionality / Interface Details

Provide detailed documentation for **every** important function, interface, and method. Each interface must include:

- **Functionality description**: Detailed explanation, not a one-liner. Explain what it does and why it's needed.
- **Parameter details**: Type, meaning, default value, and constraints for each parameter.
- **Return value details**: Type, meaning, possible errors/edge cases.
- **Core logic explanation**: What the function does internally, key decisions and branches. Don't just paste code — provide textual explanation.
- **Core code**: Actual code snippet extracted from the source file (15–30 lines) showing the key implementation.
- **Code source annotation**: File path + line number range.
- **Usage example** (required): How to call the interface, typical input/output, explanation of what the example code does.

### 3.4 Data Structures

Key types, interfaces, enums, and constants involved in this spec — list definitions and field descriptions.

### 3.5 Error Handling and Edge Cases

Error handling strategy, exception types, and boundary conditions for this spec.

### 3.6 Dependencies

- **Depends on**: Which other modules/specs this spec depends on.
- **Depended by**: Which other modules/specs depend on this spec.

### 3.7 Usage Examples

Show complete usage scenario code for this spec, including:
- How to initialize/create required objects
- How to call core interfaces
- Typical input/output examples
- Common usage patterns

Include step-by-step explanations so readers can use them directly.

---

## 4. Spec Document Format Template

```markdown
# {Spec Title}

> Source files:
> - `{source_file_path1}` : {start_line}-{end_line}
> - `{source_file_path2}` : {start_line}-{end_line}
> - (may include multiple source files)

## Overview

{Detailed description of the business logic/functionality covered by this spec, including:}
- The spec's role and positioning in the system
- Design motivation: why it's designed this way, what problem it solves
- Usage scenarios: when these functionalities are called
- List of involved source files and their respective responsibilities

## Architecture / Flow

{If applicable, describe the overall call flow, data flow direction, state machine, etc. May use pseudocode or step descriptions.}

## Functionality / Interface Details

### `functionName(param1: Type, param2: Type) -> ReturnType`

**Source**: `{file_path}`:{start_line}-{end_line}

**Functionality**: {Detailed description of what this function does — not a one-liner. Explain what it does and why it's needed.}

**Parameters**:
- `param1` (`Type`): {Detailed explanation of parameter meaning, constraints, default value}
- `param2` (`Type`): {Detailed explanation}

**Return Value**:
- `ReturnType`: {Detailed explanation of return value meaning}
- Possible errors/edge cases: {Explanation}

**Core Logic**:
{Detailed description of the function's internal key logic, decision branches, core algorithms. Don't just paste code — provide textual explanation.}

**Core Code**:
```language
// Actual code snippet extracted from source file (15-30 lines showing key implementation)
```
Source: `{file}`:{start_line}-{end_line}

**Usage Example**:
```language
// Typical way to call this function
```
Explanation: {What this example code does}

---

### `anotherFunction(params) -> ReturnType`

{Same detailed format, expanding each important interface/method one by one}
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

{Describe this spec's error handling strategy, possible exception types, and how edge cases are handled.}

## Dependencies

- **Depends on**: Which other modules/specs this spec depends on
- **Depended by**: Which other modules/specs depend on this spec

## Usage Examples

{Show complete usage scenario code for this spec, including:}
- How to initialize/create required objects
- How to call core interfaces
- Typical input/output examples
- Common usage patterns

Explanation: {Step-by-step explanation of what the example code does — readers should be able to use it directly}

```language
// Complete usage example code
```

---

## 5. Notes

1. **A spec document is NOT a simple description of a source file** — it is a complete technical specification for one or several closely related source files covering the same minimal business logic.
2. **Core code snippets must be extracted from actual source files**, not fabricated.
3. **Usage examples must be based on actual code**, not made up.
4. **Each interface's usage example** is key for readers to understand how to call that interface.
5. **The overall usage example** is key for readers to understand how to integrate this spec into actual business logic.

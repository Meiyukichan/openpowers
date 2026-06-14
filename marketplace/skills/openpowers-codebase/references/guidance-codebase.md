## Document Collection Concepts

### Index File (toc.md)

Index files are navigation files at each level. They should be relatively concise, **recommended not to exceed 500 lines**, as they are essentially indexes.
All levels (overview, module, submodule) have their own index files.

### Overview

- **Path**: `{codebaseDir}/toc.md`
- **Constraint**: Index file, recommended not to exceed 500 lines
- **Contents**:
  - Detailed project introduction (project background, business goals, overall design philosophy)
  - Introduction to all `modules` in the project, including:
    - Detailed description of each module (responsibilities, business domains covered, key features)
    - Detailed description of each module's `submodules` (name + responsibility description, coverage scope)
    - Detailed description of each module's `spec` documents (name + functionality/interface coverage)
    - Path links to each `module` index file
  - **Important**: The overview serves as the entry point for the retriever. Descriptions must be detailed enough to support smooth navigation. For example: if a user searches for "mcp implementation", the module/submodule/spec descriptions in the overview should accurately point to the correct next-level index, ensuring the query path is: overview → module index → submodule index → spec document.

### Module

- **Definition**: A large domain cluster, such as a tools module, plugin module, or hook module.
- **Partitioning principle**: Module partition should holistically consider **architecture** (code organization, responsibility separation), **business** (domain logic, functional boundaries), **directory structure** (source code directory layout), and **holistic perspective** (inter-module relationships and dependencies). Do not over-rely on directory structure — directories are just one reference; the key is understanding the actual business and architectural essence of the code.
- **Constraint**: A module can contain many `submodule` folders or `spec` documents, but the total count of `submodules` + `specs` must not exceed 50.
- **Path**: `{codebaseDir}/{moduleName}/`, e.g., tools module → `{codebaseDir}/tools/`

### Module Index File

- **Path**: `{codebaseDir}/{moduleName}/toc.md`
- **Constraint**: Index file, recommended not to exceed 500 lines
- **Contents**:
  - **Module relationship diagram** (ASCII diagram showing call/dependency relationships between submodules within this module)
  - Detailed descriptions of all `submodules`/`spec` documents in this module (responsibility description, coverage scope), along with `submodule` index file paths (e.g., `./submodule/toc.md`) / `spec` document paths
  - Descriptions must be detailed enough to support retriever navigation

### Submodule

- **Definition**: A smaller domain cluster.
- **Partitioning principle**: Submodule partition should also holistically consider **architecture**, **business**, **directory structure**, and **holistic perspective**. Do not over-rely on directory structure; judge based on actual business logic and architectural cohesion of the code.
- **Constraint**: Contains 5–50 `spec` documents (note: only spec documents, no further nesting of submodules).
- **Path**: `{codebaseDir}/{moduleName}/{submodule}/`

### Submodule Index File

- **Path**: `{codebaseDir}/{moduleName}/{submodule}/toc.md`
- **Constraint**: Index file, no more than 500 lines
- **Contents**:
  - **Spec relationship diagram** (ASCII diagram showing call/dependency relationships between specs within this submodule)
  - Detailed descriptions of all `spec` documents in this submodule (functionality/interface coverage) and `spec` document paths
  - Descriptions must be detailed enough to support retriever navigation

### Spec Document

- **Definition**: The smallest domain granularity. A spec details one or several closely related source files covering the same minimal business logic, with a collection of related `functionalities/interfaces`. **Must thoroughly document these functionalities and interfaces.**
- **Example**: `spec-read.md` is the spec document for the read tool.
- **Content requirements**:
  - Functionality details / interface details
  - Core code of the functionality/interface
  - Code range of the functionality/interface: `{source_path}:start_line-end_line`
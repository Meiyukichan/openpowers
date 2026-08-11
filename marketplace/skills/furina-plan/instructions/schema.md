# Schema Instruction

This instruction supplements the earlier propose/design phase. It generates technical specification schema documents (not required for every project).

## Workflow

1. **Understand** - Read and analyze all three Furina artifacts (proposal, design, specs) in `furina/changes/<name>/`. If any missing, stop and ask user to run `furina-propose` first.
2. **Selections** - Carefully select schemas to be created for the current change `furina/changes/<name>/` based on `Schema Selection Advice`.
3. **Read template** - Read the template for each selected schema.
4. **Generate schema** - Generate the schema document following its template.

## Schema Selection Advice

**API**：
1. Adding or modifying a backend HTTP API
2. Adding or modifying an RPC / GraphQL interface
3. Frontend, mobile, or other services need to call these APIs
4. CLI tool involves remote API calls
5. Desktop application has network communication with the backend
6. The design document or specification mentions interface details

**Database**:
1. WHEN and ONLY when current change `furina/changes/<name>/` volves the database or SQL

The above is a geneal adivice. The final decision bases on the design docs and specs in `furina/changes/<name>/`.

## Templates

| Schema   | Template                                                                             | Key Content                       |
| -------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| API      | `${CLAUDE_PLUGIN_ROOT}/skills/furina-plan/references/template-api.md`            | Swagger 2.0 YAML specification    |
| Database | `${CLAUDE_PLUGIN_ROOT}/skills/furina-plan/references/template-database.md`       | Schema, relationships, migrations |

## RED LAW

- do NOT force generation. Comprehensively consider whether these schemas are needed for this change
- do NOT read the template of the schema that will not be generated. Only allow reading the template document when you are about to create that schema.

## Possible Output

- `furina/changes/<name>/api.yaml`
- `furina/changes/<name>/database.md`

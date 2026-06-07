---
name: openpowers-propose
description: Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation.
---

Propose a new change - create the change and generate all artifacts in one step.

This skill will create a change with artifacts:

- proposal.md (what & why)
- design.md (how)
- specs/\*\*/\*.md (requirements specs)

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

## Language Adaptation

Query the plugin's required output language using the following script:

```bash
openpowers config show language
```

- `language`: This skill **must** use this language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Change Steps

Follow these change steps strictly and accurately to complete the creation of change artifacts:

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:

   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**

   ```bash
   openpowers change new <name> --desc <brief description of this change [15-30 words] in `language`>
   ```

   This creates the change at `openpowers/changes/<name>/` and brings it into the OpenPowers change management system.

3. **Get the artifact build order**

   ```bash
   openpowers change status <name>
   ```

   Parse the JSON to get:
   - `isArtsComplete`: Whether the change is complete (true/false)
   - `status`: Change status (active/archived)
   - `artifacts`: list of all artifacts with their status and file names

4. **Create artifacts in strict order as follows until ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   a. **Process artifacts in `ready` status from the `artifacts` list**:
   - Get instructions:
     ```bash
     openpowers change instruction <name> --<artifact-id>
     ```
   - The instructions JSON includes:
     - `context`: Project background (constraints for you - do NOT include in output)
     - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
     - `template`: The structure to use for your output file
     - `instruction`: Schema-specific guidance for this artifact type
     - `outputPath`: Where to write the artifact
     - `dependencies`: Completed artifacts to read for context
   - Read any completed dependency files for context
   - Must use `template` as the structure, create the artifact file according to `instruction`
   - Apply `context` and `rules` as constraints - but do NOT copy them into the file
   - Show brief progress: "Created <artifact-id>"

   b. **Loop through `step a` above until `isArtsComplete` = `true`**
   - After creating each artifact in `step a`, re-run `openpowers change status <name>`
   - Stop when `isArtsComplete` = `true`

   c. **If an artifact requires user input** (unclear context):
   - Use **AskUserQuestion tool** to clarify
   - Then continue with creation

5. **Show final status**
   ```bash
   openpowers change status <name>
   ```

**Output**

After completing all artifacts, summarize:

- Change name and location
- List of artifacts created with brief descriptions
- What's ready and Remind the user: "All artifacts created! You can run skill `openpowers-plan` to generate schema docs and make work plan."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openpowers instructions` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Guardrails**

- Create ALL artifacts needed for implementation (the `artifacts` field)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next

**Artifact Checklist**:

- [ ] `openpowers/changes/<name>/proposal.md`
- [ ] `openpowers/changes/<name>/design.md`
- [ ] `openpowers/changes/<name>/spec/**/*.md`

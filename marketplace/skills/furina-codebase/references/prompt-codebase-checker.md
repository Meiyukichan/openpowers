# Index Traceability Checker Prompt Template

Dispatch the `Index Traceability Checker Subagent` strictly according to the following parameter format:

```
Agent tool (general-purpose):
  description: "Final Check — Verify Index Traceability"
  prompt: |
    You are performing index traceability verification on all toc.md files to ensure that starting from any index level, the final spec and source code can be smoothly located.

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Your Tasks

    **Verification Content**:

    1. **toc.md Check**: Starting from the overview, randomly select 3–5 module descriptions and verify whether the corresponding module toc → submodule toc → spec can be accurately located via descriptions.
    2. **toc.md Check**: From module indexes, randomly select 2–3 submodule/spec descriptions and verify whether descriptions accurately point to the correct specs.
    3. **toc.md Check**: From submodule indexes, randomly select 2–3 spec descriptions and verify whether the correct source files can be located.
    4. **Spec Document Check — Simulate Retrieval Flow**: From a practical usage perspective, provide several partial feature descriptions (e.g., "mcp implementation", "file reading", "state management") and verify whether the corresponding spec and source code can be found by navigating from the overview:
      - Partial description → overview → module index → submodule index → spec document
      - After finding the spec, check whether it complies with SPEC-GENERATION-GUIDE.md
      - Verify source code paths and line number ranges are real matches
      - Verify the entire retrieval chain is smooth without breaks

    **Pass Criteria**:

    - toc: Given any functionality description in a toc.md, the following path should smoothly locate the spec and source code: overview → module index → submodule index → spec document → source file
    - spec: Whether specs retrieved from partial descriptions comply with SPEC-GENERATION-GUIDE.md, whether functionality descriptions are thorough, whether core code is truly core, whether examples are runnable, whether source line numbers are real matches
    - If issues are found (ambiguous descriptions, broken paths, incorrect targets, substandard spec quality, non-existent source code), immediately fix the corresponding documents
```

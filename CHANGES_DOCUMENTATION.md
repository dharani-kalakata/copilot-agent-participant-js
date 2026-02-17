# Changes Documentation

## Current state summary

This codebase now uses the earlier direct-edit behavior again:

- `write_file` applies writes immediately.
- `edit_file` applies replacements immediately.
- No pending edit confirmation commands are active.

The recent rollback kept the broad JSDoc/docstring additions.

## Latest stabilization updates

- Added `/search` command for explicit workspace text search.
- Added workspace-search guidance in profile/system prompt (search is available via `search_text`).
- Added `request.references` prompt injection so `#file` references are visible to the model loop.
- Added path normalization for chat-style file references in `workspacePaths.js`.
- Added a lightweight repeated-identical-tool-call guard to reduce stuck loops.
- Added one retry when model output is non-JSON before falling back to raw output.
- Added stable workspace-search fallback (`findFiles` + document scan) when `findTextInFiles` proposal is unavailable.
- Renamed chat participant handle to `@dsxchangeassist` (full name: **DSX Change Assist**).
- Added guard to retry once when the model incorrectly claims workspace search is unavailable.

---

## What was rolled back

The following last-iteration changes were removed:

- pending edit manager module (`src/edits/pendingEditManager.js`)
- edit lifecycle command handling (`/pending`, `/apply`, `/add`, `/discard`, `/undo`)
- profile/help/manifest wiring related to pending edit lifecycle
- pending-proposal behavior in edit/write tools

---

## What remains

- Tool registry architecture (`src/tools/toolRegistry.js`)
- VS Code workspace search integration in `search_text` (preferred: `findTextInFiles`, fallback: `findFiles` + document scan)
- Direct edit/write tools for file updates
- Web search tool (`web_search`) and hello tool (`hello_world`)
- JSDoc/docstring coverage across source files

---

## Clarification: custom tools vs VS Code APIs

This participant has always used a **tool abstraction layer** (`ToolRegistry` + tool modules).
Those tools are wrappers around VS Code/Node APIs.

For example:
- `search_text` -> VS Code workspace APIs (`findTextInFiles`, with fallback to `findFiles` + `openTextDocument`)
- `list_files` / `read_file` / `write_file` / `edit_file` -> Node `fs` + workspace path guards

So it is both:
1. custom participant tools (agent-visible function interface), and
2. underlying VS Code/Node APIs (actual execution layer).

You were right that VS Code APIs are still the foundation for search; the wrapper exists so the model can call a structured function.

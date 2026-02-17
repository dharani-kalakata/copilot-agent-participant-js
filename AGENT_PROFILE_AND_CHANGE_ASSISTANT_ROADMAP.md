# Agent Profile, Workspace Search, and Change-Assistant Roadmap

## 1) Why you saw “workspace search is unavailable”

The `search_text` tool was already implemented and uses VS Code workspace search APIs (preferred: `vscode.workspace.findTextInFiles`, fallback: `findFiles` + document scan), so workspace search itself was **not** disabled in code.

The bad behavior came from orchestration, not missing API support:

1. The model sometimes returned plain text instead of the required JSON action format.
2. The runner previously accepted that plain text as final output and exited early.
3. That allowed model messages like “workspace search is unavailable” to be shown without actually trying `search_text`.

Also, file references such as `#file:...` were not always converted into clean paths/tool context, which reduced reliability in edit/search workflows.

---

## 2) What was fixed now

### A. Workspace search command path added
- Added explicit slash command support for workspace search:
  - `/search <query>`
  - alias in runner: `workspacesearch`
- Wiring updated in:
  - `package.json` (chat command contribution)
  - `extension.js` (help text)
  - `src/agent/agentModeRunner.js` (command-to-tool map)

### B. Stricter agent-loop response handling
- In `src/agent/agentModeRunner.js`, if the model returns non-JSON output, the runner now asks once for valid JSON action format instead of immediately returning raw text.
- This reduces false “can’t do X” answers that happen without any tool attempt.

### C. Better file-reference context in prompts
- The runner now injects `request.references` into the task prompt (`buildTaskPrompt`) so `#file`/reference values are visible to the model as concrete paths/context.

### D. Path normalization for chat-style references
- `src/utils/workspacePaths.js` now normalizes inputs like:
  - `#file:foo.py`
  - `file:foo.py`
  - `file:///.../foo.py`
  - `foo.py:42`
- This improves read/edit tool resolution.

### E. Anti-loop guard
- The runner now blocks repeated identical tool calls (>2 in a row) and pushes a corrective observation back to the model.
- This reduces “stuck repeating tool calls” behavior.

---

## 3) What is an “agent profile” here?

In this project, an **agent profile** is a prompt-policy module that defines how the model should behave.

- Profile file: `src/agent/profiles/copilotLikeProfile.js`
- Profile resolver: `src/agent/profiles/index.js`
- Runner uses it: `AgentModeRunner` calls `profile.buildSystemPrompt(...)`

So a profile is not the agent runtime itself; it is the behavior contract/instructions that the runtime uses.

---

## 4) What is the “Copilot-like profile”?

`copilotLikeProfile.js` is the default profile that tries to mimic Copilot Agent style by instructing the model to:

- work iteratively,
- call tools using strict JSON actions,
- gather evidence before finalizing,
- finish with a final user-facing response.

It helps mimic Copilot Agent behavior, but it is still a simplified custom implementation, not full parity with internal Copilot architecture.

---

## 5) What executes behavior (and where “steps” come from)?

### Core execution path
1. `extension.js` registers `@dsxchangeassist`.
2. `AgentModeRunner.handleRequest(...)` receives the chat request.
3. Runner builds system+task prompts (using selected profile).
4. Runner loops up to `maxIterations`:
   - ask model for next action
   - parse JSON action (`tool` or `final`)
   - execute tool via `ToolRegistry` if needed
   - append tool observation back to model context
5. Exit on `final` or iteration limit.

### “Steps” meaning
The steps correspond to iterations of this tool-calling loop (`maxIterations` from settings, default 6).  
They are not raw “chain-of-thought”; they are loop cycles of `model -> action -> tool -> observation`.

### Where reasoning happens
Reasoning happens inside model calls (`ModelClient.complete`) using:
- system prompt from profile,
- request prompt + references,
- previous tool observations.

---

## 6) Current maturity vs real Copilot Agent Mode

### Implemented now
- Iterative loop with tool observations.
- Workspace tools (list/read/search/edit/write/run command).
- Prompt-reference injection.
- Basic command-specific intents and tool commands.

### Still missing for true parity
- Deep intent routing/planning components used by first-party Copilot.
- Rich prompt-variable/reference resolution pipelines.
- Built-in confirmation and UI affordances equivalent to all native agent surfaces.
- Advanced recovery/planning heuristics and richer telemetry/debug surfaces.

So this is **agent-like behavior**, but not full Copilot Agent internals.

---

## 7) Should you remove current participant to build a “Change Assistant”?

Short answer: **No**.  
Best approach is to keep this participant and add a separate profile/flow on top of it.

Recommended structure:

1. Keep current runtime (`AgentModeRunner`, `ToolRegistry`) as shared engine.
2. Add a new profile, e.g. `changeAssistantProfile.js`.
3. Add a rule/context loader to ingest your Markdown standards/rules folders.
4. Inject those rules into system/task prompts before model loop.
5. Optionally add dedicated tools for “load_rules”, “validate_changes”, and “summarize_rule_violations”.

This keeps modularity and avoids breaking existing behavior.

---

## 8) Roadmap to “Change Assistant” style behavior

### Phase 1 - Rule ingestion
- Add configurable paths:
  - `agentModeParticipant.rulesPaths` (array of markdown folders/files)
- Build a rule loader utility:
  - read markdown files
  - chunk and cache
  - expose concise summaries for prompts

### Phase 2 - Profile specialization
- Create `changeAssistantProfile.js`:
  - prioritize coding standards and architecture constraints
  - require reading target files + relevant rule files before edits

### Phase 3 - Planner discipline
- Add pre-edit checklist in prompt:
  1) inspect references/files
  2) search related usages
  3) propose minimal edits
  4) apply edits
  5) verify

### Phase 4 - Verification loop
- Require post-edit verification actions:
  - re-read edited sections
  - search impacted symbols
  - run allowed checks when available

### Phase 5 - Optional UX improvements
- Add explicit `/search`, `/rules`, `/change` command intents.
- Add optional edit-confirmation mode (feature-flagged, not forced).

---

## 9) Git, `.gitignore`, cloning, and environment recreation

## What gets transferred?
- Only committed/pushed files.
- `.gitignore`-excluded files (e.g., `.env`, `node_modules`) are **not** transferred.

## Is clone enough on another machine?
Yes, if repository includes source + `package.json` + docs + config.  
You must recreate ignored/generated items locally.

## Setup commands after clone
```bash
git clone <your-repo-url>
cd copilot-agent-participant-js
npm install
copy .env.example .env   # Windows
# then fill TAVILY_API_KEY in .env
```

Then open in VS Code and press `F5` to launch Extension Development Host.

---

## 10) Project structure tree and file responsibilities

> Note: `node_modules/` is intentionally omitted below.

```text
copilot-agent-participant-js/
├─ .env.example
├─ .gitignore
├─ .vscode/
│  └─ launch.json
├─ extension.js
├─ package.json
├─ package-lock.json
├─ README.md
├─ test.ipynb
├─ WHAT_WAS_ADDED.md
├─ CHANGES_DOCUMENTATION.md
├─ CODEBASE_DOCUMENTATION.md
├─ PORTABILITY_AND_SETUP.md
├─ AGENT_MODE_AND_TOOL_CALLING_EXPLAINED.md
├─ AGENT_PROFILE_AND_CHANGE_ASSISTANT_ROADMAP.md
└─ src/
   ├─ agent/
   │  ├─ actionProtocol.js
   │  ├─ agentModeRunner.js
   │  ├─ historyAdapter.js
   │  ├─ modelClient.js
   │  └─ profiles/
   │     ├─ copilotLikeProfile.js
   │     └─ index.js
   ├─ config/
   │  └─ agentSettings.js
   ├─ tools/
   │  ├─ toolRegistry.js
   │  ├─ listFilesTool.js
   │  ├─ readFileTool.js
   │  ├─ searchTextTool.js
   │  ├─ writeFileTool.js
   │  ├─ editFileTool.js
   │  ├─ runCommandTool.js
   │  ├─ webSearchTool.js
   │  └─ helloWorldTool.js
   └─ utils/
      ├─ workspacePaths.js
      └─ envLoader.js
```

### How files connect
- `extension.js` is entrypoint and wires runtime objects.
- `agentModeRunner.js` is the orchestrator (request handling, loop, tool invocation flow).
- `copilotLikeProfile.js` defines behavior instructions used by the runner.
- `toolRegistry.js` registers and executes tool modules.
- `tools/*.js` implement concrete workspace/web/terminal actions.
- `workspacePaths.js` protects and normalizes workspace path handling for file tools.
- `agentSettings.js` loads and validates runtime config from VS Code settings.

---

## 11) Workspace search capability summary

Workspace search is supported by design:
- Tool: `search_text`
- API: VS Code workspace search APIs (`findTextInFiles`, with fallback to `findFiles` + `openTextDocument`)
- Scope: workspace files (with exclude globs for heavy/generated dirs)

If behavior still appears inconsistent, it is usually orchestration/model-action quality, not missing VS Code search API.

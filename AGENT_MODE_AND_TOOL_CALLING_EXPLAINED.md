# Agent Mode and Tool Calling Explained

## 1) Iterative reasoning

The runner (`src/agent/agentModeRunner.js`) executes a bounded loop:

1. Send context + instructions to model.
2. Model returns JSON action:
   - `{"type":"tool", ...}` or
   - `{"type":"final", ...}`.
3. If tool action:
   - execute tool,
   - send tool output back as `TOOL_RESULT`.
4. Repeat until final answer or max iteration limit.

---

## 2) Is iteration fixed or dynamic?

- Dynamic stop: loop ends early when model returns `type: "final"`.
- Fixed cap: `agentModeParticipant.maxIterations` (default `6`).

So it is dynamic within a fixed safety budget.

---

## 3) Is internal reasoning shown?

Not full chain-of-thought.
You can see:
- progress updates,
- tool calls,
- tool outputs,
- final result.

---

## 4) How tool calling is triggered

Three paths:

1. Explicit slash commands (for example `/websearch ...`, `/hello ...`).
2. Lightweight autonomous intent rules for obvious prompts.
3. Model-driven tool actions during iterative loop.

---

## 5) How tool execution works

1. Runner receives tool name + input.
2. `ToolRegistry.execute(...)` finds tool handler.
3. Tool `execute(...)` runs and returns `{ ok, output, error? }`.
4. Runner either:
   - prints tool result directly (command mode), or
   - feeds result back to model (`TOOL_RESULT`) in iterative mode.

---

## 6) Can command-line output be sent back to LLM?

Yes.

For `run_command`, stdout/stderr are captured as tool output.
That output can be appended back into model context via `TOOL_RESULT`, so the model can reason on real command output.

---

## 7) Search and edit implementation clarity

- Search uses VS Code workspace APIs through `search_text` (preferred: `findTextInFiles`, fallback: `findFiles` + file scan).
- Edits are direct file operations through `write_file` / `edit_file` tools.

So you are correct that underlying search relies on VS Code APIs; the tool layer is the structured interface the model uses to call those APIs.

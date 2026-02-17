# Codebase Documentation (Beginner-Friendly)

This is a VS Code extension that contributes a chat participant: `@dsxchangeassist`.

---

## Top-level files

- `extension.js`  
  Extension entrypoint. Registers the participant, wires settings/profile/tool registry.

- `package.json`  
  Extension manifest: commands, settings schema, activation events, npm scripts.

- `.env.example` / `.env`  
  Tavily API key template and local key file.

- `.gitignore`  
  Ignores generated artifacts, logs, and secrets.

- `README.md`  
  Quick setup + usage.

- `CHANGES_DOCUMENTATION.md`  
  Change log + architecture clarification.

- `CODEBASE_DOCUMENTATION.md`  
  This document.

- `PORTABILITY_AND_SETUP.md`  
  Moving and setting up on another machine.

- `AGENT_MODE_AND_TOOL_CALLING_EXPLAINED.md`  
  Step-by-step explanation of iteration and tool execution.

---

## Source architecture

```text
src/
  agent/
    actionProtocol.js
    agentModeRunner.js
    historyAdapter.js
    modelClient.js
    profiles/
      copilotLikeProfile.js
      index.js
  config/
    agentSettings.js
  tools/
    listFilesTool.js
    readFileTool.js
    searchTextTool.js
    writeFileTool.js
    editFileTool.js
    runCommandTool.js
    webSearchTool.js
    helloWorldTool.js
    toolRegistry.js
  utils/
    workspacePaths.js
    envLoader.js
```

---

## How the system works

1. `extension.js` receives chat requests for `@dsxchangeassist`.
2. `AgentModeRunner` orchestrates each request.
3. Runner uses `ModelClient` to call the selected language model.
4. Model may request a tool call via strict JSON action protocol.
5. `ToolRegistry` executes the requested tool.
6. Tool output is returned to the model (`TOOL_RESULT`) or directly to user for explicit command mode.

---

## Tool layer (important)

The participant exposes **custom tools** that the model can call.
These are wrappers over VS Code/Node APIs.

Examples:
- `search_text` -> uses VS Code workspace search APIs (`findTextInFiles`, with fallback scanning via `findFiles` + `openTextDocument`)
- `read_file` / `write_file` / `edit_file` -> use Node `fs` with workspace boundary checks
- `run_command` -> child process exec with allowlist
- `web_search` -> Tavily API
- `hello_world` -> VS Code terminal output

So the agent uses a custom tool interface, but underlying execution still relies on VS Code/Node APIs.

---

## package.json explained

Key parts:

- `enabledApiProposals`  
  Enables required proposed chat APIs.

- `activationEvents`  
  Starts extension on startup/chat invocation.

- `contributes.chatParticipants`  
  Declares participant id/name/mode and slash commands.

- `contributes.configuration`  
  Defines `agentModeParticipant.*` settings.

- `scripts.check`  
  Runs syntax validation (`node --check`) over core files.

- `scripts.test`  
  Alias of `check`.

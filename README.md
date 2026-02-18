# Copilot Agent Participant (JavaScript)

This project is a custom VS Code chat participant (`@dsxchangeassist`) that mimics Copilot Agent-style iterative tool use.

## Key capabilities

- Iterative agent loop (`plan -> tool -> observe -> final`)
- Request-level model usage (uses model selected in chat UI when available)
- Modular tool registry for easy extension
- Web search tool (`web_search`) via Tavily
- Local Jira tool (`fetch_jira_ticket`) for issue lookup by key/name
- Workspace text search tool (`search_text`) via VS Code API
- Diagnostic terminal tool (`hello_world`)
- File edit tools (`write_file`, `edit_file`) for direct workspace edits

## Project structure

```text
copilot-agent-participant-js/
  extension.js
  package.json
  .vscode/launch.json
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
      webSearchTool.js
      helloWorldTool.js
      writeFileTool.js
      editFileTool.js
      runCommandTool.js
      toolRegistry.js
    utils/
      workspacePaths.js
      envLoader.js
```

## Setup

1. Open this folder in VS Code.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add `TAVILY_API_KEY=...` in `.env`.
5. Add Jira values in `.env`: `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`.
6. Press `F5` to start Extension Development Host.

## Commands

- `/compact` - summarize conversation state
- `/explain`, `/review`, `/tests`, `/fix`, `/new`, `/edit` - intent-focused agent modes
- `/search <query>` - explicit workspace text search
- `/websearch <query>` - explicit Tavily web search
- `/hello [message]` - print to terminal
- `#fetch_jira_ticket <SCRUM-1 or ticket name>` - fetch Jira ticket context via local LM tool

## Edit behavior

1. Ask for an edit (for example using `/edit`).
2. The agent can call `edit_file` or `write_file`.
3. The selected edit tool applies changes directly to workspace files.

## Validation

- `npm run check`
- `npm test`

## Documentation index

- `CHANGES_DOCUMENTATION.md`
- `CODEBASE_DOCUMENTATION.md`
- `PORTABILITY_AND_SETUP.md`
- `AGENT_MODE_AND_TOOL_CALLING_EXPLAINED.md`
- `AGENT_PROFILE_AND_CHANGE_ASSISTANT_ROADMAP.md`
- `JIRA_LOCAL_TOOL_SETUP.md`

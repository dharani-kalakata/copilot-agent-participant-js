Project structure and file responsibilities

This document lists the repository structure (folders and files) and describes the responsibility of each file. It is written for a beginner and focuses on the Copilot Chat Participant (DSX Change Assist) implementation present in this workspace.

Top-level files

- package.json
  - Extension manifest and NPM metadata. Declares dependencies, scripts, and VS Code extension settings (including enabledApiProposals).
- extension.js
  - Extension entry point: registers the chat participant, commands and wires together the ToolRegistry and AgentModeRunner.
- README.md
  - High level usage and quickstart for running the extension in Extension Development Host.
- CODEBASE_DOCUMENTATION.md
  - High-level documentation about the codebase. (This repo also includes deeper docs in other markdown files.)
- CHANGES_DOCUMENTATION.md
  - Summary of changes made over time and rationale for important edits.
- PORTABILITY_AND_SETUP.md
  - How to move the project to another machine and reproduce the development environment.
- AGENT_PROFILE_AND_CHANGE_ASSISTANT_ROADMAP.md
  - Roadmap and explanation of agent profiles, Copilot-like profile, and how to replicate Change Assistant behavior.
- AGENT_MODE_AND_TOOL_CALLING_EXPLAINED.md
  - Detailed explanation of tool calling, agent iterations, and architecture-level flows.
- PROJECT_STRUCTURE.md (this file)
  - Contains folder tree and concise file responsibilities.

src/ (source code)

- src/agent/
  - agentModeRunner.js
    - Orchestrator for agent-mode requests. Builds prompts, runs the iterative model loop, parses model JSON actions, dispatches tools, appends tool results back to the context, and enforces anti-loop/guard logic.
  - profiles/
    - copilotLikeProfile.js
      - Prompt templates and system instructions that shape the agent's behavior for Copilot-like workflows.
  - (other agent helpers)
    - Any additional coordinator utilities that help run the agent loop and maintain conversation state.

- src/tools/
  - Tool wrappers that expose concrete capabilities to the LLM. Tools implement a minimal execute(params) API and return structured results.
  - searchTextTool.js
    - Workspace text search. Prefers vscode.workspace.findTextInFiles (proposed API) and falls back to a stable API scan (vscode.workspace.findFiles + open/openTextDocument + line matching) when the proposal is unavailable.
  - editFileTool.js / writeFileTool.js
    - Perform direct file edits and writes using Node fs or VS Code workspace APIs. These were restored to apply edits immediately (no pending edits lifecycle) per user request.
  - helloWorldTool.js
    - Simple demonstration tool that prints "Hello World" to the terminal and verifies tool-calling plumbing works.
  - other tool modules
    - Utility tools for reading files, listing directory contents, or extra custom tooling that may be present.

- src/utils/
  - workspacePaths.js
    - Normalizes and resolves chat-style file references (e.g., #file:foo.py, file:///C:/path, file:foo:123). Ensures path safety and strips line-suffixes for stable file resolution.
  - other utilities
    - Small helpers for logging, string normalization, and small conversions used by the agent and tools.

Other important files and artifacts

- .vscode/launch.json (if present)
  - Launch configuration for Extension Development Host. Often includes --enable-proposed-api flags required to test certain VS Code proposed APIs (like findTextInFiles).
- .env (not committed by default)
  - Stores secrets (e.g., Tavily API key) for local testing. The code reads this to run web search tools if configured.
- .gitignore (should be present)
  - Lists files not to commit (node_modules, .env, build artifacts, VS Code workspace state, etc.). See PORTABILITY_AND_SETUP.md for details.

How the files interact (high-level)

1. extension.js starts the extension and registers the chat participant (DSX Change Assist). It creates and wires:
   - ToolRegistry (collection of tools the LLM can call)
   - AgentModeRunner (the orchestrator that drives iterative LLM calls and tool execution)
   - Profile (system prompt templates) for shaping LLM behavior

2. When the user invokes the chat participant (e.g., @dsxchangeassist or a slash command), AgentModeRunner builds a task prompt using the selected profile and the chat history.

3. AgentModeRunner sends the prompt to the LLM and expects a JSON-formatted decision:
   - If the action is a tool call, the runner finds the matching tool in ToolRegistry and invokes it.
   - The tool returns a structured result which is appended to the context and the runner makes another LLM call (iterative loop).
   - If the action is a final answer, the runner returns it to the user.

4. The searchTextTool implements workspace-level search. Where possible it uses vscode.workspace.findTextInFiles (requires proposed API). If unavailable, it performs a fallback scan using stable APIs so that search still functions.

5. Tools that modify files (edit/write) apply changes directly to disk (restored behavior). The runner can be configured to propose diffs first and ask for confirm, but by user request we restored direct edit behavior.

Notes for beginners

- Where to start: open extension.js to see how the extension registers and wires components. Then inspect src/agent/agentModeRunner.js to understand the model loop and how tools are dispatched.
- Searching and editing: searchTextTool.js and editFileTool.js are the two critical tools for making cross-file edits. The search tool is robust: it prefers the proposed API but falls back to scanning to avoid hard failures.
- Running locally: use the VS Code "Run Extension" (F5) to launch an Extension Development Host. If you need proposed APIs, ensure launch.json has the flag --enable-proposed-api local.copilot-agent-participant-js (or matching publisher/extension id).

Common tasks

- Add a new tool: create a new file in src/tools/, export an execute(params) function, and register it in the ToolRegistry used by extension.js.
- Update prompts: edit copilotLikeProfile.js to change system instructions and tuning parameters.
- Change file resolution rules: edit src/utils/workspacePaths.js.

If anything in this document needs to be extended (more file-by-file detail, examples of typical tool payloads, or code snippets), say what level of detail you want and it will be added.

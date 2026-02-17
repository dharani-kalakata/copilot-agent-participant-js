# What Was Added

This document summarizes the latest updates made to the JavaScript Chat Participant.

## 1) Model selection and model visibility

### Added behavior
- The participant now uses the model selected by the user in the chat model dropdown for each request.
- The participant now reports the active model per request in the chat progress stream (`Using model: ...`).

### Implementation
- `src/agent/modelClient.js`
  - Added request-scoped model handling (`preferredModel`) and fallback selector behavior.
  - Added `describeModel(...)` helper for consistent model display text.
- `src/agent/agentModeRunner.js`
  - Resolves request model (`request.model`) before each run.
  - Emits model information via `stream.progress(...)`.
  - Uses the same resolved model throughout the request loop and `/compact`.

## 2) Edit mode capability

### Added behavior
- The participant can now edit existing files and generate/update files directly through tools.
- A new `/edit` command was added to focus agent intent on editing tasks.

### Implementation
- `src/tools/editFileTool.js` (new)
  - `edit_file` tool for exact replacements in existing files.
  - Supports `replaceAll` and returns explicit replacement counts.
- `src/tools/writeFileTool.js` (new)
  - `write_file` tool for create/overwrite/append file operations.
  - Creates parent directories when needed.
- `src/tools/toolRegistry.js`
  - Registers `write_file` and `edit_file` when enabled.
- `src/agent/profiles/copilotLikeProfile.js`
  - Added `/edit` guidance and explicit file-edit tool usage instruction.

## 3) Configuration updates for edit mode

### Added settings
- `agentModeParticipant.enableFileEditTools` (default: `true`)
- `agentModeParticipant.maxWriteChars` (default: `200000`)

### Implementation
- `src/config/agentSettings.js`
  - Added defaults and loading/validation for the new settings.
- `package.json`
  - Added configuration schema entries for these settings.
  - Updated model vendor/family descriptions to clarify they are fallback selectors.

## 4) Command updates

### Added command
- `/edit` — directs the agent toward file update workflows.

### Existing commands (brief)
- `/compact`: summarize participant history for continuation.
- `/explain`: explanation-first output.
- `/review`: review-first output for issues and risks.
- `/tests`: test strategy/generation focus.
- `/fix`: root-cause and fix-first focus.
- `/new`: scaffold new functionality.

## 5) Modularity impact

The changes preserve and strengthen modularity:
- Model logic remains in `modelClient.js`.
- Request orchestration remains in `agentModeRunner.js`.
- File editing capabilities are isolated in dedicated tool modules.
- Tool composition remains centralized in `toolRegistry.js`.
- Runtime behavior remains configurable through `agentSettings.js`.

## 6) Files changed

- Updated:
  - `package.json`
  - `extension.js`
  - `README.md`
  - `src/agent/agentModeRunner.js`
  - `src/agent/modelClient.js`
  - `src/agent/profiles/copilotLikeProfile.js`
  - `src/config/agentSettings.js`
  - `src/tools/toolRegistry.js`
- Added:
  - `src/tools/editFileTool.js`
  - `src/tools/writeFileTool.js`
  - `WHAT_WAS_ADDED.md`

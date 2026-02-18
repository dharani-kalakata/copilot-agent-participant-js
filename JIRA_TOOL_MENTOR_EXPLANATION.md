# Jira Local Tool Mentor Guide (Function-by-Function)

This document explains the full Jira local tool implementation in a mentor-style way: what each file does, every function purpose, and how the end-to-end flow works.

---

## 1) What this tool is

`fetch_jira_ticket` is a **VS Code Local Language Model Tool** registered by your extension.

- It is **not** your chat participant command.
- It is a **global LM tool** exposed through VS Code AI extensibility (`vscode.lm.registerTool`).
- Any agent/model session that can reference local tools can invoke it as `#fetch_jira_ticket`.

Its job:
1. Accept a Jira ticket key or name-like text.
2. Fetch Jira issue data using Jira REST API.
3. Convert raw Jira data (including ADF description) into readable markdown.
4. Return that markdown as tool output for the LLM to present.

---

## 2) Big-picture architecture

The implementation is intentionally modular and split into layers:

1. **Manifest declaration layer**  
   `package.json` → declares the tool schema/metadata so VS Code/LLM knows tool name, input shape, and descriptions.

2. **Runtime registration layer**  
   `src/lmTools/registerLanguageModelTools.js` + `extension.js` → actually registers and activates the tool object at runtime.

3. **Tool adapter layer**  
   `src/lmTools/fetchJiraTicketLanguageModelTool.js` → bridges VS Code tool API (`prepareInvocation`, `invoke`) with Jira service modules.

4. **Integration/service layer**  
   `src/integrations/jira/jiraConfig.js` + `jiraClient.js` → environment config, auth, HTTP calls, search logic, normalization.

5. **Presentation shaping layer**  
   `src/integrations/jira/jiraDescriptionParser.js` + `jiraFormatter.js` → parse Jira description and format final markdown payload.

6. **Environment utility layer**  
   `src/utils/envLoader.js` → loads `.env` keys and process env fallback.

---

## 3) End-to-end runtime flow

When you type:

```text
#fetch_jira_ticket SCRUM-1
```

flow is:

1. VS Code sees tool reference because tool is declared in `package.json` under `contributes.languageModelTools`.
2. During extension activation, `registerLanguageModelTools()` registers runtime implementation with `vscode.lm.registerTool`.
3. VS Code calls `prepareInvocation()` first to show status text.
4. VS Code calls `invoke()` with input payload.
5. `invoke()` extracts ticket reference and calls Jira service (`fetchJiraIssue`).
6. `fetchJiraIssue` resolves credentials, decides key fetch vs summary search, calls Jira REST API.
7. Jira JSON is normalized into stable internal shape.
8. Formatter parses description and builds markdown output.
9. Tool returns `LanguageModelToolResult([LanguageModelTextPart(markdown)])`.
10. LLM may summarize or expand this output depending on prompt and response style.

---

## 4) Why you see both package declaration and JS registration

You need **both**:

1. **`package.json` declaration (static metadata)**  
   - tells VS Code this tool exists  
   - defines input schema (`ticket`)  
   - gives model/user description  
   - allows reference in prompt (`canBeReferencedInPrompt`)

2. **`vscode.lm.registerTool(...)` call (runtime executable implementation)**  
   - binds tool name to real JS functions (`prepareInvocation`, `invoke`)  
   - without this, the tool has no executable behavior

Think of `package.json` as “API contract/discovery”, and `registerTool` as “actual handler wiring.”

---

## 5) File-by-file and function-by-function explanation

## A) `extension.js`

### Why this file exists
Extension entry point. Responsible for activating both your custom chat participant and local LM tools.

### Jira-relevant lines
- imports `registerLanguageModelTools`
- calls `const languageModelToolDisposables = registerLanguageModelTools();`
- pushes disposables into `context.subscriptions`

### Contribution to flow
Without this activation wiring, tool registration code never runs.

---

## B) `src/lmTools/registerLanguageModelTools.js`

### Why this file exists
Single place to register extension-provided LM tools (clean scalability if you add more tools later).

### Functions

#### `registerLanguageModelTools()`
- **Purpose:** Runtime registration boundary.
- **What it does:**
  1. Checks that `vscode.lm.registerTool` is available.
  2. Registers `fetch_jira_ticket` using the created tool implementation.
  3. Returns disposable array.
- **Why needed:** Decouples tool-registration concerns from `extension.js`; keeps activation clean.

---

## C) `src/lmTools/fetchJiraTicketLanguageModelTool.js`

### Why this file exists
Implements VS Code local tool interface and coordinates Jira fetch + formatting.

### Constants

#### `FETCH_JIRA_TICKET_TOOL_NAME`
- **Value:** `fetch_jira_ticket`
- **Purpose:** Single source of truth for tool name reused during registration.

### Functions

#### `createFetchJiraTicketLanguageModelTool()`
- **Purpose:** Factory for tool object with required API methods.
- **Returns:** object with:
  - `prepareInvocation(options)`
  - `invoke(options)`

##### `prepareInvocation(options)`
- **Purpose:** User-visible progress/status text before execution.
- **Why needed:** Better UX (“Fetching Jira ticket …”).
- **Behavior:** Safely extracts ticket input if possible and builds message.

##### `invoke(options)`
- **Purpose:** Main tool execution.
- **Behavior:**
  1. Extract input reference via `readTicketReference`.
  2. Call `fetchJiraIssue(reference)` (integration layer).
  3. Convert normalized issue with `formatJiraIssueForLanguageModel`.
  4. Return `LanguageModelToolResult` with `LanguageModelTextPart`.
- **Why needed:** This is the exact runtime API VS Code invokes for tool calls.

#### `readTicketReference(input)`
- **Purpose:** Strict extraction with validation.
- **Behavior:** returns non-empty reference or throws explicit error.
- **Why needed:** Prevents ambiguous execution and enforces required input.

#### `readTicketReferenceOrEmpty(input)`
- **Purpose:** Lenient extraction for multiple input shapes.
- **Behavior:** accepts plain string and fallback fields (`ticket`, `ticketKey`, `issue`, etc.).
- **Why needed:** Improves robustness across model-generated payload variations.

---

## D) `src/integrations/jira/jiraConfig.js`

### Why this file exists
Centralized Jira credentials loading and validation from env, plus auth header creation.

### Constants

#### `REQUIRED_ENV_VARS`
- **Purpose:** Explicitly tracks required env keys:
  - `JIRA_BASE_URL`
  - `JIRA_USER_EMAIL`
  - `JIRA_API_TOKEN`

### Functions

#### `loadJiraConfig()`
- **Purpose:** Build complete validated Jira config object.
- **Behavior:**
  1. Reads env values via `getEnvironmentValue`.
  2. Normalizes base URL.
  3. Validates required keys and throws descriptive error if missing.
  4. Builds Basic auth header.
- **Output fields:** `baseUrl`, `userEmail`, `apiToken`, `authorizationHeader`.
- **Why needed:** Single secure/consistent config source for all Jira calls.

#### `normalizeBaseUrl(value)`
- **Purpose:** Validate and canonicalize Jira base URL.
- **Behavior:** ensures absolute URL, allows http/https, trims trailing slash.
- **Why needed:** Prevent malformed endpoint construction.

#### `buildAuthorizationHeader(email, token)`
- **Purpose:** Build Atlassian Basic auth header.
- **Behavior:** base64 encodes `email:token`.
- **Why needed:** Jira Cloud API authentication.

---

## E) `src/integrations/jira/jiraClient.js`

### Why this file exists
Core Jira integration logic: lookup strategy, API request execution, error handling, and data normalization.

### Constants

#### `JIRA_REQUEST_TIMEOUT_MS`
- Timeout guard to avoid hanging calls.

#### `ISSUE_FIELDS`
- Curated field list to request only relevant Jira fields.

#### `ISSUE_KEY_PATTERN`
- Regex to decide whether input is issue key style (`ABC-123`).

### Functions

#### `fetchJiraIssue(reference)`
- **Purpose:** Public entry point for Jira fetching.
- **Behavior:**
  1. Validates input.
  2. Loads config.
  3. Uses `looksLikeIssueKey` decision:
     - key path: `fetchIssueByKey`
     - name path: `searchIssueBySummary`
  4. Normalizes with `normalizeIssue`.
- **Why needed:** Single orchestrator for key-or-name behavior.

#### `fetchIssueByKey(config, issueKey)`
- **Purpose:** Direct issue lookup when key is known.
- **Behavior:** GET `/rest/api/3/issue/{key}?fields=...`.
- **Why needed:** Most accurate and efficient path.

#### `searchIssueBySummary(config, searchText)`
- **Purpose:** Fallback search when key is not provided.
- **Behavior:** POST `/rest/api/3/search` with JQL summary search, returns latest best match.
- **Why needed:** Enables natural-language lookup by ticket name.

#### `requestJiraJson(config, path, options)`
- **Purpose:** Shared authenticated HTTP request function.
- **Behavior:**
  - uses `fetch`
  - sets auth and headers
  - supports JSON body for POST
  - applies timeout via `AbortController`
  - converts non-2xx into readable Jira errors
- **Why needed:** DRY request handling and consistent errors.

#### `normalizeIssue(rawIssue, baseUrl, lookupReference, lookupType)`
- **Purpose:** Convert raw Jira schema into stable internal data contract.
- **Why needed:** Formatter and tool layer should not depend on raw nested Jira shapes.

#### `looksLikeIssueKey(value)`
- **Purpose:** Strategy selector helper.

#### `escapeJqlString(value)`
- **Purpose:** Prevent malformed JQL due to quotes/backslashes.

#### `extractJiraErrorMessage(rawBody, fallback)`
- **Purpose:** Surface meaningful error details from Jira error payload.

#### `safeReadText(response)`
- **Purpose:** Defensive helper so error parsing does not throw.

#### `readName(value)`, `readKey(value)`, `readDisplayName(value)`
- **Purpose:** Normalize nested Jira object fields.

#### `toStringArray(value)`, `toNamedArray(value)`
- **Purpose:** Normalize optional arrays (`labels`, `components`).

#### `readDateString(value)`
- **Purpose:** Normalize date-like string fields.

---

## F) `src/integrations/jira/jiraDescriptionParser.js`

### Why this file exists
Jira descriptions are often not plain text—they are ADF JSON. This file converts ADF to markdown-like text that LLMs can read cleanly.

### Functions

#### `parseJiraDescription(description)`
- **Purpose:** Public parser entry point.
- **Behavior:** handles plain string, empty/object, and ADF object via recursive renderer.

#### `renderNode(node)`
- **Purpose:** Recursive ADF node renderer.
- **Behavior:** maps node types (`paragraph`, `heading`, `list`, `codeBlock`, `table`, etc.) to markdown.

#### `renderChildren(node)`
- **Purpose:** Helper to recursively render child nodes.

#### `applyTextMarks(value, marks)`
- **Purpose:** Applies bold/italic/code/link marks to text.

#### `renderList(node, ordered)`
- **Purpose:** Render ordered/unordered lists.

#### `renderTable(node)`
- **Purpose:** Render ADF tables to simple markdown-style table rows.

#### `normalizeSpacing(text)`
- **Purpose:** Cleanup whitespace/newlines for readable output.

#### `toHeadingLevel(value)`
- **Purpose:** Clamp heading level into valid markdown range.

### Why this parser is important
Without it, many Jira descriptions appear as raw JSON blobs, which is poor for both users and LLM comprehension.

---

## G) `src/integrations/jira/jiraFormatter.js`

### Why this file exists
Transforms normalized issue object into a consistent markdown report used as the tool output payload.

### Functions

#### `formatJiraIssueForLanguageModel(issue)`
- **Purpose:** Build final markdown block with title, link, description, and relevant metadata.
- **Behavior:** calls parser for description and appends structured fields.
- **Why needed:** Controlled shape improves model grounding and user readability.

#### `formatProject(projectKey, projectName)`
- **Purpose:** Human-friendly project string formatting.

---

## H) `src/utils/envLoader.js`

### Why this file matters for Jira
Jira config depends on this utility to read env values from:
1. current `process.env`
2. workspace `.env`
3. extension root `.env`

### Core functions

#### `getEnvironmentValue(name)`
- On-demand value retrieval with lazy file loading.

#### `loadEnvironmentFiles()`
- Reads candidate `.env` files and caches key-values.

#### `parseEnvFile(filePath)` / `parseEnvContents(contents)`
- Dotenv-like parsing with support for `export KEY=VALUE`.

#### `stripWrappingQuotes(value)`
- Removes matching surrounding quotes.

---

## 6) Is there an analytics/summarization component in the tool?

Inside the Jira tool code itself:
- There is **no analytics engine**.
- There is **no separate summarization algorithm**.

What happens:
- Tool returns structured markdown data.
- The **LLM decides** whether to answer shortly or with full details based on user request and prompt context.

That is why you may see:
1. first response: concise summary
2. second response: expanded full detail

Both can be correct behavior from the same tool output.

---

## 7) Where API calls happen (exactly)

Jira REST API call execution happens in:
- `src/integrations/jira/jiraClient.js`
  - `requestJiraJson(...)` (actual `fetch(...)`)

The tool does **not** call an LLM API directly.
- It returns context to VS Code via `LanguageModelToolResult`.
- Model invocation is managed by VS Code’s tool orchestration runtime.

`src/agent/modelClient.js` is for your **custom chat participant’s model calls**, which is a different path and a different concern.

---

## 8) Which files must be “perfect” (priority checklist)

If you want reliability, these are the highest-priority files to keep clean and tested:

1. **`src/integrations/jira/jiraClient.js`**  
   Critical for correctness, API behavior, timeout, error handling, normalization.

2. **`src/integrations/jira/jiraConfig.js`**  
   Critical for security/config validation and auth reliability.

3. **`src/lmTools/fetchJiraTicketLanguageModelTool.js`**  
   Critical for tool invocation contract and input validation.

4. **`package.json` (`contributes.languageModelTools`)**  
   Critical for discoverability and schema correctness.

5. **`src/integrations/jira/jiraDescriptionParser.js`**  
   Critical for rendering quality (especially rich Jira descriptions).

6. **`src/integrations/jira/jiraFormatter.js`**  
   Critical for response consistency and model-grounding quality.

---

## 9) Practical troubleshooting map

If issue occurs, check in this order:

1. Tool not visible/invokable  
   - `package.json` tool declaration
   - `registerLanguageModelTools()` called in `extension.js`

2. “Missing Jira configuration”  
   - `.env` keys exist
   - extension host restarted
   - `envLoader` reads expected location

3. Jira HTTP/auth errors  
   - token/email/base URL correctness
   - inspect message from `extractJiraErrorMessage`

4. Output quality issues  
   - `jiraDescriptionParser.js` (ADF rendering)
   - `jiraFormatter.js` field shaping

---

## 10) Short mental model

Use this one-liner mental model:

**Manifest declares tool → activate registers implementation → tool invoke fetches Jira → parser/formatter shapes output → LLM presents it.**


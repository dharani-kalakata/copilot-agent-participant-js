# Jira Local Tool Documentation

## What this local Jira tool is

This extension now provides a **local language model tool** named:

- `fetch_jira_ticket`

It is registered with `vscode.lm.registerTool` and contributed through `package.json > contributes.languageModelTools`, so agents in your VS Code environment can invoke it and get Jira ticket context directly in chat.

---

## What it fetches

Given a Jira ticket reference (example: `SCRUM-1`) or a ticket name/search text, the tool fetches and returns:

- Ticket key
- Ticket title
- Ticket description
- Relevant details (status, priority, assignee, reporter, issue type, labels, components, created/updated time, and Jira link)

The output is formatted as markdown text so the LLM can present it clearly in chat.

---

## How it works

### 1) Tool registration layer

- `src/lmTools/registerLanguageModelTools.js`
- `src/lmTools/fetchJiraTicketLanguageModelTool.js`

Responsibilities:
- Registers `fetch_jira_ticket` globally.
- Handles invocation lifecycle (`prepareInvocation`, `invoke`).
- Converts tool output into `LanguageModelToolResult` with `LanguageModelTextPart`.

### 2) Jira integration layer

- `src/integrations/jira/jiraConfig.js`
- `src/integrations/jira/jiraClient.js`
- `src/integrations/jira/jiraDescriptionParser.js`
- `src/integrations/jira/jiraFormatter.js`

Responsibilities:
- Loads Jira secrets from environment variables.
- Calls Jira REST API (`/rest/api/3/issue` and `/rest/api/3/search`).
- Parses Jira description payloads (including ADF structures).
- Produces a clean markdown response for the LLM.

### 3) Extension wiring

- `extension.js`

Responsibilities:
- Calls `registerLanguageModelTools()` during activation.
- Keeps existing participant logic unchanged.

---

## Required configuration

Add these values in your `.env` file (or system environment):

```env
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USER_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
```

Also supported in this project:

```env
TAVILY_API_KEY=...
```

Environment loading is handled by:

- `src/utils/envLoader.js`

It reads in this order:
1. `process.env`
2. workspace `.env`
3. extension-root `.env`

---

## Usage

In chat, reference the tool and provide a ticket:

- `#fetch_jira_ticket SCRUM-1`
- `#fetch_jira_ticket <ticket-name-or-summary-text>`

The tool schema expects `ticket` input; internally it also accepts compatible aliases for robustness.

---

## Implementation approach (design notes)

The implementation is intentionally modular:

- **Configuration/auth logic** is isolated (`jiraConfig.js`)
- **HTTP/API logic** is isolated (`jiraClient.js`)
- **description parsing logic** is isolated (`jiraDescriptionParser.js`)
- **final output formatting** is isolated (`jiraFormatter.js`)
- **VS Code LM tool registration/invocation** is isolated (`lmTools/*.js`)

This keeps `extension.js` small and avoids root-file bloat.

---

## Exporting this to another codebase or machine

### Option A: Move within this repository

Copy these files and keep paths equivalent:

- `src/integrations/jira/jiraConfig.js`
- `src/integrations/jira/jiraClient.js`
- `src/integrations/jira/jiraDescriptionParser.js`
- `src/integrations/jira/jiraFormatter.js`
- `src/lmTools/fetchJiraTicketLanguageModelTool.js`
- `src/lmTools/registerLanguageModelTools.js`

Then ensure:

1. `extension.js` calls `registerLanguageModelTools()`
2. `package.json` has `contributes.languageModelTools` for `fetch_jira_ticket`
3. `.env.example` includes Jira env keys

### Option B: Reuse in a different extension

1. Copy the same modules into the target extension.
2. Ensure an env-loader equivalent exists (`getEnvironmentValue` API contract).
3. Register the tool during activation via `vscode.lm.registerTool`.
4. Add matching `languageModelTools` contribution metadata in target `package.json`.

---

## Commands to recreate the same development environment

From repository root:

```bash
npm install
```

Create your env file:

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

Then fill Jira variables in `.env`.

Run validation:

```bash
npm run check
```

Launch extension development host:

- Press `F5` in VS Code.

Then test in chat with:

- `#fetch_jira_ticket SCRUM-1`

---

## Troubleshooting

- **Missing configuration error**  
  Ensure `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, and `JIRA_API_TOKEN` are set.

- **Auth/permission errors from Jira**  
  Verify API token scope and account access to the project/issue.

- **No issue found by ticket name**  
  Try exact ticket key first (for example, `SCRUM-1`), then broader search terms.

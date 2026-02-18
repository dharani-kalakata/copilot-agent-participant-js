const vscode = require('vscode');
const {
	FETCH_JIRA_TICKET_TOOL_NAME,
	createFetchJiraTicketLanguageModelTool
} = require('./fetchJiraTicketLanguageModelTool');

/**
 * Registers extension-provided local language model tools.
 *
 * @returns {vscode.Disposable[]}
 */
function registerLanguageModelTools() {
	if (!vscode.lm || typeof vscode.lm.registerTool !== 'function') {
		return [];
	}

	return [
		vscode.lm.registerTool(
			FETCH_JIRA_TICKET_TOOL_NAME,
			createFetchJiraTicketLanguageModelTool()
		)
	];
}

module.exports = {
	registerLanguageModelTools
};

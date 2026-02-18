const vscode = require('vscode');
const { fetchJiraIssue } = require('../integrations/jira/jiraClient');
const { formatJiraIssueForLanguageModel } = require('../integrations/jira/jiraFormatter');

const FETCH_JIRA_TICKET_TOOL_NAME = 'fetch_jira_ticket';

/**
 * Creates the local language model tool implementation for Jira ticket fetches.
 *
 * @returns {{prepareInvocation:function,invoke:function}}
 */
function createFetchJiraTicketLanguageModelTool() {
	return {
		/**
		 * Provides status text shown while the tool is running.
		 *
		 * @param {{input:any}} options
		 * @returns {{invocationMessage:string}}
		 */
		prepareInvocation(options) {
			const reference = readTicketReferenceOrEmpty(options && options.input);
			return {
				invocationMessage: reference
					? `Fetching Jira ticket "${reference}"`
					: 'Fetching Jira ticket'
			};
		},

		/**
		 * Executes Jira lookup and returns markdown to the model.
		 *
		 * @param {{input:any}} options
		 * @returns {Promise<vscode.LanguageModelToolResult>}
		 */
		async invoke(options) {
			const reference = readTicketReference(options && options.input);
			const issue = await fetchJiraIssue(reference);
			const resultString = formatJiraIssueForLanguageModel(issue);
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(resultString)
			]);
		}
	};
}

/**
 * Reads Jira ticket reference from supported input shapes.
 *
 * @param {any} input
 * @returns {string}
 */
function readTicketReference(input) {
	const reference = readTicketReferenceOrEmpty(input);
	if (reference) {
		return reference;
	}
	throw new Error('fetch_jira_ticket requires a ticket reference in "ticket".');
}

/**
 * Best-effort ticket reference extraction.
 *
 * @param {any} input
 * @returns {string}
 */
function readTicketReferenceOrEmpty(input) {
	if (typeof input === 'string' && input.trim()) {
		return input.trim();
	}

	if (!input || typeof input !== 'object') {
		return '';
	}

	const candidates = [
		input.ticket,
		input.ticketKey,
		input.ticketName,
		input.issueKey,
		input.issue,
		input.query,
		input.name
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return candidate.trim();
		}
	}

	return '';
}

module.exports = {
	FETCH_JIRA_TICKET_TOOL_NAME,
	createFetchJiraTicketLanguageModelTool
};

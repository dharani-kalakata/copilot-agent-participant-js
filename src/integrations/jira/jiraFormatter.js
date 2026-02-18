const { parseJiraDescription } = require('./jiraDescriptionParser');

/**
 * Formats normalized Jira issue data into markdown for LLM context.
 *
 * @param {object} issue
 * @returns {string}
 */
function formatJiraIssueForLanguageModel(issue) {
	const description = parseJiraDescription(issue.description);
	const lines = [];

	lines.push(`## Jira Ticket ${issue.key || '(unknown key)'}`);
	lines.push('');
	lines.push(`**Title:** ${issue.title || '(untitled ticket)'}`);
	if (issue.url) {
		lines.push(`**Link:** ${issue.url}`);
	}
	if (issue.projectKey || issue.projectName) {
		lines.push(`**Project:** ${formatProject(issue.projectKey, issue.projectName)}`);
	}
	lines.push('');

	lines.push('### Description');
	lines.push(description || '(No description was provided for this ticket.)');
	lines.push('');

	lines.push('### Relevant details');
	lines.push(`- **Status:** ${issue.status || '(not set)'}`);
	lines.push(`- **Priority:** ${issue.priority || '(not set)'}`);
	lines.push(`- **Issue Type:** ${issue.issueType || '(not set)'}`);
	lines.push(`- **Assignee:** ${issue.assignee || '(unassigned)'}`);
	lines.push(`- **Reporter:** ${issue.reporter || '(not set)'}`);
	lines.push(`- **Created:** ${issue.created || '(not set)'}`);
	lines.push(`- **Updated:** ${issue.updated || '(not set)'}`);

	if (Array.isArray(issue.labels) && issue.labels.length > 0) {
		lines.push(`- **Labels:** ${issue.labels.join(', ')}`);
	}
	if (Array.isArray(issue.components) && issue.components.length > 0) {
		lines.push(`- **Components:** ${issue.components.join(', ')}`);
	}
	if (issue.lookupReference) {
		lines.push(`- **Lookup Input:** ${issue.lookupReference}`);
	}
	if (issue.lookupType === 'ticketName') {
		lines.push('- **Lookup Mode:** Summary search');
	} else if (issue.lookupType === 'issueKey') {
		lines.push('- **Lookup Mode:** Issue key');
	}

	return lines.join('\n');
}

/**
 * Formats Jira project key/name as one readable string.
 *
 * @param {string} projectKey
 * @param {string} projectName
 * @returns {string}
 */
function formatProject(projectKey, projectName) {
	if (projectKey && projectName) {
		return `${projectKey} (${projectName})`;
	}
	return projectKey || projectName || '(not set)';
}

module.exports = {
	formatJiraIssueForLanguageModel
};

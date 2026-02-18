const { loadJiraConfig } = require('./jiraConfig');

const JIRA_REQUEST_TIMEOUT_MS = 20000;
const ISSUE_FIELDS = Object.freeze([
	'summary',
	'description',
	'status',
	'priority',
	'assignee',
	'reporter',
	'issuetype',
	'project',
	'labels',
	'components',
	'created',
	'updated'
]);
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;

/**
 * Fetches one Jira issue using either issue key or summary text.
 *
 * @param {string} reference
 * @returns {Promise<object>}
 */
async function fetchJiraIssue(reference) {
	const normalizedReference = String(reference || '').trim();
	if (!normalizedReference) {
		throw new Error('fetch_jira_ticket requires a Jira ticket key or name.');
	}

	const config = await loadJiraConfig();
	if (looksLikeIssueKey(normalizedReference)) {
		const issue = await fetchIssueByKey(config, normalizedReference);
		return normalizeIssue(issue, config.baseUrl, normalizedReference, 'issueKey');
	}

	const issue = await searchIssueBySummary(config, normalizedReference);
	return normalizeIssue(issue, config.baseUrl, normalizedReference, 'ticketName');
}

/**
 * Retrieves an issue directly by Jira issue key.
 *
 * @param {{baseUrl:string,authorizationHeader:string}} config
 * @param {string} issueKey
 * @returns {Promise<any>}
 */
async function fetchIssueByKey(config, issueKey) {
	const encodedFields = encodeURIComponent(ISSUE_FIELDS.join(','));
	const encodedIssueKey = encodeURIComponent(issueKey);
	const path = `/rest/api/3/issue/${encodedIssueKey}?fields=${encodedFields}`;
	return requestJiraJson(config, path, { method: 'GET' });
}

/**
 * Searches Jira issues by summary text and returns best match.
 *
 * @param {{baseUrl:string,authorizationHeader:string}} config
 * @param {string} searchText
 * @returns {Promise<any>}
 */
async function searchIssueBySummary(config, searchText) {
	const escapedSearchText = escapeJqlString(searchText);
	const payload = {
		jql: `summary ~ "${escapedSearchText}" ORDER BY updated DESC`,
		maxResults: 1,
		fields: ISSUE_FIELDS
	};
	const result = await requestJiraJson(config, '/rest/api/3/search', {
		method: 'POST',
		body: payload
	});

	const issues = Array.isArray(result && result.issues) ? result.issues : [];
	if (issues.length === 0) {
		throw new Error(`No Jira ticket found matching "${searchText}".`);
	}

	return issues[0];
}

/**
 * Makes an authenticated Jira REST request and returns parsed JSON.
 *
 * @param {{baseUrl:string,authorizationHeader:string}} config
 * @param {string} path
 * @param {{method:'GET'|'POST',body?:object}} options
 * @returns {Promise<any>}
 */
async function requestJiraJson(config, path, options) {
	if (typeof fetch !== 'function') {
		throw new Error('Global fetch is unavailable in this environment.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), JIRA_REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(`${config.baseUrl}${path}`, {
			method: options.method,
			headers: {
				Accept: 'application/json',
				Authorization: config.authorizationHeader,
				...(options.body ? { 'Content-Type': 'application/json' } : {})
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
			signal: controller.signal
		});

		if (!response.ok) {
			const rawBody = await safeReadText(response);
			throw new Error(`Jira request failed (${response.status}): ${extractJiraErrorMessage(rawBody, response.statusText)}`);
		}

		return await response.json();
	} catch (error) {
		if (error && error.name === 'AbortError') {
			throw new Error('Jira request timed out.');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Converts raw Jira issue JSON to a stable shape for formatting.
 *
 * @param {any} rawIssue
 * @param {string} baseUrl
 * @param {string} lookupReference
 * @param {'issueKey'|'ticketName'} lookupType
 * @returns {object}
 */
function normalizeIssue(rawIssue, baseUrl, lookupReference, lookupType) {
	const fields = rawIssue && rawIssue.fields ? rawIssue.fields : {};
	const key = String(rawIssue && rawIssue.key || '').trim();

	return {
		key,
		title: String(fields.summary || '(untitled ticket)'),
		description: fields.description,
		status: readName(fields.status),
		priority: readName(fields.priority),
		issueType: readName(fields.issuetype),
		projectKey: readKey(fields.project),
		projectName: readName(fields.project),
		assignee: readDisplayName(fields.assignee),
		reporter: readDisplayName(fields.reporter),
		labels: toStringArray(fields.labels),
		components: toNamedArray(fields.components),
		created: readDateString(fields.created),
		updated: readDateString(fields.updated),
		lookupReference,
		lookupType,
		url: key ? `${baseUrl}/browse/${encodeURIComponent(key)}` : ''
	};
}

/**
 * Checks if input looks like a Jira issue key.
 *
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeIssueKey(value) {
	return ISSUE_KEY_PATTERN.test(String(value || '').trim());
}

/**
 * Escapes a string for safe usage in JQL quoted strings.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeJqlString(value) {
	return String(value || '')
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"');
}

/**
 * Returns best Jira error detail from response body.
 *
 * @param {string} rawBody
 * @param {string} fallback
 * @returns {string}
 */
function extractJiraErrorMessage(rawBody, fallback) {
	const trimmedBody = String(rawBody || '').trim();
	if (!trimmedBody) {
		return fallback || 'Unknown Jira error';
	}

	try {
		const parsed = JSON.parse(trimmedBody);
		const errorMessages = Array.isArray(parsed.errorMessages) ? parsed.errorMessages : [];
		const fieldErrors = parsed && typeof parsed.errors === 'object' && parsed.errors
			? Object.entries(parsed.errors).map(([field, message]) => `${field}: ${message}`)
			: [];
		const combined = [...errorMessages, ...fieldErrors].filter(Boolean).join('; ').trim();
		return combined || fallback || trimmedBody;
	} catch {
		return trimmedBody;
	}
}

/**
 * Safely reads response text when available.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function safeReadText(response) {
	try {
		return await response.text();
	} catch {
		return '';
	}
}

/**
 * Reads the `name` property from Jira objects.
 *
 * @param {any} value
 * @returns {string}
 */
function readName(value) {
	return value && typeof value.name === 'string' ? value.name.trim() : '';
}

/**
 * Reads the `key` property from Jira objects.
 *
 * @param {any} value
 * @returns {string}
 */
function readKey(value) {
	return value && typeof value.key === 'string' ? value.key.trim() : '';
}

/**
 * Reads `displayName` from Jira user objects.
 *
 * @param {any} value
 * @returns {string}
 */
function readDisplayName(value) {
	return value && typeof value.displayName === 'string' ? value.displayName.trim() : '';
}

/**
 * Normalizes Jira array fields to string arrays.
 *
 * @param {any} value
 * @returns {string[]}
 */
function toStringArray(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => String(entry || '').trim())
		.filter(Boolean);
}

/**
 * Normalizes Jira named arrays to plain names.
 *
 * @param {any} value
 * @returns {string[]}
 */
function toNamedArray(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => readName(entry))
		.filter(Boolean);
}

/**
 * Reads date-like strings from Jira fields.
 *
 * @param {any} value
 * @returns {string}
 */
function readDateString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

module.exports = {
	fetchJiraIssue
};

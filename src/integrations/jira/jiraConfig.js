const { getEnvironmentValue } = require('../../utils/envLoader');

const REQUIRED_ENV_VARS = Object.freeze([
	'JIRA_BASE_URL',
	'JIRA_USER_EMAIL',
	'JIRA_API_TOKEN'
]);

/**
 * Loads Jira API configuration from environment variables.
 *
 * @returns {Promise<{baseUrl:string,userEmail:string,apiToken:string,authorizationHeader:string}>}
 */
async function loadJiraConfig() {
	const baseUrl = normalizeBaseUrl(await getEnvironmentValue('JIRA_BASE_URL'));
	const userEmail = String(await getEnvironmentValue('JIRA_USER_EMAIL')).trim();
	const apiToken = String(await getEnvironmentValue('JIRA_API_TOKEN')).trim();

	const missing = [];
	if (!baseUrl) {
		missing.push('JIRA_BASE_URL');
	}
	if (!userEmail) {
		missing.push('JIRA_USER_EMAIL');
	}
	if (!apiToken) {
		missing.push('JIRA_API_TOKEN');
	}

	if (missing.length > 0) {
		throw new Error(
			`Missing Jira configuration: ${missing.join(', ')}. ` +
			'Add these values to your .env file or environment variables.'
		);
	}

	return {
		baseUrl,
		userEmail,
		apiToken,
		authorizationHeader: buildAuthorizationHeader(userEmail, apiToken)
	};
}

/**
 * Normalizes and validates Jira base URL.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeBaseUrl(value) {
	const raw = String(value || '').trim();
	if (!raw) {
		return '';
	}

	let parsed;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error('JIRA_BASE_URL must be a valid absolute URL (for example, https://your-domain.atlassian.net).');
	}

	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		throw new Error('JIRA_BASE_URL must use http or https.');
	}

	const normalizedPath = parsed.pathname === '/'
		? ''
		: parsed.pathname.replace(/\/+$/, '');

	return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
}

/**
 * Builds Jira Basic authentication header from email/token.
 *
 * @param {string} email
 * @param {string} token
 * @returns {string}
 */
function buildAuthorizationHeader(email, token) {
	const credentials = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
	return `Basic ${credentials}`;
}

module.exports = {
	REQUIRED_ENV_VARS,
	loadJiraConfig
};

const vscode = require('vscode');

const DEFAULT_SETTINGS = Object.freeze({
	maxIterations: 6,
	profile: 'copilotLike',
	modelVendor: 'copilot',
	modelFamily: '',
	maxReadLines: 250,
	maxListDepth: 3,
	maxSearchResults: 50,
	enableFileEditTools: true,
	maxWriteChars: 200000,
	enableCommandTool: true,
	allowedCommands: [
		'npm test',
		'npm run test',
		'npm run lint',
		'npm run build',
		'pnpm test',
		'pnpm run test',
		'pnpm run lint',
		'pnpm run build',
		'yarn test',
		'yarn lint',
		'yarn build'
	],
	commandTimeoutMs: 120000
});

/**
 * Clamps a numeric value to an integer range with fallback.
 *
 * @param {any} value - Raw config value.
 * @param {number} min - Minimum allowed integer.
 * @param {number} max - Maximum allowed integer.
 * @param {number} fallback - Fallback when value is invalid.
 * @returns {number}
 */
function clampInteger(value, min, max, fallback) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}
	const asInteger = Math.trunc(numeric);
	return Math.min(max, Math.max(min, asInteger));
}

/**
 * Normalizes array settings into a non-empty trimmed string array.
 *
 * @param {any} value - Raw config array.
 * @param {string[]} fallback - Fallback array if input is invalid/empty.
 * @returns {string[]}
 */
function normalizeStringArray(value, fallback) {
	if (!Array.isArray(value)) {
		return [...fallback];
	}
	const normalized = value.map((entry) => String(entry || '').trim()).filter(Boolean);
	return normalized.length > 0 ? normalized : [...fallback];
}

/**
 * Loads and validates participant settings from workspace configuration.
 *
 * @returns {object} Strongly-validated runtime settings.
 */
function loadAgentSettings() {
	const config = vscode.workspace.getConfiguration('agentModeParticipant');

	return {
		maxIterations: clampInteger(config.get('maxIterations'), 1, 20, DEFAULT_SETTINGS.maxIterations),
		profile: String(config.get('profile', DEFAULT_SETTINGS.profile) || DEFAULT_SETTINGS.profile),
		modelVendor: String(config.get('modelVendor', DEFAULT_SETTINGS.modelVendor) || DEFAULT_SETTINGS.modelVendor),
		modelFamily: String(config.get('modelFamily', DEFAULT_SETTINGS.modelFamily) || DEFAULT_SETTINGS.modelFamily).trim(),
		maxReadLines: clampInteger(config.get('maxReadLines'), 20, 2000, DEFAULT_SETTINGS.maxReadLines),
		maxListDepth: clampInteger(config.get('maxListDepth'), 1, 8, DEFAULT_SETTINGS.maxListDepth),
		maxSearchResults: clampInteger(config.get('maxSearchResults'), 5, 300, DEFAULT_SETTINGS.maxSearchResults),
		enableFileEditTools: Boolean(config.get('enableFileEditTools', DEFAULT_SETTINGS.enableFileEditTools)),
		maxWriteChars: clampInteger(config.get('maxWriteChars'), 1000, 2000000, DEFAULT_SETTINGS.maxWriteChars),
		enableCommandTool: Boolean(config.get('enableCommandTool', DEFAULT_SETTINGS.enableCommandTool)),
		allowedCommands: normalizeStringArray(config.get('allowedCommands'), DEFAULT_SETTINGS.allowedCommands),
		commandTimeoutMs: clampInteger(config.get('commandTimeoutMs'), 1000, 900000, DEFAULT_SETTINGS.commandTimeoutMs)
	};
}

module.exports = {
	DEFAULT_SETTINGS,
	loadAgentSettings
};

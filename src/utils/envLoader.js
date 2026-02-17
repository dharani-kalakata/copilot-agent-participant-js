const fs = require('fs/promises');
const path = require('path');
const { getWorkspaceRootPath } = require('./workspacePaths');

const loadedValues = new Map();

/**
 * Returns an environment variable value, loading `.env` files on demand.
 *
 * Lookup order:
 * 1. existing process.env value,
 * 2. workspace `.env`,
 * 3. extension-root `.env`.
 *
 * @param {string} name - Environment variable name.
 * @returns {Promise<string>} Resolved value or empty string.
 */
async function getEnvironmentValue(name) {
	const envName = String(name || '').trim();
	if (!envName) {
		return '';
	}

	const processValue = process.env[envName];
	if (typeof processValue === 'string' && processValue.trim()) {
		return processValue.trim();
	}

	await loadEnvironmentFiles();

	const cachedValue = loadedValues.get(envName);
	return typeof cachedValue === 'string' ? cachedValue : '';
}

/**
 * Loads and caches `.env` key/value pairs from known file locations.
 *
 * @returns {Promise<void>}
 */
async function loadEnvironmentFiles() {
	const candidatePaths = [];

	try {
		const workspaceRoot = getWorkspaceRootPath();
		candidatePaths.push(path.join(workspaceRoot, '.env'));
	} catch {
		// Workspace root may be unavailable outside a folder context.
	}

	const extensionRoot = path.resolve(__dirname, '..', '..');
	candidatePaths.push(path.join(extensionRoot, '.env'));

	const freshValues = new Map();
	for (const filePath of new Set(candidatePaths)) {
		const fileValues = await parseEnvFile(filePath);
		for (const [key, value] of fileValues) {
			if (!freshValues.has(key)) {
				freshValues.set(key, value);
			}
		}
	}

	loadedValues.clear();
	for (const [key, value] of freshValues) {
		loadedValues.set(key, value);
		if (typeof process.env[key] !== 'string' || !process.env[key].trim()) {
			process.env[key] = value;
		}
	}
}

/**
 * Reads and parses one `.env` file.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {Promise<Map<string,string>>}
 */
async function parseEnvFile(filePath) {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return parseEnvContents(raw);
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return new Map();
		}
		throw error;
	}
}

/**
 * Parses dotenv-style contents into key/value pairs.
 *
 * Supported forms:
 * - KEY=VALUE
 * - export KEY=VALUE
 *
 * @param {string} contents
 * @returns {Map<string,string>}
 */
function parseEnvContents(contents) {
	const values = new Map();
	const lines = String(contents || '').split(/\r?\n/);

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith('#')) {
			continue;
		}

		const normalizedLine = trimmedLine.startsWith('export ')
			? trimmedLine.slice('export '.length).trim()
			: trimmedLine;
		const separatorIndex = normalizedLine.indexOf('=');
		if (separatorIndex <= 0) {
			continue;
		}

		const key = normalizedLine.slice(0, separatorIndex).trim();
		const value = stripWrappingQuotes(normalizedLine.slice(separatorIndex + 1).trim());
		if (key) {
			values.set(key, value);
		}
	}

	return values;
}

/**
 * Removes matching wrapping quotes from values.
 *
 * @param {string} value
 * @returns {string}
 */
function stripWrappingQuotes(value) {
	if (value.length < 2) {
		return value;
	}

	const startsWithSingle = value.startsWith('\'') && value.endsWith('\'');
	const startsWithDouble = value.startsWith('"') && value.endsWith('"');
	if (startsWithSingle || startsWithDouble) {
		return value.slice(1, -1);
	}

	return value;
}

module.exports = {
	getEnvironmentValue
};

const path = require('path');
const { fileURLToPath } = require('url');
const vscode = require('vscode');

/**
 * Returns the first opened workspace root path.
 *
 * @returns {string} Absolute workspace root path.
 */
function getWorkspaceRootPath() {
	const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	if (!folder) {
		throw new Error('Open a workspace folder before running agent tools.');
	}
	return folder.uri.fsPath;
}

/**
 * Resolves a requested path inside the workspace and blocks path escape.
 *
 * @param {string} rootPath - Absolute workspace root.
 * @param {string} requestedPath - User/tool-provided path.
 * @returns {string} Absolute resolved path.
 */
function resolveWorkspacePath(rootPath, requestedPath) {
	const relativePath = normalizeRequestedWorkspacePath(requestedPath);

	const resolvedPath = path.resolve(rootPath, relativePath);
	if (!isInsideWorkspace(rootPath, resolvedPath)) {
		throw new Error(`Path is outside the workspace: ${relativePath}`);
	}

	return resolvedPath;
}

/**
 * Normalizes a model-provided path into a workspace-relative path string.
 *
 * Handles common chat reference forms such as:
 * - #file:src/app.py
 * - file:src/app.py
 * - file:///absolute/path/to/app.py
 * - src/app.py:42 (line suffix)
 *
 * @param {any} requestedPath
 * @returns {string}
 */
function normalizeRequestedWorkspacePath(requestedPath) {
	if (typeof requestedPath !== 'string') {
		return '.';
	}

	let value = requestedPath.trim();
	if (!value) {
		return '.';
	}

	value = unwrapQuotedValue(value);
	value = value.replace(/^#(?:file|folder|workspace):/i, '');

	if (/^file:\/\//i.test(value)) {
		try {
			value = fileURLToPath(value);
		} catch {
			// Keep original text if URL parsing fails.
		}
	} else {
		value = value.replace(/^(?:file|folder|workspace):/i, '');
	}

	value = stripLineSuffix(value);

	if (
		/^[\\/]/.test(value) &&
		!/^[\\/]{2}/.test(value) &&
		!/^[A-Za-z]:[\\/]/.test(value)
	) {
		value = value.slice(1);
	}

	value = value.trim();
	return value || '.';
}

/**
 * Removes one layer of surrounding quotes/backticks.
 *
 * @param {string} value
 * @returns {string}
 */
function unwrapQuotedValue(value) {
	const match = value.match(/^(['"`])(.*)\1$/);
	return match ? match[2].trim() : value;
}

/**
 * Strips common line-number suffixes from a path string.
 *
 * @param {string} value
 * @returns {string}
 */
function stripLineSuffix(value) {
	return value
		.replace(/#L\d+(?:-L?\d+)?$/i, '')
		.replace(/:(?:L)?\d+(?:-\d+)?$/i, '');
}

/**
 * Checks whether candidatePath is inside rootPath.
 *
 * @param {string} rootPath
 * @param {string} candidatePath
 * @returns {boolean}
 */
function isInsideWorkspace(rootPath, candidatePath) {
	const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Converts an absolute path to a forward-slash workspace-relative path.
 *
 * @param {string} rootPath
 * @param {string} fullPath
 * @returns {string}
 */
function toPosixRelative(rootPath, fullPath) {
	const relative = path.relative(rootPath, fullPath);
	return relative.split(path.sep).join('/');
}

module.exports = {
	getWorkspaceRootPath,
	resolveWorkspacePath,
	isInsideWorkspace,
	toPosixRelative,
	normalizeRequestedWorkspacePath
};

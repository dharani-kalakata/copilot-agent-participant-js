const fs = require('fs/promises');
const { getWorkspaceRootPath, resolveWorkspacePath, toPosixRelative } = require('../utils/workspacePaths');

/**
 * Builds the edit_file tool.
 *
 * @param {object} settings - Runtime participant settings.
 * @param {number} settings.maxWriteChars - Maximum payload size.
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createEditFileTool(settings) {
	return {
		name: 'edit_file',
		description: 'Apply exact string replacements in an existing workspace file.',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Relative workspace file path.' },
				oldString: { type: 'string', description: 'Exact text to find.' },
				newString: { type: 'string', description: 'Replacement text.' },
				replaceAll: { type: 'boolean', description: 'Replace all matches instead of exactly one.' }
			},
			required: ['path', 'oldString', 'newString']
		},
		/**
		 * Applies an in-place text replacement edit immediately.
		 *
		 * @param {{path:string,oldString:string,newString:string,replaceAll?:boolean}} input
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input) {
			const relativePath = typeof input.path === 'string' ? input.path.trim() : '';
			if (!relativePath) {
				throw new Error('edit_file requires "path".');
			}

			const oldString = typeof input.oldString === 'string' ? input.oldString : '';
			const newString = typeof input.newString === 'string' ? input.newString : '';

			if (!oldString) {
				throw new Error('edit_file requires non-empty "oldString".');
			}

			if (oldString.length > settings.maxWriteChars || newString.length > settings.maxWriteChars) {
				throw new Error(`edit_file payload exceeds maxWriteChars (${settings.maxWriteChars}).`);
			}

			const workspaceRoot = getWorkspaceRootPath();
			const filePath = resolveWorkspacePath(workspaceRoot, relativePath);
			const workspaceRelativePath = toPosixRelative(workspaceRoot, filePath);
			const originalContent = await fs.readFile(filePath, 'utf8');
			const matchCount = countOccurrences(originalContent, oldString);

			if (matchCount === 0) {
				throw new Error(`edit_file could not find oldString in ${workspaceRelativePath}.`);
			}

			const replaceAll = Boolean(input.replaceAll);
			if (!replaceAll && matchCount > 1) {
				throw new Error(`edit_file found ${matchCount} matches; provide a more specific oldString or set replaceAll=true.`);
			}

			const replacementsApplied = replaceAll ? matchCount : 1;
			const updatedContent = replaceAll
				? originalContent.split(oldString).join(newString)
				: replaceFirst(originalContent, oldString, newString);

			await fs.writeFile(filePath, updatedContent, 'utf8');

			return {
				ok: true,
				output: `Edited file: ${workspaceRelativePath} (${replacementsApplied} replacement${replacementsApplied === 1 ? '' : 's'})`
			};
		}
	};
}

/**
 * Replaces the first occurrence of oldString in the provided value.
 *
 * @param {string} value - Original string.
 * @param {string} oldString - Substring to replace.
 * @param {string} newString - Replacement substring.
 * @returns {string} Updated string.
 */
function replaceFirst(value, oldString, newString) {
	const index = value.indexOf(oldString);
	if (index === -1) {
		return value;
	}
	return value.slice(0, index) + newString + value.slice(index + oldString.length);
}

/**
 * Counts non-overlapping occurrences of a substring.
 *
 * @param {string} value - Source string.
 * @param {string} search - Substring to search for.
 * @returns {number} Number of matches.
 */
function countOccurrences(value, search) {
	if (!search) {
		return 0;
	}

	let count = 0;
	let startIndex = 0;

	while (true) {
		const index = value.indexOf(search, startIndex);
		if (index === -1) {
			return count;
		}
		count += 1;
		startIndex = index + search.length;
	}
}

module.exports = {
	createEditFileTool
};

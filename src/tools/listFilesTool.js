const fs = require('fs/promises');
const path = require('path');
const { getWorkspaceRootPath, resolveWorkspacePath, toPosixRelative } = require('../utils/workspacePaths');

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'out', '.next', '.yarn']);
const MAX_ENTRIES = 500;

/**
 * Builds the list_files tool.
 *
 * @param {object} settings
 * @param {number} settings.maxListDepth
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createListFilesTool(settings) {
	return {
		name: 'list_files',
		description: 'List files and directories from the workspace.',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Relative workspace path. Default ".".' },
				maxDepth: { type: 'number', description: `Optional override, default ${settings.maxListDepth}.` }
			},
			required: []
		},
		/**
		 * Lists files/directories under a workspace path.
		 *
		 * @param {{path?:string,maxDepth?:number}} input
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input) {
			const workspaceRoot = getWorkspaceRootPath();
			const maxDepth = toDepth(input.maxDepth, settings.maxListDepth);
			const startPath = resolveWorkspacePath(workspaceRoot, input.path);
			const startStat = await fs.stat(startPath);

			if (startStat.isFile()) {
				return { ok: true, output: toPosixRelative(workspaceRoot, startPath) };
			}

			const entries = [];
			await walkDirectory(startPath, 0, entries, workspaceRoot, maxDepth);

			if (entries.length === 0) {
				return { ok: true, output: '(no files found)' };
			}

			const maybeTruncated = entries.length >= MAX_ENTRIES
				? '\n...truncated: too many entries...'
				: '';
			return { ok: true, output: entries.join('\n') + maybeTruncated };
		}
	};
}

/**
 * Recursively walks directories and collects relative paths.
 *
 * @param {string} currentPath
 * @param {number} depth
 * @param {string[]} entries
 * @param {string} workspaceRoot
 * @param {number} maxDepth
 * @returns {Promise<void>}
 */
async function walkDirectory(currentPath, depth, entries, workspaceRoot, maxDepth) {
	if (entries.length >= MAX_ENTRIES) {
		return;
	}

	const directoryEntries = await fs.readdir(currentPath, { withFileTypes: true });
	directoryEntries.sort((a, b) => a.name.localeCompare(b.name));

	for (const entry of directoryEntries) {
		if (entries.length >= MAX_ENTRIES) {
			return;
		}

		if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) {
			continue;
		}

		const fullPath = path.join(currentPath, entry.name);
		const relativePath = toPosixRelative(workspaceRoot, fullPath);
		entries.push(entry.isDirectory() ? `${relativePath}/` : relativePath);

		if (entry.isDirectory() && depth < maxDepth) {
			await walkDirectory(fullPath, depth + 1, entries, workspaceRoot, maxDepth);
		}
	}
}

/**
 * Converts depth input to a bounded integer.
 *
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function toDepth(value, fallback) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}
	return Math.min(8, Math.max(1, Math.trunc(numeric)));
}

module.exports = {
	createListFilesTool
};

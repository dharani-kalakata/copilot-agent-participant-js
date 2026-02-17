const fs = require('fs/promises');
const { getWorkspaceRootPath, resolveWorkspacePath, toPosixRelative } = require('../utils/workspacePaths');

/**
 * Builds the read_file tool.
 *
 * @param {object} settings
 * @param {number} settings.maxReadLines
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createReadFileTool(settings) {
	return {
		name: 'read_file',
		description: 'Read text content from a workspace file with optional line range.',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Relative workspace file path.' },
				startLine: { type: 'number', description: '1-based start line. Default 1.' },
				endLine: { type: 'number', description: '1-based end line. Default startLine + maxReadLines.' }
			},
			required: ['path']
		},
		/**
		 * Reads file content and returns numbered line output.
		 *
		 * @param {{path:string,startLine?:number,endLine?:number}} input
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input) {
			const relativePath = typeof input.path === 'string' ? input.path.trim() : '';
			if (!relativePath) {
				throw new Error('read_file requires "path".');
			}

			const workspaceRoot = getWorkspaceRootPath();
			const filePath = resolveWorkspacePath(workspaceRoot, relativePath);
			const content = await fs.readFile(filePath, 'utf8');
			const lines = content.split(/\r?\n/);

			if (lines.length === 0) {
				return {
					ok: true,
					output: `File: ${toPosixRelative(workspaceRoot, filePath)}\n(empty file)`
				};
			}

			let startLine = toPositiveLine(input.startLine, 1);
			let endLine = toPositiveLine(input.endLine, startLine + settings.maxReadLines - 1);

			if (endLine < startLine) {
				[startLine, endLine] = [endLine, startLine];
			}

			startLine = Math.min(lines.length, Math.max(1, startLine));
			const maxEndLine = Math.min(lines.length, startLine + settings.maxReadLines - 1);
			endLine = Math.min(Math.max(startLine, endLine), maxEndLine);

			const selected = lines
				.slice(startLine - 1, endLine)
				.map((line, index) => `${startLine + index}. ${line}`)
				.join('\n');

			const truncatedNote = endLine < lines.length
				? `\n...truncated to ${settings.maxReadLines} lines...`
				: '';

			return {
				ok: true,
				output: `File: ${toPosixRelative(workspaceRoot, filePath)}\n${selected}${truncatedNote}`
			};
		}
	};
}

/**
 * Converts an input value into a positive line number.
 *
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveLine(value, fallback) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}
	return Math.max(1, Math.trunc(numeric));
}

module.exports = {
	createReadFileTool
};

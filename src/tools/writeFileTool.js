const fs = require('fs/promises');
const path = require('path');
const { getWorkspaceRootPath, resolveWorkspacePath, toPosixRelative } = require('../utils/workspacePaths');

/**
 * Builds the write_file tool.
 *
 * @param {object} settings - Runtime participant settings.
 * @param {number} settings.maxWriteChars - Max accepted payload size.
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createWriteFileTool(settings) {
	return {
		name: 'write_file',
		description: 'Create or overwrite a workspace file with provided content.',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Relative workspace file path.' },
				content: { type: 'string', description: 'Full content to write to the file.' },
				append: { type: 'boolean', description: 'Append content instead of replacing file.' }
			},
			required: ['path', 'content']
		},
		/**
		 * Writes or appends file content immediately.
		 *
		 * @param {{path:string,content:string,append?:boolean}} input
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input) {
			const relativePath = typeof input.path === 'string' ? input.path.trim() : '';
			if (!relativePath) {
				throw new Error('write_file requires "path".');
			}

			const content = typeof input.content === 'string' ? input.content : '';
			if (content.length > settings.maxWriteChars) {
				throw new Error(`write_file content exceeds maxWriteChars (${settings.maxWriteChars}).`);
			}

			const workspaceRoot = getWorkspaceRootPath();
			const filePath = resolveWorkspacePath(workspaceRoot, relativePath);
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			const append = Boolean(input.append);
			const existed = await pathExists(filePath);

			if (append) {
				await fs.appendFile(filePath, content, 'utf8');
			} else {
				await fs.writeFile(filePath, content, 'utf8');
			}

			const action = append ? (existed ? 'appended' : 'created+appended') : (existed ? 'updated' : 'created');
			return {
				ok: true,
				output: `File ${action}: ${toPosixRelative(workspaceRoot, filePath)} (${content.length} chars)`
			};
		}
	};
}

/**
 * Checks whether a file exists on disk.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {Promise<boolean>} True when file exists.
 */
async function pathExists(filePath) {
	try {
		await fs.stat(filePath);
		return true;
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

module.exports = {
	createWriteFileTool
};

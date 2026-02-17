const { exec } = require('child_process');
const { promisify } = require('util');
const { getWorkspaceRootPath } = require('../utils/workspacePaths');

const execAsync = promisify(exec);
const MAX_OUTPUT_CHARS = 12000;

/**
 * Builds the run_command tool with allowlist safeguards.
 *
 * @param {object} settings
 * @param {string[]} settings.allowedCommands
 * @param {number} settings.commandTimeoutMs
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createRunCommandTool(settings) {
	return {
		name: 'run_command',
		description: 'Run an allowlisted shell command from workspace root.',
		inputSchema: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'Allowlisted command to execute.' }
			},
			required: ['command']
		},
		/**
		 * Executes an allowlisted shell command and returns trimmed output.
		 *
		 * @param {{command:string}} input
		 * @returns {Promise<{ok:boolean,output:string,error?:string}>}
		 */
		async execute(input) {
			const command = typeof input.command === 'string' ? input.command.trim() : '';
			if (!command) {
				throw new Error('run_command requires "command".');
			}

			if (!isAllowlisted(command, settings.allowedCommands)) {
				throw new Error(`Command is not allowlisted: ${command}`);
			}

			const cwd = getWorkspaceRootPath();

			try {
				const { stdout, stderr } = await execAsync(command, {
					cwd,
					timeout: settings.commandTimeoutMs,
					windowsHide: true,
					maxBuffer: 8 * 1024 * 1024
				});

				const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
				return {
					ok: true,
					output: trimOutput(combinedOutput || '(command completed with no output)')
				};
			} catch (error) {
				const stderr = error && typeof error.stderr === 'string' ? error.stderr : '';
				const stdout = error && typeof error.stdout === 'string' ? error.stdout : '';
				const fallbackMessage = error && error.message ? error.message : 'Unknown command failure';
				const combinedError = [stdout, stderr].filter(Boolean).join('\n').trim() || fallbackMessage;

				return {
					ok: false,
					output: trimOutput(combinedError),
					error: `Command failed: ${combinedError}`
				};
			}
		}
	};
}

/**
 * Checks if a command starts with an allowlisted prefix.
 *
 * @param {string} command
 * @param {string[]} allowlist
 * @returns {boolean}
 */
function isAllowlisted(command, allowlist) {
	const normalizedCommand = command.toLowerCase();
	return allowlist.some((entry) => {
		const prefix = String(entry || '').trim().toLowerCase();
		return Boolean(prefix) && (normalizedCommand === prefix || normalizedCommand.startsWith(`${prefix} `));
	});
}

/**
 * Truncates long command output to keep context manageable.
 *
 * @param {string} text
 * @returns {string}
 */
function trimOutput(text) {
	if (text.length <= MAX_OUTPUT_CHARS) {
		return text;
	}
	return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...output truncated...`;
}

module.exports = {
	createRunCommandTool
};

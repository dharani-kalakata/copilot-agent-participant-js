const vscode = require('vscode');

const TERMINAL_NAME = 'DSX Change Assist Tools';
let sharedTerminal = undefined;

/**
 * Builds the hello_world tool used for quick tool-calling checks.
 *
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createHelloWorldTool() {
	return {
		name: 'hello_world',
		description: 'Print a hello-world style message in the VS Code integrated terminal.',
		inputSchema: {
			type: 'object',
			properties: {
				message: { type: 'string', description: 'Optional message to print. Defaults to "Hello World".' }
			},
			required: []
		},
		/**
		 * Prints a message in a reusable integrated terminal instance.
		 *
		 * @param {{message?:string}} input
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input) {
			const message = typeof input.message === 'string' && input.message.trim()
				? input.message.trim()
				: 'Hello World';
			const terminal = getOrCreateTerminal();

			terminal.show(true);
			terminal.sendText(buildEchoCommand(message), true);

			return {
				ok: true,
				output: `Printed message in terminal "${TERMINAL_NAME}": ${message}`
			};
		}
	};
}

/**
 * Reuses the previous terminal unless it has already exited.
 *
 * @returns {vscode.Terminal}
 */
function getOrCreateTerminal() {
	if (sharedTerminal && !sharedTerminal.exitStatus) {
		return sharedTerminal;
	}

	sharedTerminal = vscode.window.createTerminal({ name: TERMINAL_NAME });
	return sharedTerminal;
}

/**
 * Escapes a message for a simple shell echo command.
 *
 * @param {string} message
 * @returns {string}
 */
function buildEchoCommand(message) {
	const escaped = message.replace(/"/g, '""');
	return `echo "${escaped}"`;
}

module.exports = {
	createHelloWorldTool
};

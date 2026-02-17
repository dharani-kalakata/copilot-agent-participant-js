const { createListFilesTool } = require('./listFilesTool');
const { createReadFileTool } = require('./readFileTool');
const { createSearchTextTool } = require('./searchTextTool');
const { createWriteFileTool } = require('./writeFileTool');
const { createEditFileTool } = require('./editFileTool');
const { createRunCommandTool } = require('./runCommandTool');
const { createWebSearchTool } = require('./webSearchTool');
const { createHelloWorldTool } = require('./helloWorldTool');

/**
 * Central registry for all participant tools.
 *
 * Responsibilities:
 * - instantiate tool definitions,
 * - expose tool schemas to the model,
 * - execute tool handlers with common error formatting.
 */
class ToolRegistry {
	/**
	 * @param {object} settings - Initial participant settings.
	 */
	constructor(settings) {
		this.tools = new Map();
		this.updateSettings(settings);
	}

	/**
	 * Rebuilds the tool map when settings change.
	 *
	 * @param {object} settings - Latest runtime settings.
	 */
	updateSettings(settings) {
		this.settings = settings;
		this.tools.clear();

		this.register(createListFilesTool(settings));
		this.register(createReadFileTool(settings));
		this.register(createSearchTextTool(settings));
		this.register(createWebSearchTool(settings));
		this.register(createHelloWorldTool(settings));

		if (settings.enableFileEditTools) {
			this.register(createWriteFileTool(settings));
			this.register(createEditFileTool(settings));
		}

		if (settings.enableCommandTool) {
			this.register(createRunCommandTool(settings));
		}
	}

	/**
	 * Adds a tool to the internal registry.
	 *
	 * @param {{name:string}} tool - Tool descriptor with execute handler.
	 */
	register(tool) {
		this.tools.set(tool.name, tool);
	}

	/**
	 * Returns serializable tool definitions for prompting the language model.
	 *
	 * @returns {Array<{name:string,description:string,inputSchema:object}>}
	 */
	getToolDefinitions() {
		return Array.from(this.tools.values()).map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema
		}));
	}

	/**
	 * Lists all registered tool names.
	 *
	 * @returns {string[]}
	 */
	getToolNames() {
		return Array.from(this.tools.keys());
	}

	/**
	 * Executes a tool by name with normalized error handling.
	 *
	 * @param {string} toolName - Registered tool name.
	 * @param {object} input - Tool input payload.
	 * @param {object} context - Runtime tool context.
	 * @returns {Promise<{ok:boolean,output:string,error?:string,metadata?:object}>}
	 */
	async execute(toolName, input, context) {
		const tool = this.tools.get(toolName);
		if (!tool) {
			return {
				ok: false,
				output: '',
				error: `Unknown tool "${toolName}". Available: ${this.getToolNames().join(', ')}`
			};
		}

		try {
			return await tool.execute(input || {}, {
				...context,
				settings: this.settings
			});
		} catch (error) {
			return {
				ok: false,
				output: '',
				error: error && error.message ? error.message : String(error)
			};
		}
	}

	/**
	 * Disposes registry state.
	 */
	dispose() {
		this.tools.clear();
	}
}

module.exports = {
	ToolRegistry
};

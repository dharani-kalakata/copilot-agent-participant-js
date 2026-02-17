const vscode = require('vscode');
const { ModelClient, describeModel } = require('./modelClient');
const { parseAgentAction, formatToolObservation } = require('./actionProtocol');
const { toModelMessages, toTranscript } = require('./historyAdapter');

const COMMAND_TOOL_MAP = Object.freeze({
	websearch: {
		tool: 'web_search',
		requiresPrompt: true,
		buildInput: (prompt) => ({ query: prompt })
	},
	web: {
		tool: 'web_search',
		requiresPrompt: true,
		buildInput: (prompt) => ({ query: prompt })
	},
	search: {
		tool: 'search_text',
		requiresPrompt: true,
		buildInput: (prompt) => ({ query: prompt })
	},
	workspacesearch: {
		tool: 'search_text',
		requiresPrompt: true,
		buildInput: (prompt) => ({ query: prompt })
	},
	hello: {
		tool: 'hello_world',
		requiresPrompt: false,
		buildInput: (prompt) => (prompt ? { message: prompt } : {})
	},
	helloworld: {
		tool: 'hello_world',
		requiresPrompt: false,
		buildInput: (prompt) => (prompt ? { message: prompt } : {})
	}
});

/**
 * Orchestrates request handling for the participant.
 *
 * Supported flows:
 * - `/compact` summary flow
 * - explicit command-to-tool execution (`/search`, `/websearch`, `/hello`)
 * - autonomous lightweight tool trigger for obvious prompts
 * - model-driven iterative agent loop for all remaining tasks
 */
class AgentModeRunner {
	/**
	 * @param {object} options
	 * @param {string} options.participantId
	 * @param {object} options.settings
	 * @param {object} options.profile
	 * @param {object} options.toolRegistry
	 */
	constructor({ participantId, settings, profile, toolRegistry }) {
		this.participantId = participantId;
		this.settings = settings;
		this.profile = profile;
		this.toolRegistry = toolRegistry;
		this.modelClient = new ModelClient(settings);
	}

	/**
	 * Applies runtime config updates.
	 *
	 * @param {object} runtime
	 * @param {object} runtime.settings
	 * @param {object} runtime.profile
	 */
	updateRuntime({ settings, profile }) {
		this.settings = settings;
		this.profile = profile;
		this.modelClient.updateSettings(settings);
	}

	/**
	 * Dispose hook for consistency with VS Code subscriptions.
	 */
	dispose() { }

	/**
	 * Handles each chat request end-to-end.
	 *
	 * @param {object} request - Incoming chat request.
	 * @param {object} chatContext - Chat history and metadata.
	 * @param {object} stream - Chat response stream.
	 * @param {object} token - Cancellation token.
	 * @returns {Promise<object>} Chat participant result object.
	 */
	async handleRequest(request, chatContext, stream, token) {
		try {
			if (request && request.command === 'compact') {
				return await this.handleCompact(request, chatContext, stream, token);
			}

			const handledToolCommand = await this.tryHandleCommandToolRequest(request, chatContext, stream, token);
			if (handledToolCommand) {
				return handledToolCommand;
			}

			const requestPrompt = extractRequestPrompt(request);
			if (!requestPrompt && !(request && request.command)) {
				stream.markdown('Please enter a prompt or command.');
				return {};
			}

			const handledAutonomousTool = await this.tryHandleAutonomousToolRequest(
				request,
				requestPrompt,
				chatContext,
				stream,
				token
			);
			if (handledAutonomousTool) {
				return handledAutonomousTool;
			}

			const selectedModel = await this.modelClient.resolveModel(request && request.model);
			stream.progress(`Using model: ${describeModel(selectedModel)}`);

			const toolDefinitions = this.toolRegistry.getToolDefinitions();
			const systemPrompt = this.profile.buildSystemPrompt({
				toolDefinitions,
				command: request.command,
				settings: this.settings
			});

			const modelMessages = [
				vscode.LanguageModelChatMessage.User(systemPrompt),
				...toModelMessages(chatContext.history),
				vscode.LanguageModelChatMessage.User(buildTaskPrompt(request))
			];
			let previousToolSignature = '';
			let repeatedToolCallCount = 0;
			let parseFailureCount = 0;
			let capabilityRefusalRetryCount = 0;

			for (let iteration = 1; iteration <= this.settings.maxIterations; iteration += 1) {
				const completion = await this.modelClient.complete(modelMessages, token, selectedModel);
				const rawResponse = completion.text;
				const action = parseAgentAction(rawResponse);
				modelMessages.push(vscode.LanguageModelChatMessage.Assistant(rawResponse));

				if (!action) {
					parseFailureCount += 1;
					if (parseFailureCount >= 2) {
						stream.warning('Model returned non-JSON output; returning raw response.');
						stream.markdown(rawResponse);
						return {};
					}

					modelMessages.push(vscode.LanguageModelChatMessage.User(
						'Invalid response format. Reply with exactly one JSON object using either {"type":"tool","tool":"...","input":{...}} or {"type":"final","content":"..."}'
					));
					continue;
				}
				parseFailureCount = 0;

				if (action.type === 'final') {
					if (looksLikeSearchCapabilityRefusal(action.content) && capabilityRefusalRetryCount < 1) {
						capabilityRefusalRetryCount += 1;
						stream.warning('Search capability is available in this participant. Retrying with tool guidance.');
						modelMessages.push(vscode.LanguageModelChatMessage.User(
							'Workspace search is available through search_text. Do not refuse for missing search capability. Use tools and continue.'
						));
						continue;
					}

					stream.markdown(action.content || 'Done.');
					return {};
				}

				const currentToolSignature = `${action.tool}:${JSON.stringify(action.input || {})}`;
				if (currentToolSignature === previousToolSignature) {
					repeatedToolCallCount += 1;
				} else {
					previousToolSignature = currentToolSignature;
					repeatedToolCallCount = 1;
				}

				if (repeatedToolCallCount > 2) {
					stream.warning(`Blocked repeated tool call: ${action.tool}`);
					modelMessages.push(vscode.LanguageModelChatMessage.User(
						formatToolObservation(action.tool, {
							ok: false,
							output: '',
							error: 'Identical tool call repeated too many times. Use different input/tool or return a final response.'
						})
					));
					continue;
				}

				stream.progress(`Running tool: ${action.tool}`);
				const toolResult = await this.toolRegistry.execute(action.tool, action.input, {
					request,
					history: chatContext.history,
					token
				});

				modelMessages.push(vscode.LanguageModelChatMessage.User(
					formatToolObservation(action.tool, toolResult)
				));
			}

			stream.warning(`Reached iteration limit (${this.settings.maxIterations}). Returning best effort response.`);

			modelMessages.push(vscode.LanguageModelChatMessage.User(
				'Iteration budget reached. Return a concise final response as JSON: {"type":"final","content":"..."}'
			));

			const finalCompletion = await this.modelClient.complete(modelMessages, token, selectedModel);
			const finalAttempt = finalCompletion.text;
			const finalAction = parseAgentAction(finalAttempt);
			if (finalAction && finalAction.type === 'final') {
				stream.markdown(finalAction.content);
			} else {
				stream.markdown(finalAttempt);
			}

			return {};
		} catch (error) {
			const message = `Agent execution failed: ${error && error.message ? error.message : String(error)}`;
			stream.warning(message);
			return { errorDetails: { message } };
		}
	}

	/**
	 * Compacts conversation history into a shorter continuation summary.
	 *
	 * @param {object} request
	 * @param {object} chatContext
	 * @param {object} stream
	 * @param {object} token
	 * @returns {Promise<object>}
	 */
	async handleCompact(request, chatContext, stream, token) {
		const transcript = toTranscript(chatContext.history);
		if (!transcript) {
			stream.markdown('Nothing to compact yet. Start a conversation first.');
			return {};
		}

		const selectedModel = await this.modelClient.resolveModel(request && request.model);
		stream.progress(`Using model: ${describeModel(selectedModel)}`);

		const compactPrompt = this.profile.buildCompactPrompt(transcript);
		const completion = await this.modelClient.complete(
			[vscode.LanguageModelChatMessage.User(compactPrompt)],
			token,
			selectedModel
		);
		const response = completion.text;
		const action = parseAgentAction(response);

		if (action && action.type === 'final') {
			stream.markdown(action.content);
		} else {
			stream.markdown(response);
		}

		return {};
	}

	/**
	 * Handles explicit command-based tool execution.
	 *
	 * @param {object} request
	 * @param {object} chatContext
	 * @param {object} stream
	 * @param {object} token
	 * @returns {Promise<object|null>}
	 */
	async tryHandleCommandToolRequest(request, chatContext, stream, token) {
		const command = normalizeCommand(request && request.command);
		const commandTool = COMMAND_TOOL_MAP[command];
		if (!commandTool) {
			return null;
		}

		const prompt = extractRequestPrompt(request);
		if (commandTool.requiresPrompt && !prompt) {
			stream.markdown(`Usage: /${command} <query>`);
			return {};
		}

		stream.progress(`Running tool: ${commandTool.tool}`);
		const toolResult = await this.toolRegistry.execute(commandTool.tool, commandTool.buildInput(prompt), {
			request,
			history: chatContext.history,
			token
		});

		stream.markdown(formatDirectToolResponse(commandTool.tool, toolResult));
		return {};
	}

	/**
	 * Handles lightweight autonomous tool triggers for obvious intents.
	 *
	 * @param {object} request
	 * @param {string} requestPrompt
	 * @param {object} chatContext
	 * @param {object} stream
	 * @param {object} token
	 * @returns {Promise<object|null>}
	 */
	async tryHandleAutonomousToolRequest(request, requestPrompt, chatContext, stream, token) {
		if (normalizeCommand(request && request.command) || !requestPrompt) {
			return null;
		}

		if (isWorkspaceSearchIntent(requestPrompt) && !extractWorkspaceSearchQuery(requestPrompt)) {
			stream.markdown('Workspace search is enabled. Please provide what to search (for example: `/search myFunctionName`).');
			return {};
		}

		const autonomousTool = inferAutonomousToolRequest(requestPrompt);
		if (!autonomousTool) {
			return null;
		}

		stream.progress(`Autonomous tool call: ${autonomousTool.tool}`);
		const toolResult = await this.toolRegistry.execute(autonomousTool.tool, autonomousTool.input, {
			request,
			history: chatContext.history,
			token
		});

		stream.markdown(formatDirectToolResponse(autonomousTool.tool, toolResult));
		return {};
	}
}

/**
 * Extracts the user prompt body from a request.
 *
 * @param {object} request
 * @returns {string}
 */
function extractRequestPrompt(request) {
	if (!request || typeof request !== 'object') {
		return '';
	}
	return typeof request.prompt === 'string' ? request.prompt.trim() : '';
}

/**
 * Builds the user-task prompt injected into the model loop.
 *
 * @param {object} request
 * @returns {string}
 */
function buildTaskPrompt(request) {
	const userPrompt = extractRequestPrompt(request);
	const referenceSummary = formatRequestReferences(request);
	const sections = [];

	if (request && request.command) {
		sections.push(`Command: /${request.command}`);
	}

	sections.push([
		'User request:',
		userPrompt || '(empty prompt)'
	].join('\n'));

	if (referenceSummary) {
		sections.push([
			'Resolved prompt references (prefer these exact paths when relevant):',
			referenceSummary
		].join('\n'));
	}

	sections.push('Work like an agent: gather evidence with tools when needed and finish with type=final.');
	return sections.join('\n\n');
}

/**
 * Normalizes slash command values.
 *
 * @param {string} command
 * @returns {string}
 */
function normalizeCommand(command) {
	return typeof command === 'string' ? command.trim().toLowerCase() : '';
}

/**
 * Formats direct tool output for user-facing markdown.
 *
 * @param {string} toolName
 * @param {{ok?:boolean,output?:string,error?:string}} toolResult
 * @returns {string}
 */
function formatDirectToolResponse(toolName, toolResult) {
	if (!toolResult) {
		return `Tool \`${toolName}\` completed.`;
	}

	if (toolResult.ok === false) {
		const failureText = toolResult.error || toolResult.output || 'Unknown tool error.';
		return `Tool \`${toolName}\` failed.\n\n${failureText}`;
	}

	const output = typeof toolResult.output === 'string' ? toolResult.output.trim() : '';
	return output || `Tool \`${toolName}\` completed.`;
}

/**
 * Infers obvious tool invocation opportunities from plain-language prompts.
 *
 * @param {string} prompt - User prompt.
 * @returns {{tool:string,input:object}|null}
 */
function inferAutonomousToolRequest(prompt) {
	const normalizedPrompt = prompt.toLowerCase();
	const workspaceSearchQuery = extractWorkspaceSearchQuery(prompt);
	if (workspaceSearchQuery) {
		return {
			tool: 'search_text',
			input: { query: workspaceSearchQuery }
		};
	}

	if (shouldUseAutonomousWebSearch(normalizedPrompt)) {
		return {
			tool: 'web_search',
			input: { query: prompt }
		};
	}

	if (shouldUseAutonomousHelloTool(normalizedPrompt)) {
		return {
			tool: 'hello_world',
			input: {}
		};
	}

	return null;
}

/**
 * Extracts workspace-search query text from natural-language requests.
 *
 * @param {string} prompt
 * @returns {string}
 */
function extractWorkspaceSearchQuery(prompt) {
	const normalized = String(prompt || '').trim();
	if (!normalized) {
		return '';
	}

	if (!isWorkspaceSearchIntent(normalized)) {
		return '';
	}

	const match = normalized.match(
		/(?:workspace search|search (?:the )?workspace|search across files|find references)(?:\s+(?:for|of|to|about))?\s+(.+)$/i
	);
	if (match && match[1]) {
		return sanitizeWorkspaceSearchQuery(match[1]);
	}

	const quotedMatch = normalized.match(/["'`](.+?)["'`]/);
	if (quotedMatch && quotedMatch[1]) {
		return sanitizeWorkspaceSearchQuery(quotedMatch[1]);
	}

	return '';
}

/**
 * Checks whether a prompt asks for workspace-wide search behavior.
 *
 * @param {string} prompt
 * @returns {boolean}
 */
function isWorkspaceSearchIntent(prompt) {
	return /\bworkspace search\b|\bsearch (?:the )?workspace\b|\bsearch across files\b|\bfind references\b/i.test(String(prompt || ''));
}

/**
 * Cleans extracted workspace-search query text.
 *
 * @param {string} query
 * @returns {string}
 */
function sanitizeWorkspaceSearchQuery(query) {
	return String(query || '')
		.replace(/\b(?:across|in)\s+(?:the\s+)?workspace\b/ig, '')
		.replace(/\bacross files\b/ig, '')
		.trim();
}

/**
 * Detects likely false claims that workspace search is unavailable.
 *
 * @param {string} content
 * @returns {boolean}
 */
function looksLikeSearchCapabilityRefusal(content) {
	const text = String(content || '').toLowerCase();
	const mentionsSearch = /\b(search|workspace)\b/.test(text);
	const refusalSignal = /\b(unavailable|not enabled|cannot|can't|required.*api proposal|permissions?)\b/.test(text);
	return mentionsSearch && refusalSignal;
}

/**
 * Formats request references into prompt text so the model can use concrete file paths.
 *
 * @param {object} request
 * @returns {string}
 */
function formatRequestReferences(request) {
	const references = request && Array.isArray(request.references) ? request.references : [];
	if (references.length === 0) {
		return '';
	}

	const lines = references
		.map((reference, index) => formatSingleReference(reference, index))
		.filter(Boolean);

	return lines.join('\n');
}

/**
 * Formats one chat prompt reference entry.
 *
 * @param {any} reference
 * @param {number} index
 * @returns {string}
 */
function formatSingleReference(reference, index) {
	const id = reference && typeof reference.id === 'string' && reference.id.trim()
		? reference.id.trim()
		: `reference-${index + 1}`;

	const valueText = describeReferenceValue(reference ? reference.value : undefined);
	const modelDescription = reference && typeof reference.modelDescription === 'string'
		? reference.modelDescription.trim()
		: '';
	const rangeText = Array.isArray(reference && reference.range) && reference.range.length === 2
		? `range=${reference.range[0]}-${reference.range[1]}`
		: '';

	const details = [valueText, modelDescription, rangeText].filter(Boolean);
	if (details.length === 0) {
		return `- ${id}`;
	}

	return `- ${id}: ${details.join(' | ')}`;
}

/**
 * Converts a reference value into compact text for prompt injection.
 *
 * @param {any} value
 * @returns {string}
 */
function describeReferenceValue(value) {
	if (typeof value === 'string') {
		return toCompactText(value);
	}

	if (!value || typeof value !== 'object') {
		return '';
	}

	if (typeof value.fsPath === 'string') {
		return value.fsPath;
	}

	if (value.uri && typeof value.uri === 'object') {
		if (typeof value.uri.fsPath === 'string') {
			return value.uri.fsPath;
		}
		if (typeof value.uri.path === 'string') {
			return value.uri.path;
		}
	}

	if (typeof value.path === 'string') {
		return value.path;
	}

	return toCompactText(safeStringify(value), 320);
}

/**
 * Safely JSON-stringifies a value.
 *
 * @param {any} value
 * @returns {string}
 */
function safeStringify(value) {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * Normalizes whitespace and truncates long text for prompt stability.
 *
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function toCompactText(text, maxLength = 220) {
	const compact = String(text || '').replace(/\s+/g, ' ').trim();
	if (!compact) {
		return '';
	}
	return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

/**
 * Detects prompts that clearly ask for internet lookup.
 *
 * @param {string} prompt
 * @returns {boolean}
 */
function shouldUseAutonomousWebSearch(prompt) {
	const webSearchPhrases = [
		'search the web',
		'search web',
		'web search',
		'search online',
		'look up online',
		'look up on the web'
	];

	if (webSearchPhrases.some((phrase) => prompt.includes(phrase))) {
		return true;
	}

	const hasSearchVerb = /\b(search|lookup|look up|find)\b/.test(prompt);
	const hasWebContext = /\b(web|internet|online)\b/.test(prompt);

	return hasSearchVerb && hasWebContext;
}

/**
 * Detects prompts that ask to test a hello-world style tool invocation.
 *
 * @param {string} prompt
 * @returns {boolean}
 */
function shouldUseAutonomousHelloTool(prompt) {
	const wantsHelloWorld = prompt.includes('hello world');
	const wantsToolOrTerminal = /\b(tool|terminal|invoke|test|try|print)\b/.test(prompt);
	return wantsHelloWorld && wantsToolOrTerminal;
}

module.exports = {
	AgentModeRunner
};

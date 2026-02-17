const vscode = require('vscode');
const { loadAgentSettings } = require('./src/config/agentSettings');
const { resolveProfile } = require('./src/agent/profiles');
const { AgentModeRunner } = require('./src/agent/agentModeRunner');
const { ToolRegistry } = require('./src/tools/toolRegistry');

const PARTICIPANT_ID = 'copilot-agent-participant-js.agent';

/**
 * Activates the extension and registers the chat participant.
 *
 * @param {vscode.ExtensionContext} context - VS Code extension context.
 */
function activate(context) {
	let settings = loadAgentSettings();
	let profile = resolveProfile(settings.profile);

	const toolRegistry = new ToolRegistry(settings);
	const runner = new AgentModeRunner({
		participantId: PARTICIPANT_ID,
		settings,
		profile,
		toolRegistry
	});

	const participant = vscode.chat.createChatParticipant(
		PARTICIPANT_ID,
		(request, chatContext, stream, token) => runner.handleRequest(request, chatContext, stream, token)
	);

	participant.iconPath = new vscode.ThemeIcon('tools');
	participant.helpTextPrefix = 'DSX Change Assist runs iterative, tool-assisted workflows similar to Copilot Agent Mode.';
	participant.helpTextPostfix = new vscode.MarkdownString(
		'Available commands: `/compact`, `/explain`, `/review`, `/tests`, `/fix`, `/new`, `/edit`, `/search`, `/websearch`, `/hello`.\n\n' +
		'Use `agentModeParticipant.*` settings to customize behavior.'
	);

	context.subscriptions.push(
		participant,
		toolRegistry,
		runner,
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration('agentModeParticipant')) {
				return;
			}

			settings = loadAgentSettings();
			profile = resolveProfile(settings.profile);

			toolRegistry.updateSettings(settings);
			runner.updateRuntime({ settings, profile });
		})
	);
}

/**
 * Deactivation hook for VS Code extension lifecycle.
 */
function deactivate() { }

module.exports = {
	activate,
	deactivate
};

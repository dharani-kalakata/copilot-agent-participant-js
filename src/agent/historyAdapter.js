const vscode = require('vscode');

/**
 * Converts chat history entries into model chat messages.
 *
 * @param {Array<object>} history - VS Code chat history entries.
 * @returns {Array<any>} Language model chat messages.
 */
function toModelMessages(history) {
	const messages = [];
	if (!Array.isArray(history)) {
		return messages;
	}

	for (const turn of history) {
		const requestText = extractRequestText(turn);
		if (requestText) {
			messages.push(vscode.LanguageModelChatMessage.User(requestText));
			continue;
		}

		const responseText = extractResponseText(turn);
		if (responseText) {
			messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
		}
	}

	return messages;
}

/**
 * Flattens chat history into a readable text transcript.
 *
 * @param {Array<object>} history - VS Code chat history entries.
 * @returns {string}
 */
function toTranscript(history) {
	if (!Array.isArray(history) || history.length === 0) {
		return '';
	}

	const lines = [];
	for (const turn of history) {
		const requestText = extractRequestText(turn);
		if (requestText) {
			lines.push(`User: ${requestText}`);
			continue;
		}

		const responseText = extractResponseText(turn);
		if (responseText) {
			lines.push(`Assistant: ${responseText}`);
		}
	}

	return lines.join('\n\n');
}

/**
 * Extracts user prompt text from a history turn.
 *
 * @param {object} turn
 * @returns {string}
 */
function extractRequestText(turn) {
	if (!turn || typeof turn !== 'object') {
		return '';
	}

	return typeof turn.prompt === 'string' ? turn.prompt.trim() : '';
}

/**
 * Extracts assistant response text from a history turn.
 *
 * @param {object} turn
 * @returns {string}
 */
function extractResponseText(turn) {
	if (!turn || typeof turn !== 'object' || !Array.isArray(turn.response)) {
		return '';
	}

	const textParts = turn.response
		.map(extractResponsePartText)
		.filter(Boolean);

	return textParts.join('\n').trim();
}

/**
 * Extracts text from one response part variant.
 *
 * @param {object} part
 * @returns {string}
 */
function extractResponsePartText(part) {
	if (!part || typeof part !== 'object') {
		return '';
	}

	if (typeof part.value === 'string') {
		return part.value;
	}

	if (part.value && typeof part.value === 'object' && typeof part.value.value === 'string') {
		return part.value.value;
	}

	if (typeof part.text === 'string') {
		return part.text;
	}

	return '';
}

module.exports = {
	toModelMessages,
	toTranscript
};

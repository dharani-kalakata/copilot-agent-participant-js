/**
 * Parses model output and extracts structured agent actions.
 *
 * Supported action shapes:
 * - {"type":"tool","tool":"...","input":{...}}
 * - {"type":"final","content":"..."}
 *
 * @param {string} rawText - Raw model response.
 * @returns {{type:'tool',tool:string,input:object}|{type:'final',content:string}|null}
 */
function parseAgentAction(rawText) {
	const jsonCandidates = collectJsonCandidates(rawText);

	for (const candidate of jsonCandidates) {
		try {
			const parsed = JSON.parse(candidate);
			const normalized = normalizeAction(parsed);
			if (normalized) {
				return normalized;
			}
		} catch {
			// Ignore parse failures and continue with next candidate.
		}
	}

	return null;
}

/**
 * Normalizes arbitrary JSON into the strict action protocol.
 *
 * @param {any} value - Parsed JSON object from model output.
 * @returns {{type:'tool',tool:string,input:object}|{type:'final',content:string}|null}
 */
function normalizeAction(value) {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const type = String(value.type || '').trim().toLowerCase();

	if (type === 'final') {
		const content = typeof value.content === 'string' ? value.content : '';
		return { type: 'final', content };
	}

	if (type === 'tool') {
		const tool = typeof value.tool === 'string' ? value.tool.trim() : '';
		if (!tool) {
			return null;
		}

		const input = value.input && typeof value.input === 'object' ? value.input : {};
		return { type: 'tool', tool, input };
	}

	return null;
}

/**
 * Collects possible JSON snippets from free-form model output.
 *
 * @param {string} rawText - Untrusted model output.
 * @returns {string[]} Candidate JSON strings to parse.
 */
function collectJsonCandidates(rawText) {
	const text = String(rawText || '').trim();
	const candidates = [];

	if (!text) {
		return candidates;
	}

	if (text.startsWith('{') && text.endsWith('}')) {
		candidates.push(text);
	}

	const fencedMatches = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
	if (fencedMatches) {
		for (const match of fencedMatches) {
			const inner = match.replace(/```(?:json)?/i, '').replace(/```$/, '').trim();
			if (inner) {
				candidates.push(inner);
			}
		}
	}

	const firstObject = extractFirstJsonObject(text);
	if (firstObject) {
		candidates.push(firstObject);
	}

	return candidates;
}

/**
 * Extracts the first balanced JSON object from plain text.
 *
 * @param {string} text - Input text that may contain JSON.
 * @returns {string|null} First object literal if found.
 */
function extractFirstJsonObject(text) {
	let depth = 0;
	let inString = false;
	let escapeNext = false;
	let startIndex = -1;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];

		if (escapeNext) {
			escapeNext = false;
			continue;
		}

		if (char === '\\') {
			escapeNext = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (inString) {
			continue;
		}

		if (char === '{') {
			if (depth === 0) {
				startIndex = index;
			}
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0 && startIndex !== -1) {
				return text.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

/**
 * Serializes tool execution output into a model-consumable observation block.
 *
 * @param {string} toolName - Executed tool name.
 * @param {{ok?:boolean,output?:string,error?:string,metadata?:object}} result - Tool result payload.
 * @returns {string} Structured TOOL_RESULT message.
 */
function formatToolObservation(toolName, result) {
	const payload = {
		tool: toolName,
		ok: result ? result.ok !== false : false,
		output: result && typeof result.output === 'string' ? result.output : '',
		error: result && result.error ? String(result.error) : null
	};

	if (result && result.metadata && typeof result.metadata === 'object') {
		payload.metadata = result.metadata;
	}

	return `TOOL_RESULT\n${JSON.stringify(payload)}`;
}

module.exports = {
	parseAgentAction,
	formatToolObservation
};

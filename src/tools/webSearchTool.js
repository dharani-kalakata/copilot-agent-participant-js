const { getEnvironmentValue } = require('../utils/envLoader');

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Builds the web_search tool backed by Tavily API.
 *
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createWebSearchTool() {
	return {
		name: 'web_search',
		description: 'Search the web using Tavily and return concise results with source URLs.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query for web lookup.' },
				maxResults: { type: 'number', description: `Optional result limit. Default ${DEFAULT_MAX_RESULTS}.` },
				searchDepth: { type: 'string', description: 'Optional Tavily search depth: "basic" or "advanced".' }
			},
			required: ['query']
		},
		/**
		 * Performs a Tavily web lookup and formats the response.
		 *
		 * @param {{query:string,maxResults?:number,searchDepth?:string}} input
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input) {
			const query = typeof input.query === 'string' ? input.query.trim() : '';
			if (!query) {
				throw new Error('web_search requires "query".');
			}

			const apiKey = await getEnvironmentValue('TAVILY_API_KEY');
			if (!apiKey) {
				throw new Error('Missing TAVILY_API_KEY. Add it to a .env file or export it in your environment.');
			}

			const maxResults = toMaxResults(input.maxResults);
			const searchDepth = toSearchDepth(input.searchDepth);

			const payload = await callTavilySearch({
				apiKey,
				query,
				maxResults,
				searchDepth
			});

			return {
				ok: true,
				output: formatTavilyResponse(query, payload, maxResults)
			};
		}
	};
}

/**
 * Calls Tavily's search endpoint with timeout handling.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.query
 * @param {number} options.maxResults
 * @param {string} options.searchDepth
 * @returns {Promise<any>}
 */
async function callTavilySearch({ apiKey, query, maxResults, searchDepth }) {
	if (typeof fetch !== 'function') {
		throw new Error('Global fetch is unavailable in this environment.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

	try {
		const response = await fetch(TAVILY_SEARCH_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				api_key: apiKey,
				query,
				search_depth: searchDepth,
				include_answer: true,
				max_results: maxResults
			}),
			signal: controller.signal
		});

		if (!response.ok) {
			const body = await safeReadText(response);
			throw new Error(`Tavily request failed (${response.status}): ${body || response.statusText}`);
		}

		const payload = await response.json();
		if (payload && payload.error) {
			throw new Error(`Tavily error: ${payload.error}`);
		}

		return payload || {};
	} catch (error) {
		if (error && error.name === 'AbortError') {
			throw new Error('Tavily request timed out.');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Converts Tavily response JSON into compact markdown-friendly text.
 *
 * @param {string} query
 * @param {any} payload
 * @param {number} maxResults
 * @returns {string}
 */
function formatTavilyResponse(query, payload, maxResults) {
	const lines = [`Web search results for: ${query}`];

	if (payload && typeof payload.answer === 'string' && payload.answer.trim()) {
		lines.push('');
		lines.push(`Answer: ${payload.answer.trim()}`);
	}

	const results = Array.isArray(payload && payload.results) ? payload.results.slice(0, maxResults) : [];
	if (results.length === 0) {
		lines.push('');
		lines.push('(no results returned)');
		return lines.join('\n');
	}

	lines.push('');
	lines.push('Sources:');
	for (let index = 0; index < results.length; index += 1) {
		const result = results[index] || {};
		const title = typeof result.title === 'string' && result.title.trim()
			? result.title.trim()
			: '(untitled)';
		const url = typeof result.url === 'string' && result.url.trim()
			? result.url.trim()
			: '(no url)';
		const content = typeof result.content === 'string' && result.content.trim()
			? truncateText(result.content.trim(), 240)
			: '';

		lines.push(`${index + 1}. ${title}`);
		lines.push(`   URL: ${url}`);
		if (content) {
			lines.push(`   Snippet: ${content}`);
		}
	}

	return lines.join('\n');
}

/**
 * Normalizes max-results input.
 *
 * @param {any} value
 * @returns {number}
 */
function toMaxResults(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return DEFAULT_MAX_RESULTS;
	}
	return Math.min(10, Math.max(1, Math.trunc(numeric)));
}

/**
 * Normalizes Tavily search depth input.
 *
 * @param {any} value
 * @returns {'basic'|'advanced'}
 */
function toSearchDepth(value) {
	const normalized = String(value || '').trim().toLowerCase();
	return normalized === 'advanced' ? 'advanced' : 'basic';
}

/**
 * Truncates long snippets for concise output.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function truncateText(text, maxChars) {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}...`;
}

/**
 * Safely reads response body text for error messages.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function safeReadText(response) {
	try {
		return (await response.text()).trim();
	} catch {
		return '';
	}
}

module.exports = {
	createWebSearchTool
};

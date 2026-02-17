const vscode = require('vscode');
const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out}/**';

/**
 * Builds the search_text tool backed by VS Code workspace search APIs.
 *
 * @param {object} settings
 * @param {number} settings.maxSearchResults
 * @returns {{name:string,description:string,inputSchema:object,execute:function}}
 */
function createSearchTextTool(settings) {
	return {
		name: 'search_text',
		description: 'Search text across workspace files via VS Code APIs.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search text or regex pattern.' },
				isRegex: { type: 'boolean', description: 'Treat query as regex.' },
				isCaseSensitive: { type: 'boolean', description: 'Case-sensitive search.' },
				matchWord: { type: 'boolean', description: 'Match whole words only.' },
				include: { type: 'string', description: 'Glob include pattern. Default **/*.' },
				maxResults: { type: 'number', description: `Optional override, default ${settings.maxSearchResults}.` }
			},
			required: ['query']
		},
		/**
		 * Executes workspace text search and returns a line-oriented result list.
		 *
		 * @param {{query:string,isRegex?:boolean,isCaseSensitive?:boolean,matchWord?:boolean,include?:string,maxResults?:number}} input
		 * @param {{token?:object}} context
		 * @returns {Promise<{ok:boolean,output:string}>}
		 */
		async execute(input, context) {
			const query = typeof input.query === 'string' ? input.query.trim() : '';
			if (!query) {
				throw new Error('search_text requires "query".');
			}

			const maxResults = toResultLimit(input.maxResults, settings.maxSearchResults);
			const include = typeof input.include === 'string' && input.include.trim() ? input.include.trim() : '**/*';
			const options = {
				query,
				isRegex: Boolean(input.isRegex),
				isCaseSensitive: Boolean(input.isCaseSensitive),
				matchWord: Boolean(input.matchWord),
				include,
				maxResults
			};

			const collected = await searchWithPreferredApi(options, context ? context.token : undefined);

			return {
				ok: true,
				output: collected.length > 0 ? collected.join('\n') : '(no matches found)'
			};
		}
	};
}

/**
 * Searches using findTextInFiles and falls back to file scanning when proposal APIs are unavailable.
 *
 * @param {{query:string,isRegex:boolean,isCaseSensitive:boolean,matchWord:boolean,include:string,maxResults:number}} options
 * @param {{isCancellationRequested?:boolean}} token
 * @returns {Promise<string[]>}
 */
async function searchWithPreferredApi(options, token) {
	try {
		return await searchWithFindTextInFiles(options, token);
	} catch (error) {
		if (!isFindTextInFilesUnsupported(error)) {
			throw error;
		}
		return await searchWithDocumentScan(options, token);
	}
}

/**
 * Runs workspace search through `vscode.workspace.findTextInFiles`.
 *
 * @param {{query:string,isRegex:boolean,isCaseSensitive:boolean,matchWord:boolean,include:string,maxResults:number}} options
 * @param {{isCancellationRequested?:boolean}} token
 * @returns {Promise<string[]>}
 */
async function searchWithFindTextInFiles(options, token) {
	const collected = [];
	const textQuery = {
		pattern: options.query,
		isRegExp: options.isRegex,
		isCaseSensitive: options.isCaseSensitive,
		isWordMatch: options.matchWord
	};
	const searchOptions = {
		include: options.include,
		exclude: EXCLUDE_GLOB,
		maxResults: options.maxResults
	};

	await vscode.workspace.findTextInFiles(
		textQuery,
		searchOptions,
		(result) => {
			if (collected.length >= options.maxResults) {
				return;
			}

			const filePath = result.uri && result.uri.fsPath
				? result.uri.fsPath
				: String(result.uri);
			const line = extractLineNumber(result.ranges);
			const preview = result.preview && typeof result.preview.text === 'string'
				? result.preview.text.trim()
				: '';
			const suffix = typeof line === 'number' ? `:${line}` : '';
			collected.push(`${filePath}${suffix}: ${preview}`);
		},
		token
	);

	return collected;
}

/**
 * Fallback search path using stable APIs: find files + open documents + line matching.
 *
 * @param {{query:string,isRegex:boolean,isCaseSensitive:boolean,matchWord:boolean,include:string,maxResults:number}} options
 * @param {{isCancellationRequested?:boolean}} token
 * @returns {Promise<string[]>}
 */
async function searchWithDocumentScan(options, token) {
	const matcher = createLineMatcher(options);
	const collected = [];
	const fileScanLimit = Math.min(4000, Math.max(200, options.maxResults * 40));
	const uris = await vscode.workspace.findFiles(options.include, EXCLUDE_GLOB, fileScanLimit, token);

	for (const uri of uris) {
		if (token && token.isCancellationRequested) {
			break;
		}

		let text;
		try {
			const document = await vscode.workspace.openTextDocument(uri);
			text = document.getText();
		} catch {
			continue;
		}

		const lines = text.split(/\r?\n/);
		for (let index = 0; index < lines.length; index += 1) {
			if (matcher(lines[index])) {
				collected.push(`${uri.fsPath}:${index + 1}: ${lines[index].trim()}`);
				if (collected.length >= options.maxResults) {
					return collected;
				}
			}
		}
	}

	return collected;
}

/**
 * Creates a line-matching function from search options.
 *
 * @param {{query:string,isRegex:boolean,isCaseSensitive:boolean,matchWord:boolean}} options
 * @returns {(line:string)=>boolean}
 */
function createLineMatcher(options) {
	if (options.isRegex) {
		const flags = options.isCaseSensitive ? 'g' : 'gi';
		let regex;
		try {
			regex = new RegExp(options.query, flags);
		} catch (error) {
			throw new Error(`search_text invalid regex: ${error && error.message ? error.message : String(error)}`);
		}

		return (line) => {
			regex.lastIndex = 0;
			const match = regex.exec(line);
			if (!match) {
				return false;
			}
			if (!options.matchWord) {
				return true;
			}
			return isWholeWordMatch(line, match.index, match[0].length);
		};
	}

	if (options.matchWord) {
		const wordRegex = new RegExp(`\\b${escapeRegExp(options.query)}\\b`, options.isCaseSensitive ? '' : 'i');
		return (line) => wordRegex.test(line);
	}

	const needle = options.isCaseSensitive ? options.query : options.query.toLowerCase();
	return (line) => {
		const candidate = options.isCaseSensitive ? line : line.toLowerCase();
		return candidate.includes(needle);
	};
}

/**
 * Checks if a match spans a whole-word boundary.
 *
 * @param {string} line
 * @param {number} index
 * @param {number} length
 * @returns {boolean}
 */
function isWholeWordMatch(line, index, length) {
	const before = index > 0 ? line[index - 1] : '';
	const after = index + length < line.length ? line[index + length] : '';
	return !isWordChar(before) && !isWordChar(after);
}

/**
 * Checks whether a character is a word character.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isWordChar(value) {
	return /[A-Za-z0-9_]/.test(value || '');
}

/**
 * Escapes regex-significant characters in plain text.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detects unsupported findTextInFiles API scenarios.
 *
 * @param {any} error
 * @returns {boolean}
 */
function isFindTextInFilesUnsupported(error) {
	const message = error && error.message ? String(error.message) : String(error || '');
	return message.includes('CANNOT use API proposal: findTextInFiles')
		|| message.includes('findTextInFiles is not a function')
		|| message.includes('not enabled');
}

/**
 * Extracts the first line number from VS Code search ranges.
 *
 * @param {any} ranges
 * @returns {number|undefined}
 */
function extractLineNumber(ranges) {
	const firstRange = Array.isArray(ranges) ? ranges[0] : ranges;
	if (!firstRange || !firstRange.start || typeof firstRange.start.line !== 'number') {
		return undefined;
	}
	return firstRange.start.line + 1;
}

/**
 * Clamps search max-results input.
 *
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function toResultLimit(value, fallback) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}
	return Math.min(300, Math.max(5, Math.trunc(numeric)));
}

module.exports = {
	createSearchTextTool
};

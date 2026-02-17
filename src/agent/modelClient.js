const vscode = require('vscode');

/**
 * Lightweight wrapper around VS Code language model APIs.
 */
class ModelClient {
	/**
	 * @param {object} settings - Runtime settings used for fallback model selection.
	 */
	constructor(settings) {
		this.settings = settings;
		this.modelPromise = undefined;
	}

	/**
	 * Updates internal settings and clears cached model selection.
	 *
	 * @param {object} settings
	 */
	updateSettings(settings) {
		this.settings = settings;
		this.modelPromise = undefined;
	}

	/**
	 * Sends model messages and reads the streamed response into plain text.
	 *
	 * @param {Array<any>} messages - Language model messages.
	 * @param {object} token - Cancellation token.
	 * @param {any} preferredModel - Request-scoped model, if provided by chat UI.
	 * @returns {Promise<{text:string,model:any}>}
	 */
	async complete(messages, token, preferredModel) {
		const model = await this.getModel(preferredModel);
		const response = await model.sendRequest(messages, {}, token);
		const text = await streamToText(response.text, token);
		return { text, model };
	}

	/**
	 * Resolves the model that should be used for a request.
	 *
	 * @param {any} preferredModel
	 * @returns {Promise<any>}
	 */
	async resolveModel(preferredModel) {
		return this.getModel(preferredModel);
	}

	/**
	 * Returns either the request-selected model or a cached fallback model.
	 *
	 * @param {any} preferredModel
	 * @returns {Promise<any>}
	 */
	async getModel(preferredModel) {
		if (isUsableModel(preferredModel)) {
			return preferredModel;
		}

		if (!this.modelPromise) {
			this.modelPromise = this.selectModel();
		}
		return this.modelPromise;
	}

	/**
	 * Selects a model using configured vendor/family fallback selectors.
	 *
	 * @returns {Promise<any>}
	 */
	async selectModel() {
		const selector = {
			vendor: this.settings.modelVendor || 'copilot'
		};

		if (this.settings.modelFamily) {
			selector.family = this.settings.modelFamily;
		}

		const models = await vscode.lm.selectChatModels(selector);
		if (!Array.isArray(models) || models.length === 0) {
			throw new Error(`No language model available for selector: ${JSON.stringify(selector)}`);
		}

		return models[0];
	}
}

/**
 * Checks whether a model object has the methods required for inference.
 *
 * @param {any} model
 * @returns {boolean}
 */
function isUsableModel(model) {
	return Boolean(model && typeof model.sendRequest === 'function');
}

/**
 * Produces a readable model label for progress messages.
 *
 * @param {any} model
 * @returns {string}
 */
function describeModel(model) {
	if (!model) {
		return 'unknown';
	}

	const name = typeof model.name === 'string' && model.name.trim() ? model.name.trim() : '';
	const id = typeof model.id === 'string' && model.id.trim() ? model.id.trim() : '';
	const vendor = typeof model.vendor === 'string' && model.vendor.trim() ? model.vendor.trim() : '';
	const family = typeof model.family === 'string' && model.family.trim() ? model.family.trim() : '';

	const primary = name || id || 'unknown';
	const details = [vendor, family].filter(Boolean).join('/');
	return details ? `${primary} (${details})` : primary;
}

/**
 * Reads an async stream and converts all chunks into a single text string.
 *
 * @param {AsyncIterable<string|any>} stream - Source stream of response chunks.
 * @param {{isCancellationRequested?:boolean}} token - Optional cancellation token.
 * @returns {Promise<string>} Combined, trimmed response text.
 */
async function streamToText(stream, token) {
	let result = '';

	for await (const chunk of stream) {
		if (token && token.isCancellationRequested) {
			break;
		}
		result += typeof chunk === 'string' ? chunk : String(chunk);
	}

	return result.trim();
}

module.exports = {
	ModelClient,
	describeModel
};

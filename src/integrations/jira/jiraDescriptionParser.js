/**
 * Converts Jira ADF/plain descriptions to markdown-friendly text.
 *
 * @param {any} description
 * @returns {string}
 */
function parseJiraDescription(description) {
	if (typeof description === 'string') {
		return description.trim();
	}

	if (!description || typeof description !== 'object') {
		return '';
	}

	const rendered = renderNode(description);
	return normalizeSpacing(rendered);
}

/**
 * Renders one ADF node recursively.
 *
 * @param {any} node
 * @returns {string}
 */
function renderNode(node) {
	if (!node || typeof node !== 'object') {
		return '';
	}

	const type = String(node.type || '');
	switch (type) {
		case 'doc':
			return renderChildren(node);
		case 'paragraph': {
			const text = renderChildren(node).trim();
			return text ? `${text}\n\n` : '';
		}
		case 'text':
			return applyTextMarks(String(node.text || ''), Array.isArray(node.marks) ? node.marks : []);
		case 'hardBreak':
			return '\n';
		case 'heading': {
			const level = toHeadingLevel(node && node.attrs && node.attrs.level);
			const headingText = renderChildren(node).trim();
			return headingText ? `${'#'.repeat(level)} ${headingText}\n\n` : '';
		}
		case 'bulletList':
			return renderList(node, false);
		case 'orderedList':
			return renderList(node, true);
		case 'codeBlock': {
			const code = renderChildren(node).replace(/\n+$/, '');
			return code ? `\`\`\`\n${code}\n\`\`\`\n\n` : '';
		}
		case 'blockquote': {
			const content = normalizeSpacing(renderChildren(node));
			if (!content) {
				return '';
			}
			const quoted = content.split('\n').map((line) => `> ${line}`).join('\n');
			return `${quoted}\n\n`;
		}
		case 'table':
			return renderTable(node);
		default:
			return renderChildren(node);
	}
}

/**
 * Renders all child nodes.
 *
 * @param {any} node
 * @returns {string}
 */
function renderChildren(node) {
	const content = Array.isArray(node && node.content) ? node.content : [];
	return content.map((child) => renderNode(child)).join('');
}

/**
 * Applies ADF text marks to plain text.
 *
 * @param {string} value
 * @param {any[]} marks
 * @returns {string}
 */
function applyTextMarks(value, marks) {
	let formatted = value;
	for (const mark of marks) {
		const markType = String(mark && mark.type || '');
		if (markType === 'strong') {
			formatted = `**${formatted}**`;
		} else if (markType === 'em') {
			formatted = `*${formatted}*`;
		} else if (markType === 'code') {
			formatted = `\`${formatted}\``;
		} else if (markType === 'link') {
			const href = mark && mark.attrs && typeof mark.attrs.href === 'string'
				? mark.attrs.href.trim()
				: '';
			if (href) {
				formatted = `[${formatted}](${href})`;
			}
		}
	}
	return formatted;
}

/**
 * Renders ADF bullet/ordered lists.
 *
 * @param {any} node
 * @param {boolean} ordered
 * @returns {string}
 */
function renderList(node, ordered) {
	const items = Array.isArray(node && node.content) ? node.content : [];
	if (items.length === 0) {
		return '';
	}

	const lines = items.map((item, index) => {
		const rendered = normalizeSpacing(renderNode(item)).replace(/\n/g, ' ').trim();
		const prefix = ordered ? `${index + 1}.` : '-';
		return rendered ? `${prefix} ${rendered}` : `${prefix} (empty item)`;
	});

	return `${lines.join('\n')}\n\n`;
}

/**
 * Renders ADF tables into a simple markdown-like layout.
 *
 * @param {any} node
 * @returns {string}
 */
function renderTable(node) {
	const rows = Array.isArray(node && node.content) ? node.content : [];
	const renderedRows = [];

	for (const row of rows) {
		const cells = Array.isArray(row && row.content) ? row.content : [];
		const renderedCells = cells
			.map((cell) => normalizeSpacing(renderNode(cell)).replace(/\n/g, ' ').trim())
			.filter((cell) => cell.length > 0);

		if (renderedCells.length > 0) {
			renderedRows.push(`| ${renderedCells.join(' | ')} |`);
		}
	}

	return renderedRows.length > 0 ? `${renderedRows.join('\n')}\n\n` : '';
}

/**
 * Normalizes blank lines for cleaner markdown.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeSpacing(text) {
	return String(text || '')
		.replace(/\r/g, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Clamps heading level into markdown-compatible range.
 *
 * @param {any} value
 * @returns {number}
 */
function toHeadingLevel(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return 2;
	}
	const level = Math.trunc(numeric);
	return Math.min(6, Math.max(1, level));
}

module.exports = {
	parseJiraDescription
};

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Language, Parser, Query } from 'web-tree-sitter';
import { pygmentsDefaultTheme } from '../themes/pygments-default.mjs';

const require = createRequire(import.meta.url);
export const cppLanguages = ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'hxx'];
let runtime;

function getRuntime() {
	return (runtime ??= (async () => {
		await Parser.init({
			locateFile: () => require.resolve('web-tree-sitter/web-tree-sitter.wasm'),
		});
		const language = await Language.load(require.resolve('tree-sitter-cpp/tree-sitter-cpp.wasm'));
		// The C++ grammar officially inherits the C highlight queries.
		const cppRequire = createRequire(require.resolve('tree-sitter-cpp/package.json'));
		const queries = await Promise.all([
			readFile(cppRequire.resolve('tree-sitter-c/queries/highlights.scm'), 'utf8'),
			readFile(require.resolve('tree-sitter-cpp/queries/highlights.scm'), 'utf8'),
		]);
		const parser = new Parser();
		parser.setLanguage(language);
		return { parser, query: new Query(language, queries.join('\n')) };
	})());
}

function themeStyle(scope) {
	const settings = pygmentsDefaultTheme.settings.find((rule) =>
		rule.scope.includes(scope),
	)?.settings;
	const styles = [
		`color:${settings?.foreground ?? pygmentsDefaultTheme.colors['editor.foreground']}`,
	];
	if (settings?.fontStyle?.includes('bold')) styles.push('font-weight:bold');
	if (settings?.fontStyle?.includes('italic')) styles.push('font-style:italic');
	return styles.join(';');
}

const styles = {
	plain: themeStyle(''),
	variable: themeStyle(''),
	type: themeStyle('entity.name.type'),
	primitive: themeStyle('storage.type.built-in.primitive'),
	function: themeStyle('entity.name.function'),
	keyword: themeStyle('keyword'),
	operator: themeStyle('keyword.operator'),
	number: themeStyle('constant.numeric'),
	string: themeStyle('string'),
	comment: themeStyle('comment'),
	constant: themeStyle('constant.language'),
	preprocessor: themeStyle('meta.preprocessor'),
};

function category(capture) {
	const { name, node } = capture;
	if (name === 'comment') return 'comment';
	if (name === 'string' || node.type === 'char_literal') return 'string';
	if (node.type.startsWith('preproc_') || node.text.startsWith('#')) return 'preprocessor';
	if (name.startsWith('function')) return 'function';
	if (name === 'type' && ['primitive_type', 'sized_type_specifier', 'auto'].includes(node.type))
		return 'primitive';
	if (name in styles) return name;
	if (name.startsWith('variable')) return 'variable';
	return 'plain';
}

const priority = {
	plain: 0,
	variable: 1,
	type: 2,
	primitive: 3,
	constant: 4,
	function: 5,
	keyword: 6,
	operator: 6,
	number: 7,
	preprocessor: 8,
	string: 9,
	comment: 10,
};

// Parsing and rendering happen only in Node at build/dev time. No WASM ships to readers.
export async function highlightCpp(source) {
	const { parser, query } = await getRuntime();
	const tree = parser.parse(source);
	if (!tree) throw new Error('Tree-sitter failed to parse a C++ code block');
	try {
		const captures = query.captures(tree.rootNode).map((capture) => ({
			start: capture.node.startIndex,
			end: capture.node.endIndex,
			kind: category(capture),
		}));
		// Resolve overlapping captures: function beats generic identifier; strings
		// and comments shield their contents. Offsets are JS UTF-16 indices.
		captures.sort((a, b) => priority[a.kind] - priority[b.kind]);
		const kinds = Array(source.length).fill('plain');
		for (const { start, end, kind } of captures) kinds.fill(kind, start, end);
		const children = [];
		let offset = 0;
		for (const [index, line] of source.split('\n').entries()) {
			if (index) children.push({ type: 'text', value: '\n' });
			const spans = [];
			let start = 0;
			while (start < line.length) {
				const kind = kinds[offset + start];
				let end = start + 1;
				while (end < line.length && kinds[offset + end] === kind) end++;
				spans.push({
					type: 'element',
					tagName: 'span',
					properties: {
						className: ['token', kind],
						style: styles[kind],
					},
					children: [{ type: 'text', value: line.slice(start, end) }],
				});
				start = end;
			}
			children.push({
				type: 'element',
				tagName: 'span',
				properties: { className: ['line'] },
				children: spans,
			});
			offset += line.length + 1;
		}
		return children;
	} finally {
		tree.delete();
	}
}

function textContent(node) {
	return node.type === 'text' ? node.value : (node.children ?? []).map(textContent).join('');
}

export default function rehypeCppHighlight() {
	return async (tree) => {
		async function walk(node) {
			if (node.type === 'element' && node.tagName === 'pre') {
				const code = node.children?.find(
					(child) => child.type === 'element' && child.tagName === 'code',
				);
				const language = code?.properties?.className
					?.find((name) => name.startsWith('language-'))
					?.slice(9);
				if (cppLanguages.includes(language)) {
					code.children = await highlightCpp(textContent(code));
					node.properties = {
						...node.properties,
						className: ['astro-code', 'tree-sitter', 'pygments-default'],
						style: `background-color:#00000000;${styles.plain};overflow-x:auto`,
						tabIndex: 0,
						'data-language': language,
						'data-highlighter': 'tree-sitter',
					};
					return;
				}
			}
			for (const child of node.children ?? []) await walk(child);
		}
		await walk(tree);
	};
}

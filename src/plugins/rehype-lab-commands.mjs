const shellLanguageClasses = new Set([
	'language-bash',
	'language-console',
	'language-sh',
	'language-shell',
]);

function isShellCodeBlock(node) {
	if (node.type !== 'element' || node.tagName !== 'pre') return false;
	if (node.children?.length !== 1) return false;

	const code = node.children[0];
	if (code.type !== 'element' || code.tagName !== 'code') return false;
	const classNames = Array.isArray(code.properties?.className)
		? code.properties.className
		: [];
	return classNames.some((className) => shellLanguageClasses.has(String(className)));
}

function getCodeText(code) {
	if (!code.children.every((child) => child.type === 'text')) return undefined;
	return code.children.map((child) => child.value).join('');
}

function commandLineNodes(line, isContinuation) {
	const trimmed = line.trimStart();
	if (trimmed === '' || trimmed.startsWith('#')) {
		return [{ type: 'text', value: line }];
	}

	const indentation = line.slice(0, line.length - trimmed.length);
	if (trimmed.startsWith('$ ')) {
		return [
			{ type: 'text', value: `${indentation}$ ` },
			{
				type: 'element',
				tagName: 'kbd',
				properties: {},
				children: [{ type: 'text', value: trimmed.slice(2) }],
			},
		];
	}

	return [
		...(isContinuation ? [] : [{ type: 'text', value: '$ ' }]),
		{
			type: 'element',
			tagName: 'kbd',
			properties: {},
			children: [{ type: 'text', value: line }],
		},
	];
}

function formatShellCodeBlock(node) {
	const code = node.children[0];
	const source = getCodeText(code);
	if (source === undefined) return;

	const lines = source.replaceAll('\r\n', '\n').split('\n');
	const children = [];
	let isContinuation = false;

	for (const [index, line] of lines.entries()) {
		children.push(...commandLineNodes(line, isContinuation));
		if (index < lines.length - 1) children.push({ type: 'text', value: '\n' });
		isContinuation = /\\\s*$/u.test(line);
	}

	code.children = children;
}

function walk(node) {
	if (isShellCodeBlock(node)) formatShellCodeBlock(node);
	if (!Array.isArray(node.children)) return;
	for (const child of node.children) walk(child);
}

export default function rehypeLabCommands() {
	return (tree) => walk(tree);
}

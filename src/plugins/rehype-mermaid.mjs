function visit(node, callback) {
	callback(node);
	if (!Array.isArray(node.children)) return;
	for (const child of node.children) visit(child, callback);
}

function classNames(node) {
	const value = node.properties?.className;
	if (Array.isArray(value)) return value.map(String);
	return value ? String(value).split(/\s+/) : [];
}

function textContent(node) {
	if (node.type === 'text') return node.value;
	if (!Array.isArray(node.children)) return '';
	return node.children.map(textContent).join('');
}

export default function rehypeMermaid() {
	return (tree) => {
		visit(tree, (node) => {
			if (node.type !== 'element' || node.tagName !== 'pre') return;
			const code = node.children?.find(
				(child) => child.type === 'element' && child.tagName === 'code',
			);
			if (!code || !classNames(code).includes('language-mermaid')) return;

			node.properties = { className: ['mermaid'] };
			node.children = [{ type: 'text', value: textContent(code).trim() }];
		});
	};
}

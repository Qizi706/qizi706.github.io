const calloutLabels = {
	caution: 'CAUTION',
	important: 'IMPORTANT',
	note: 'NOTE',
	tip: 'TIP',
	warning: 'WARNING',
};

function visit(node, callback) {
	callback(node);
	if (!Array.isArray(node.children)) return;
	for (const child of node.children) visit(child, callback);
}

function firstTextNode(node) {
	if (node.type === 'text') return node;
	if (!Array.isArray(node.children)) return undefined;
	for (const child of node.children) {
		const text = firstTextNode(child);
		if (text) return text;
	}
	return undefined;
}

export default function rehypeCallouts() {
	return (tree) => {
		visit(tree, (node) => {
			if (node.type !== 'element' || node.tagName !== 'blockquote') return;

			const paragraph = node.children?.find(
				(child) => child.type === 'element' && child.tagName === 'p',
			);
			if (!paragraph) return;

			const text = firstTextNode(paragraph);
			const match = text?.value.match(
				/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n)?/i,
			);
			if (!match) return;

			const type = match[1].toLowerCase();
			text.value = text.value.slice(match[0].length);
			node.tagName = 'aside';
			node.properties = {
				className: ['callout', `callout-${type}`],
				role: 'note',
			};
			node.children.unshift({
				type: 'element',
				tagName: 'div',
				properties: { className: ['callout-title'] },
				children: [{ type: 'text', value: calloutLabels[type] }],
			});
		});
	};
}

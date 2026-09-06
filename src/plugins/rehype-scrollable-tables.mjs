export default function rehypeScrollableTables() {
	return (tree) => {
		function walk(parent) {
			if (!Array.isArray(parent.children)) return;
			for (const [index, node] of parent.children.entries()) {
				walk(node);
				if (node.type !== 'element' || node.tagName !== 'table') continue;
				parent.children[index] = {
					type: 'element',
					tagName: 'div',
					properties: {
						className: ['table-scroll'],
						tabIndex: 0,
						role: 'region',
						ariaLabel: '表格，可横向滚动',
					},
					children: [node],
				};
			}
		}

		walk(tree);
	};
}

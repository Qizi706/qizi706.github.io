// Render legacy numbered lists like Markdown `-` lists throughout the site.
export default function rehypeBulletLists() {
	return (tree) => {
		function walk(node) {
			if (node.type === 'element' && node.tagName === 'ol') {
				node.tagName = 'ul';
				delete node.properties?.start;
				delete node.properties?.reversed;
				delete node.properties?.type;
			}

			if (!Array.isArray(node.children)) return;
			for (const child of node.children) walk(child);
		}

		walk(tree);
	};
}

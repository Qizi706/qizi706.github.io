import path from 'node:path';
import {
	getLabArtifactRawHref,
	getLabDirectoryHref,
	getLabMarkdownHref,
} from '../utils/lab-artifacts.mjs';

function isExternalOrAbsoluteUrl(value) {
	return value.startsWith('/') || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/iu.test(value);
}

function splitUrlSuffix(value) {
	const suffixIndex = value.search(/[?#]/u);
	return suffixIndex === -1
		? { pathname: value, suffix: '' }
		: { pathname: value.slice(0, suffixIndex), suffix: value.slice(suffixIndex) };
}

function decodeRelativePath(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function rewriteRelativeUrl(value, labName, artifactPath, renderMarkdown) {
	if (value === '' || value.startsWith('#') || isExternalOrAbsoluteUrl(value)) return value;

	const { pathname, suffix } = splitUrlSuffix(value);
	if (pathname === '') return value;

	const sourceDirectory = path.posix.dirname(artifactPath);
	const decodedPathname = decodeRelativePath(pathname);
	const resolvedPath = path.posix.normalize(path.posix.join(sourceDirectory, decodedPathname));
	if (
		resolvedPath === '..' ||
		resolvedPath.startsWith('../') ||
		path.posix.isAbsolute(resolvedPath)
	) {
		return value;
	}

	if (renderMarkdown && path.posix.extname(resolvedPath).toLowerCase() === '.md') {
		return `${getLabMarkdownHref(labName, resolvedPath)}${suffix}`;
	}

	const href = pathname.endsWith('/')
		? getLabDirectoryHref(labName, resolvedPath)
		: getLabArtifactRawHref(labName, resolvedPath);
	return `${href}${suffix}`;
}

function walk(node, visit) {
	visit(node);
	if (!Array.isArray(node.children)) return;
	for (const child of node.children) walk(child, visit);
}

export default function rehypeLabArtifactLinks({ labName, artifactPath }) {
	return (tree) => {
		walk(tree, (node) => {
			if (node.type !== 'element' || !node.properties) return;

			if (typeof node.properties.href === 'string') {
				node.properties.href = rewriteRelativeUrl(
					node.properties.href,
					labName,
					artifactPath,
					true,
				);
			}

			if (typeof node.properties.src === 'string') {
				node.properties.src = rewriteRelativeUrl(node.properties.src, labName, artifactPath, false);
			}
		});
	};
}

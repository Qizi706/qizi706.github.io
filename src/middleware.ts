import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineMiddleware } from 'astro:middleware';
import { publicLabsRoot } from './utils/lab-artifacts.mjs';

function resolveLabDirectoryIndex(pathname: string): string | undefined {
	if (!pathname.startsWith('/labs/') || !pathname.endsWith('/')) return undefined;

	let decodedPathname: string;
	try {
		decodedPathname = decodeURIComponent(pathname);
	} catch {
		return undefined;
	}

	const relativePath = decodedPathname.slice('/labs/'.length);
	const targetPath = path.resolve(publicLabsRoot, relativePath, 'index.html');
	const normalizedRoot = path.resolve(publicLabsRoot);
	if (!targetPath.startsWith(`${normalizedRoot}${path.sep}`)) return undefined;
	return targetPath;
}

export const onRequest = defineMiddleware(async ({ url }, next) => {
	if (!import.meta.env.DEV) return next();

	const indexPath = resolveLabDirectoryIndex(url.pathname);
	if (!indexPath) return next();

	try {
		return new Response(await readFile(indexPath), {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	} catch {
		return next();
	}
});

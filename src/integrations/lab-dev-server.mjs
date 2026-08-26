import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publicLabsRoot } from '../utils/lab-artifacts.mjs';

const textExtensions = new Set([
	'.c',
	'.cc',
	'.cpp',
	'.h',
	'.hpp',
	'.lock',
	'.log',
	'.py',
	'.sh',
	'.toml',
	'.ts',
	'.txt',
	'.yaml',
	'.yml',
]);

function getContentType(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (textExtensions.has(extension)) return 'text/plain; charset=utf-8';

	switch (extension) {
		case '.csv':
			return 'text/plain; charset=utf-8';
		case '.html':
			return 'text/html; charset=utf-8';
		case '.js':
		case '.mjs':
			return 'text/javascript; charset=utf-8';
		case '.json':
			return 'application/json; charset=utf-8';
		case '.md':
			return 'text/markdown; charset=utf-8';
		case '.svg':
			return 'image/svg+xml';
		case '.gz':
			return 'application/gzip';
		default:
			return 'application/octet-stream';
	}
}

function resolveLabPublicFile(pathname) {
	if (!pathname.startsWith('/labs/')) return undefined;

	let decodedPathname;
	try {
		decodedPathname = decodeURIComponent(pathname);
	} catch {
		return undefined;
	}

	const relativePath = decodedPathname.slice('/labs/'.length);
	const targetPath = path.resolve(
		publicLabsRoot,
		relativePath,
		...(decodedPathname.endsWith('/') ? ['index.html'] : []),
	);
	const normalizedRoot = path.resolve(publicLabsRoot);
	if (!targetPath.startsWith(`${normalizedRoot}${path.sep}`)) return undefined;
	return targetPath;
}

async function serveLabArtifacts(request, response, next) {
	if (!request.url || !['GET', 'HEAD'].includes(request.method ?? '')) return next();

	const url = new URL(request.url, 'http://localhost');
	const publicFilePath = resolveLabPublicFile(url.pathname);
	if (!publicFilePath) return next();

	try {
		const content = await readFile(publicFilePath);
		response.writeHead(200, {
			'Cache-Control': 'no-cache',
			'Content-Length': String(content.byteLength),
			'Content-Type': getContentType(publicFilePath),
			'X-Content-Type-Options': 'nosniff',
		});
		response.end(request.method === 'HEAD' ? undefined : content);
	} catch {
		next();
	}
}

export default function labDevServer() {
	let devServer;

	return {
		name: 'lab-dev-server',
		hooks: {
			'astro:server:setup': ({ server }) => {
				devServer = server;
			},
			'astro:server:start': () => {
				// Astro's route guard blocks browser navigations whose URL also maps to
				// a repository-root file. Our source and public Lab paths intentionally
				// mirror each other, so the boundary-checked public handler must run first.
				devServer?.middlewares.stack.unshift({ route: '', handle: serveLabArtifacts });
			},
		},
	};
}

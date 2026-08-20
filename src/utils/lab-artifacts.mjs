import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const workspaceRoot = process.cwd();
export const labsRoot = path.join(workspaceRoot, 'labs');
export const publicLabsRoot = path.join(workspaceRoot, 'public', 'labs');

const excludedEntryNames = new Set([
	'.DS_Store',
	'.mypy_cache',
	'.pytest_cache',
	'.ruff_cache',
	'.venv',
	'__pycache__',
]);

const viewableExtensions = new Set([
	'.c',
	'.cc',
	'.cpp',
	'.csv',
	'.h',
	'.hpp',
	'.js',
	'.json',
	'.lock',
	'.log',
	'.md',
	'.mjs',
	'.py',
	'.sh',
	'.svg',
	'.toml',
	'.ts',
	'.txt',
	'.yaml',
	'.yml',
]);

const modifiedDateFormatter = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Asia/Shanghai',
	day: '2-digit',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

async function pathExists(targetPath) {
	try {
		await stat(targetPath);
		return true;
	} catch {
		return false;
	}
}

function assertLabName(labName) {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(labName)) {
		throw new Error(`Invalid lab name: ${labName}`);
	}
}

function normalizeRelativePath(relativePath, label = 'path') {
	if (typeof relativePath !== 'string' || relativePath === '') {
		throw new Error(`Invalid ${label}: ${relativePath}`);
	}

	const normalizedPath = relativePath.replaceAll('\\', '/');
	const segments = normalizedPath.split('/');
	if (
		path.posix.isAbsolute(normalizedPath) ||
		segments.some((segment) => segment === '' || segment === '.' || segment === '..')
	) {
		throw new Error(`Invalid ${label}: ${relativePath}`);
	}

	return normalizedPath;
}

function isExcludedEntry(entryName) {
	return entryName.startsWith('.') || excludedEntryNames.has(entryName);
}

function formatModifiedDate(date) {
	const parts = Object.fromEntries(
		modifiedDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
	);
	return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`;
}

function getGitModifiedDate(relativePath) {
	const statusResult = spawnSync('git', ['status', '--porcelain=v1', '--', relativePath], {
		cwd: workspaceRoot,
		encoding: 'utf8',
	});

	if (statusResult.status !== 0 || statusResult.stdout.trim() !== '') return undefined;

	const logResult = spawnSync('git', ['log', '-1', '--format=%ct', '--', relativePath], {
		cwd: workspaceRoot,
		encoding: 'utf8',
	});
	const timestamp = Number.parseInt(logResult.stdout.trim(), 10);

	return logResult.status === 0 && Number.isFinite(timestamp)
		? new Date(timestamp * 1_000)
		: undefined;
}

async function hashFile(filePath) {
	const content = await readFile(filePath);
	return createHash('sha256').update(content).digest('hex');
}

function assertInsideRoot(rootPath, targetPath, label) {
	const normalizedRoot = path.resolve(rootPath);
	const normalizedTarget = path.resolve(targetPath);
	if (
		normalizedTarget !== normalizedRoot &&
		!normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
	) {
		throw new Error(`${label} escapes Lab root: ${targetPath}`);
	}
	return normalizedTarget;
}

async function walkPublishPath(labRoot, relativePath) {
	const normalizedPath = normalizeRelativePath(relativePath, 'publish path');
	const absolutePath = assertInsideRoot(
		labRoot,
		path.join(labRoot, ...normalizedPath.split('/')),
		'Publish path',
	);
	const entryStat = await lstat(absolutePath);

	if (entryStat.isSymbolicLink()) {
		throw new Error(`Symbolic links are not publishable: ${normalizedPath}`);
	}
	if (entryStat.isFile()) return [normalizedPath];
	if (!entryStat.isDirectory()) throw new Error(`Unsupported Lab entry: ${normalizedPath}`);

	const entries = await readdir(absolutePath, { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		if (isExcludedEntry(entry.name)) continue;
		if (entry.isSymbolicLink()) {
			throw new Error(`Symbolic links are not publishable: ${normalizedPath}/${entry.name}`);
		}
		const childPath = path.posix.join(normalizedPath, entry.name);
		files.push(...(await walkPublishPath(labRoot, childPath)));
	}
	return files;
}

function assertManifest(manifest, expectedSlug) {
	if (!manifest || typeof manifest !== 'object') throw new Error('Lab manifest must be an object.');
	assertLabName(manifest.slug);
	if (manifest.slug !== expectedSlug) {
		throw new Error(`Manifest slug ${manifest.slug} does not match directory ${expectedSlug}.`);
	}
	if (typeof manifest.title !== 'string' || typeof manifest.description !== 'string') {
		throw new Error(`${expectedSlug}: title and description are required.`);
	}
	if (
		!manifest.parent ||
		typeof manifest.parent.href !== 'string' ||
		typeof manifest.parent.label !== 'string'
	) {
		throw new Error(`${expectedSlug}: parent href and label are required.`);
	}
	if (!Array.isArray(manifest.publish) || manifest.publish.length === 0) {
		throw new Error(`${expectedSlug}: publish must be a non-empty array.`);
	}
	manifest.publish.forEach((publishPath) => normalizeRelativePath(publishPath, 'publish path'));
}

export function getLabSourceRoot(labName) {
	assertLabName(labName);
	return path.join(labsRoot, labName);
}

export async function getLabManifest(labName) {
	assertLabName(labName);
	const manifestPath = path.join(getLabSourceRoot(labName), 'lab.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	assertManifest(manifest, labName);
	return manifest;
}

export async function discoverLabs() {
	const entries = await readdir(labsRoot, { withFileTypes: true });
	const labs = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || isExcludedEntry(entry.name)) continue;
		assertLabName(entry.name);
		if (await pathExists(path.join(labsRoot, entry.name, 'lab.json'))) labs.push(entry.name);
	}

	return labs.sort((left, right) => left.localeCompare(right, 'en'));
}

export async function collectLabArtifacts(labName) {
	const manifest = await getLabManifest(labName);
	const labRoot = getLabSourceRoot(labName);
	const relativePaths = (
		await Promise.all(manifest.publish.map((publishPath) => walkPublishPath(labRoot, publishPath)))
	).flat();
	const uniquePaths = [...new Set(relativePaths)].sort((left, right) =>
		left.localeCompare(right, 'en'),
	);

	if (uniquePaths.length !== relativePaths.length) {
		throw new Error(`${labName}: publish entries overlap.`);
	}

	return Promise.all(
		uniquePaths.map(async (artifactPath) => {
			const absolutePath = path.join(labRoot, ...artifactPath.split('/'));
			const fileStat = await stat(absolutePath);
			const workspaceRelativePath = path.relative(workspaceRoot, absolutePath);
			const modifiedDate = getGitModifiedDate(workspaceRelativePath) ?? fileStat.mtime;

			return {
				path: artifactPath,
				absolutePath,
				modified: formatModifiedDate(modifiedDate),
				size: fileStat.size,
				sha256: await hashFile(absolutePath),
				viewable: viewableExtensions.has(path.extname(artifactPath).toLowerCase()),
			};
		}),
	);
}

export async function validateLab(labName) {
	const manifest = await getLabManifest(labName);
	const artifacts = await collectLabArtifacts(labName);
	const artifactPaths = new Set(artifacts.map(({ path: artifactPath }) => artifactPath));
	const requiredPaths = manifest.checks?.required ?? [];

	for (const requiredPath of requiredPaths) {
		const normalizedPath = normalizeRelativePath(requiredPath, 'required path');
		if (!artifactPaths.has(normalizedPath)) {
			throw new Error(`${labName}: required artifact is not published: ${normalizedPath}`);
		}
	}

	for (const [csvPath, expectedRows] of Object.entries(manifest.checks?.csvRows ?? {})) {
		const normalizedPath = normalizeRelativePath(csvPath, 'CSV path');
		if (!artifactPaths.has(normalizedPath)) {
			throw new Error(`${labName}: checked CSV is not published: ${normalizedPath}`);
		}
		if (!Number.isInteger(expectedRows) || expectedRows < 0) {
			throw new Error(`${labName}: invalid expected row count for ${normalizedPath}.`);
		}
		const csvContent = await readFile(resolveLabArtifactPath(labName, normalizedPath), 'utf8');
		const actualRows = csvContent.trimEnd().split(/\r?\n/u).length - 1;
		if (actualRows !== expectedRows) {
			throw new Error(
				`${labName}: ${normalizedPath} has ${actualRows} rows; expected ${expectedRows}.`,
			);
		}
	}

	return { manifest, artifacts };
}

function normalizeArtifactDirectoryPath(directoryPath = '') {
	if (directoryPath === '') return '';
	return normalizeRelativePath(directoryPath, 'artifact directory path');
}

export function collectLabArtifactDirectories(artifacts) {
	const directories = new Set();

	for (const artifact of artifacts) {
		const segments = artifact.path.split('/').slice(0, -1);
		for (let depth = 1; depth <= segments.length; depth += 1) {
			directories.add(segments.slice(0, depth).join('/'));
		}
	}

	return [...directories].sort((left, right) => left.localeCompare(right, 'en'));
}

export function listLabDirectoryEntries(artifacts, directoryPath = '') {
	const normalizedDirectory = normalizeArtifactDirectoryPath(directoryPath);
	const prefix = normalizedDirectory === '' ? '' : `${normalizedDirectory}/`;
	const entries = new Map();

	for (const artifact of artifacts) {
		if (!artifact.path.startsWith(prefix)) continue;
		const relativePath = artifact.path.slice(prefix.length);
		if (relativePath === '') continue;

		const separatorIndex = relativePath.indexOf('/');
		if (separatorIndex !== -1) {
			const name = relativePath.slice(0, separatorIndex);
			entries.set(name, { kind: 'directory', name, path: prefix + name });
			continue;
		}

		entries.set(relativePath, { kind: 'file', name: relativePath, ...artifact });
	}

	return [...entries.values()].sort((left, right) => {
		if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
		return left.name.localeCompare(right.name, 'en');
	});
}

export function getLabBasePath(labName) {
	assertLabName(labName);
	return `/labs/${labName}/`;
}

export function encodeLabArtifactPath(artifactPath) {
	return artifactPath.split('/').map(encodeURIComponent).join('/');
}

export function getLabDirectoryHref(labName, directoryPath = '') {
	const normalizedDirectory = normalizeArtifactDirectoryPath(directoryPath);
	const basePath = getLabBasePath(labName);
	return normalizedDirectory === ''
		? basePath
		: `${basePath}view/${encodeLabArtifactPath(normalizedDirectory)}/`;
}

export function resolveLabArtifactPath(labName, artifactPath) {
	const labRoot = getLabSourceRoot(labName);
	const normalizedPath = normalizeRelativePath(artifactPath, 'artifact path');
	return assertInsideRoot(
		labRoot,
		path.join(labRoot, ...normalizedPath.split('/')),
		'Artifact path',
	);
}

export async function getLabArchiveInfo(labName) {
	assertLabName(labName);
	const filename = `${labName}.tar.gz`;
	const archivePath = path.join(publicLabsRoot, filename);
	const archiveStat = await stat(archivePath);

	return { filename, size: archiveStat.size, sha256: await hashFile(archivePath) };
}

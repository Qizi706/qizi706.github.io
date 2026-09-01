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

const privatePublishEntryNames = new Set(['.work', 'private', 'solution', 'solutions']);

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

function isViewableLabArtifactPath(artifactPath) {
	return viewableExtensions.has(path.extname(artifactPath).toLowerCase());
}

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
	return (
		entryName.startsWith('.') ||
		excludedEntryNames.has(entryName) ||
		privatePublishEntryNames.has(entryName.toLowerCase())
	);
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
	if (manifest.schemaVersion !== 1) {
		throw new Error(`${expectedSlug}: schemaVersion must be 1.`);
	}
	if ('progress' in manifest || 'current' in manifest) {
		throw new Error(
			`${expectedSlug}: website progress belongs in src/data/lab-roadmap, not lab.json.`,
		);
	}
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
	if (
		!manifest.usage ||
		!['starter', 'evidence'].includes(manifest.usage.mode) ||
		typeof manifest.usage.readme !== 'string'
	) {
		throw new Error(`${expectedSlug}: usage mode and README path are required.`);
	}
	if (
		manifest.usage.mode === 'starter' &&
		(typeof manifest.usage.currentTask !== 'string' ||
			typeof manifest.usage.currentCheckoff !== 'string' ||
			typeof manifest.usage.publicSource !== 'string' ||
			typeof manifest.usage.privateSource !== 'string' ||
			!['unfinished-only', 'task-archive'].includes(manifest.usage.publicationPolicy))
	) {
		throw new Error(
			`${expectedSlug}: Starter usage requires currentTask, currentCheckoff, publicSource, privateSource, and publicationPolicy.`,
		);
	}
	if (!Array.isArray(manifest.publish) || manifest.publish.length === 0) {
		throw new Error(`${expectedSlug}: publish must be a non-empty array.`);
	}
	manifest.publish.forEach((publishPath) => {
		const normalizedPath = normalizeRelativePath(publishPath, 'publish path');
		const segments = normalizedPath.split('/');
		if (
			segments.some(
				(segment) => segment.startsWith('.') || privatePublishEntryNames.has(segment.toLowerCase()),
			)
		) {
			throw new Error(`${expectedSlug}: private path cannot be published: ${normalizedPath}`);
		}
	});
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
				modifiedTimestamp: modifiedDate.getTime(),
				size: fileStat.size,
				sha256: await hashFile(absolutePath),
				viewable: isViewableLabArtifactPath(artifactPath),
			};
		}),
	);
}

export async function validateLab(labName) {
	const manifest = await getLabManifest(labName);
	const artifacts = await collectLabArtifacts(labName);
	const artifactPaths = new Set(artifacts.map(({ path: artifactPath }) => artifactPath));
	const requiredPaths = manifest.checks?.required ?? [];
	const readmePath = normalizeRelativePath(manifest.usage.readme, 'usage README path');

	if (!artifactPaths.has(readmePath)) {
		throw new Error(`${labName}: usage README is not published: ${readmePath}`);
	}

	if (manifest.usage.mode === 'starter') {
		const currentTaskPath = normalizeRelativePath(manifest.usage.currentTask, 'current task path');
		const currentCheckoffPath = normalizeRelativePath(
			manifest.usage.currentCheckoff,
			'current checkoff path',
		);
		const publicSourcePath = normalizeRelativePath(
			manifest.usage.publicSource,
			'public source path',
		);
		const privateSourcePath = normalizeRelativePath(
			manifest.usage.privateSource,
			'private source path',
		);
		const hasPublicSource = artifacts.some(({ path: artifactPath }) =>
			artifactPath.startsWith(`${publicSourcePath}/`),
		);
		const publishesPrivateSource = artifacts.some(
			({ path: artifactPath }) =>
				artifactPath === privateSourcePath || artifactPath.startsWith(`${privateSourcePath}/`),
		);

		if (!artifactPaths.has(currentTaskPath)) {
			throw new Error(`${labName}: current task is not published: ${currentTaskPath}`);
		}
		if (!artifactPaths.has(currentCheckoffPath)) {
			throw new Error(`${labName}: current checkoff is not published: ${currentCheckoffPath}`);
		}
		if (!hasPublicSource) {
			throw new Error(`${labName}: public Starter source is not published: ${publicSourcePath}`);
		}
		if (publishesPrivateSource) {
			throw new Error(`${labName}: private implementation was published: ${privateSourcePath}`);
		}

		if (
			manifest.usage.publicationPolicy === 'unfinished-only' ||
			manifest.usage.publicationPolicy === 'task-archive'
		) {
			const publishedCheckoffs = artifacts
				.map(({ path: artifactPath }) => artifactPath)
				.filter((artifactPath) => artifactPath.startsWith('checkoffs/'));

			if (manifest.usage.publicationPolicy === 'unfinished-only') {
				const unexpectedCheckoffs = publishedCheckoffs.filter(
					(artifactPath) => artifactPath !== currentCheckoffPath,
				);
				if (unexpectedCheckoffs.length > 0) {
					throw new Error(
						`${labName}: unfinished-only Starter cannot publish archived checkoffs: ${unexpectedCheckoffs.join(', ')}`,
					);
				}
			}

			if (manifest.usage.publicationPolicy === 'task-archive') {
				const immutableTemplates = manifest.checks?.immutableTemplates ?? {};
				const unprotectedCheckoffs = publishedCheckoffs.filter(
					(artifactPath) => !(artifactPath in immutableTemplates),
				);
				if (unprotectedCheckoffs.length > 0) {
					throw new Error(
						`${labName}: task-archive requires an immutable hash for every published checkoff: ${unprotectedCheckoffs.join(', ')}`,
					);
				}
			}

			const publishedResults = artifacts
				.map(({ path: artifactPath }) => artifactPath)
				.filter(
					(artifactPath) => artifactPath === 'results' || artifactPath.startsWith('results/'),
				);
			if (publishedResults.length > 0) {
				throw new Error(
					`${labName}: Starter publication policy cannot publish private results: ${publishedResults.join(', ')}`,
				);
			}
		}
	}

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

	for (const [starterPath, requiredSnippets] of Object.entries(
		manifest.checks?.starterContains ?? {},
	)) {
		const normalizedPath = normalizeRelativePath(starterPath, 'Starter path');
		if (!artifactPaths.has(normalizedPath)) {
			throw new Error(`${labName}: checked Starter is not published: ${normalizedPath}`);
		}
		if (!Array.isArray(requiredSnippets) || requiredSnippets.length === 0) {
			throw new Error(`${labName}: Starter check needs at least one snippet: ${normalizedPath}`);
		}
		const starterContent = await readFile(resolveLabArtifactPath(labName, normalizedPath), 'utf8');
		for (const snippet of requiredSnippets) {
			if (typeof snippet !== 'string' || snippet === '' || !starterContent.includes(snippet)) {
				throw new Error(`${labName}: public Starter contract changed: ${normalizedPath}`);
			}
		}
	}

	const artifactsByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
	for (const [templatePath, expectedSha256] of Object.entries(
		manifest.checks?.immutableTemplates ?? {},
	)) {
		const normalizedPath = normalizeRelativePath(templatePath, 'immutable template path');
		const artifact = artifactsByPath.get(normalizedPath);
		if (!artifact) {
			throw new Error(`${labName}: immutable template is not published: ${normalizedPath}`);
		}
		if (!/^[0-9a-f]{64}$/u.test(expectedSha256) || artifact.sha256 !== expectedSha256) {
			throw new Error(
				`${labName}: immutable public template changed; keep answers in the private repository: ${normalizedPath}`,
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
			const existingEntry = entries.get(name);
			if (
				!existingEntry ||
				artifact.modifiedTimestamp > (existingEntry.modifiedTimestamp ?? Number.NEGATIVE_INFINITY)
			) {
				entries.set(name, {
					kind: 'directory',
					name,
					path: prefix + name,
					modified: artifact.modified,
					modifiedTimestamp: artifact.modifiedTimestamp,
				});
			}
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

export function getLabArtifactRawHref(labName, artifactPath) {
	const normalizedPath = normalizeRelativePath(artifactPath, 'artifact path');
	return getLabBasePath(labName) + encodeLabArtifactPath(normalizedPath);
}

export function getLabMarkdownHref(labName, artifactPath) {
	const normalizedPath = normalizeRelativePath(artifactPath, 'artifact path');
	if (path.posix.extname(normalizedPath).toLowerCase() !== '.md') {
		throw new Error(`Markdown artifact must use the .md extension: ${artifactPath}`);
	}
	const documentPath = normalizedPath.slice(0, -'.md'.length);
	return `${getLabBasePath(labName)}read/${encodeLabArtifactPath(documentPath)}/`;
}

export function getLabArtifactDisplayHref(labName, artifactPath) {
	const normalizedPath = normalizeRelativePath(artifactPath, 'artifact path');
	return path.posix.extname(normalizedPath).toLowerCase() === '.md'
		? getLabMarkdownHref(labName, normalizedPath)
		: getLabArtifactRawHref(labName, normalizedPath);
}

export function getLabDirectoryHref(labName, directoryPath = '') {
	const normalizedDirectory = normalizeArtifactDirectoryPath(directoryPath);
	const basePath = getLabBasePath(labName);
	return normalizedDirectory === ''
		? basePath
		: `${basePath}${encodeLabArtifactPath(normalizedDirectory)}/`;
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

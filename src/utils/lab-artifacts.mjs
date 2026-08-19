import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = process.cwd();
const labPagesRoot = path.join(workspaceRoot, 'src', 'pages', 'labs');
const publicLabsRoot = path.join(workspaceRoot, 'public', 'labs');

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

	if (statusResult.status !== 0 || statusResult.stdout.trim() !== '') {
		return undefined;
	}

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

async function walkLabDirectory(rootPath, relativeDirectory = '') {
	const directoryPath = path.join(rootPath, ...relativeDirectory.split('/').filter(Boolean));
	const entries = await readdir(directoryPath, { withFileTypes: true });
	const files = [];

	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		if (isExcludedEntry(entry.name)) continue;

		const relativePath = path.posix.join(relativeDirectory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkLabDirectory(rootPath, relativePath)));
		} else if (entry.isFile()) {
			files.push(relativePath);
		}
	}

	return files;
}

export async function discoverLabs() {
	const entries = await readdir(labPagesRoot, { withFileTypes: true });
	const labs = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || isExcludedEntry(entry.name)) continue;

		const indexPage = path.join(labPagesRoot, entry.name, 'index.astro');
		const sourceDirectory = path.join(publicLabsRoot, entry.name);
		if ((await pathExists(indexPage)) && (await pathExists(sourceDirectory))) {
			labs.push(entry.name);
		}
	}

	return labs.sort((left, right) => left.localeCompare(right, 'en'));
}

export async function collectLabArtifacts(labName) {
	assertLabName(labName);
	const labRoot = path.join(publicLabsRoot, labName);
	const relativePaths = await walkLabDirectory(labRoot);

	return Promise.all(
		relativePaths.map(async (artifactPath) => {
			const absolutePath = path.join(labRoot, ...artifactPath.split('/'));
			const fileStat = await stat(absolutePath);
			const workspaceRelativePath = path.relative(workspaceRoot, absolutePath);
			const modifiedDate = getGitModifiedDate(workspaceRelativePath) ?? fileStat.mtime;

			return {
				path: artifactPath,
				modified: formatModifiedDate(modifiedDate),
				size: fileStat.size,
				sha256: await hashFile(absolutePath),
				viewable: viewableExtensions.has(path.extname(artifactPath).toLowerCase()),
			};
		}),
	);
}

export function getLabBasePath(labName) {
	assertLabName(labName);
	return `/labs/${labName}/`;
}

export function encodeLabArtifactPath(artifactPath) {
	return artifactPath.split('/').map(encodeURIComponent).join('/');
}

export function resolveLabArtifactPath(labName, artifactPath) {
	assertLabName(labName);
	const labRoot = path.resolve(publicLabsRoot, labName);
	const resolvedPath = path.resolve(labRoot, ...artifactPath.split('/'));

	if (!resolvedPath.startsWith(`${labRoot}${path.sep}`)) {
		throw new Error(`Artifact path escapes lab root: ${artifactPath}`);
	}

	return resolvedPath;
}

export async function getLabArchiveInfo(labName) {
	assertLabName(labName);
	const filename = `${labName}.tar.gz`;
	const archivePath = path.join(publicLabsRoot, filename);
	const archiveStat = await stat(archivePath);

	return {
		filename,
		size: archiveStat.size,
		sha256: await hashFile(archivePath),
	};
}

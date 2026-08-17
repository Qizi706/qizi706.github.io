import { access, mkdir, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = process.cwd();
const labPagesRoot = path.join(workspaceRoot, 'src', 'pages', 'labs');
const publicLabsRoot = path.join(workspaceRoot, 'public', 'labs');

const excludedPaths = [
	'.venv',
	'__pycache__',
	'.pytest_cache',
	'.mypy_cache',
	'.ruff_cache',
	'.DS_Store',
];

async function pathExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function discoverLabs() {
	const entries = await readdir(labPagesRoot, { withFileTypes: true });
	const labs = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const indexPage = path.join(labPagesRoot, entry.name, 'index.astro');
		const sourceDirectory = path.join(publicLabsRoot, entry.name);
		if ((await pathExists(indexPage)) && (await pathExists(sourceDirectory))) {
			labs.push(entry.name);
		}
	}

	return labs.sort();
}

function createArchive(labName) {
	const archivePath = path.join(publicLabsRoot, `${labName}.tar.gz`);
	const excludeArguments = excludedPaths.flatMap((excludedPath) => [
		`--exclude=${labName}/${excludedPath}`,
		`--exclude=${labName}/**/${excludedPath}`,
	]);

	const result = spawnSync(
		'tar',
		[
			'--create',
			'--gzip',
			'--file',
			archivePath,
			'--directory',
			publicLabsRoot,
			'--sort=name',
			'--mtime=UTC 1970-01-01',
			'--owner=0',
			'--group=0',
			'--numeric-owner',
			'--format=ustar',
			...excludeArguments,
			labName,
		],
		{ encoding: 'utf8' },
	);

	if (result.status !== 0) {
		throw new Error(`Failed to create ${archivePath}: ${result.stderr || result.error}`);
	}

	return archivePath;
}

await mkdir(publicLabsRoot, { recursive: true });
const labs = await discoverLabs();

if (labs.length === 0) {
	throw new Error('No Lab index pages with matching public directories were found.');
}

for (const labName of labs) {
	const archivePath = createArchive(labName);
	const archiveStat = await stat(archivePath);
	console.log(`Created ${path.relative(workspaceRoot, archivePath)} (${archiveStat.size} bytes)`);
}

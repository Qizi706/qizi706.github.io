import { mkdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { collectLabArtifacts, discoverLabs } from '../src/utils/lab-artifacts.mjs';

const workspaceRoot = process.cwd();
const publicLabsRoot = path.join(workspaceRoot, 'public', 'labs');

function createArchive(labName, artifacts) {
	const archivePath = path.join(publicLabsRoot, `${labName}.tar.gz`);
	const archiveEntries = artifacts.map(({ path: artifactPath }) =>
		path.posix.join(labName, artifactPath),
	);

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
			...archiveEntries,
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
	const artifacts = await collectLabArtifacts(labName);
	if (artifacts.length === 0) {
		throw new Error(`No publishable artifacts found for ${labName}.`);
	}

	const archivePath = createArchive(labName, artifacts);
	const archiveStat = await stat(archivePath);
	console.log(
		`Created ${path.relative(workspaceRoot, archivePath)} ` +
			`(${artifacts.length} files, ${archiveStat.size} bytes)`,
	);
}

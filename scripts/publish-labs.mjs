import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	discoverLabs,
	publicLabsRoot,
	validateLab,
	workspaceRoot,
} from '../src/utils/lab-artifacts.mjs';

const publicRoot = path.join(workspaceRoot, 'public');
const expectedPublicLabsRoot = path.resolve(publicRoot, 'labs');
if (path.resolve(publicLabsRoot) !== expectedPublicLabsRoot) {
	throw new Error(`Refusing to replace unexpected publication root: ${publicLabsRoot}`);
}

function createArchiveBuffer(labName, stagingRoot, artifacts) {
	const archiveEntries = artifacts.map(({ path: artifactPath }) =>
		path.posix.join(labName, artifactPath),
	);
	const tarResult = spawnSync(
		'tar',
		[
			'--create',
			'--file=-',
			'--directory',
			stagingRoot,
			'--sort=name',
			'--mtime=UTC 1970-01-01',
			'--owner=0',
			'--group=0',
			'--numeric-owner',
			'--format=ustar',
			...archiveEntries,
		],
		{ encoding: null, maxBuffer: 128 * 1024 * 1024 },
	);
	if (tarResult.status !== 0) {
		throw new Error(`Failed to archive ${labName}: ${tarResult.stderr?.toString()}`);
	}

	const gzipResult = spawnSync('gzip', ['-n', '-9'], {
		input: tarResult.stdout,
		encoding: null,
		maxBuffer: 128 * 1024 * 1024,
	});
	if (gzipResult.status !== 0) {
		throw new Error(`Failed to compress ${labName}: ${gzipResult.stderr?.toString()}`);
	}
	return gzipResult.stdout;
}

await mkdir(publicRoot, { recursive: true });
const stagingRoot = await mkdtemp(path.join(publicRoot, '.labs-stage-'));

try {
	const labs = await discoverLabs();
	if (labs.length === 0) throw new Error('No Lab manifests were found in labs/.');
	const publicationIndex = [];

	for (const labName of labs) {
		const { manifest, artifacts } = await validateLab(labName);
		for (const artifact of artifacts) {
			const targetPath = path.join(stagingRoot, labName, ...artifact.path.split('/'));
			await mkdir(path.dirname(targetPath), { recursive: true });
			await copyFile(artifact.absolutePath, targetPath);
		}

		const archiveBuffer = createArchiveBuffer(labName, stagingRoot, artifacts);
		await writeFile(path.join(stagingRoot, `${labName}.tar.gz`), archiveBuffer);
		publicationIndex.push({
			slug: labName,
			title: manifest.title,
			files: artifacts.length,
			archive: `${labName}.tar.gz`,
		});
		console.log(`Published ${labName}: ${artifacts.length} files`);
	}

	await writeFile(
		path.join(stagingRoot, 'index.json'),
		`${JSON.stringify({ labs: publicationIndex }, null, 2)}\n`,
	);
	await rm(publicLabsRoot, { recursive: true, force: true });
	await rename(stagingRoot, publicLabsRoot);
} catch (error) {
	await rm(stagingRoot, { recursive: true, force: true });
	throw error;
}

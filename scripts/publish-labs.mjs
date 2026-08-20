import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	collectLabArtifactDirectories,
	discoverLabs,
	getLabArtifactRawHref,
	listLabDirectoryEntries,
	publicLabsRoot,
	validateLab,
	workspaceRoot,
} from '../src/utils/lab-artifacts.mjs';

const publicRoot = path.join(workspaceRoot, 'public');
const expectedPublicLabsRoot = path.resolve(publicRoot, 'labs');
const siteOrigin = 'https://zqwiki.cn';
const nameColumnWidth = 51;
const sizeColumnWidth = 20;
if (path.resolve(publicLabsRoot) !== expectedPublicLabsRoot) {
	throw new Error(`Refusing to replace unexpected publication root: ${publicLabsRoot}`);
}

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function renderDirectoryIndex(displayedPath, entries) {
	const rows = entries.map((entry) => {
		const label = entry.name + (entry.kind === 'directory' ? '/' : '');
		const href = encodeURIComponent(entry.name) + (entry.kind === 'directory' ? '/' : '');
		const namePadding = ' '.repeat(Math.max(1, nameColumnWidth - label.length));
		const size = (entry.kind === 'directory' ? '-' : String(entry.size)).padStart(
			sizeColumnWidth,
			' ',
		);
		return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>${namePadding}${entry.modified ?? ''}${size}`;
	});

	return `<html>
<head><title>Index of ${escapeHtml(displayedPath)}</title></head>
<body>
<h1>Index of ${escapeHtml(displayedPath)}</h1><hr><pre><a href="../">../</a>
${rows.join('\n')}
</pre><hr></body>
</html>
`;
}

async function writeLabDirectoryIndexes(stagingRoot, labName, artifacts) {
	const directoryPaths = ['', ...collectLabArtifactDirectories(artifacts)];
	for (const directoryPath of directoryPaths) {
		const targetDirectory = path.join(
			stagingRoot,
			labName,
			...directoryPath.split('/').filter(Boolean),
		);
		const displayedPath = `/labs/${labName}/${directoryPath ? `${directoryPath}/` : ''}`;
		await mkdir(targetDirectory, { recursive: true });
		await writeFile(
			path.join(targetDirectory, 'index.html'),
			renderDirectoryIndex(displayedPath, listLabDirectoryEntries(artifacts, directoryPath)),
		);
	}
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
	const publicationEntries = [];

	for (const labName of labs) {
		const { manifest, artifacts } = await validateLab(labName);
		for (const artifact of artifacts) {
			const targetPath = path.join(stagingRoot, labName, ...artifact.path.split('/'));
			await mkdir(path.dirname(targetPath), { recursive: true });
			await copyFile(artifact.absolutePath, targetPath);

			if (artifact.viewable) {
				const textMirrorPath = path.join(
					stagingRoot,
					'__raw_text__',
					labName,
					...artifact.path.split('/'),
				);
				await mkdir(path.dirname(textMirrorPath), { recursive: true });
				await copyFile(artifact.absolutePath, `${textMirrorPath}.txt`);
			}
		}

		const archiveBuffer = createArchiveBuffer(labName, stagingRoot, artifacts);
		await writeFile(path.join(stagingRoot, `${labName}.tar.gz`), archiveBuffer);
		await writeLabDirectoryIndexes(stagingRoot, labName, artifacts);
		const latestArtifact = artifacts.reduce((latest, artifact) =>
			artifact.modifiedTimestamp > latest.modifiedTimestamp ? artifact : latest,
		);
		publicationEntries.push(
			{
				kind: 'directory',
				name: labName,
				modified: latestArtifact.modified,
				modifiedTimestamp: latestArtifact.modifiedTimestamp,
			},
			{
				kind: 'file',
				name: `${labName}.tar.gz`,
				modified: latestArtifact.modified,
				modifiedTimestamp: latestArtifact.modifiedTimestamp,
				size: archiveBuffer.byteLength,
			},
		);
		publicationIndex.push({
			slug: labName,
			title: manifest.title,
			files: artifacts.length,
			archive: `${labName}.tar.gz`,
			archiveUrl: new URL(`/labs/${labName}.tar.gz`, siteOrigin).href,
			artifacts: artifacts.map((artifact) => ({
				path: artifact.path,
				url: new URL(getLabArtifactRawHref(labName, artifact.path), siteOrigin).href,
				size: artifact.size,
				sha256: artifact.sha256,
			})),
		});
		console.log(`Published ${labName}: ${artifacts.length} files`);
	}

	const publicationIndexContent = `${JSON.stringify({ labs: publicationIndex }, null, 2)}\n`;
	await writeFile(path.join(stagingRoot, 'index.json'), publicationIndexContent);
	const latestPublication = publicationEntries.reduce((latest, entry) =>
		entry.modifiedTimestamp > latest.modifiedTimestamp ? entry : latest,
	);
	publicationEntries.push({
		kind: 'file',
		name: 'index.json',
		modified: latestPublication.modified,
		modifiedTimestamp: latestPublication.modifiedTimestamp,
		size: Buffer.byteLength(publicationIndexContent),
	});
	publicationEntries.sort((left, right) => {
		if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
		return left.name.localeCompare(right.name, 'en');
	});
	await writeFile(
		path.join(stagingRoot, 'index.html'),
		renderDirectoryIndex('/labs/', publicationEntries),
	);
	await rm(publicLabsRoot, { recursive: true, force: true });
	await rename(stagingRoot, publicLabsRoot);
} catch (error) {
	await rm(stagingRoot, { recursive: true, force: true });
	throw error;
}

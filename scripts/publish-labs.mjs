import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	collectLabArtifactDirectories,
	discoverLabs,
	getLabArtifactDisplayHref,
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
const reproducibleArchiveTimestamp = new Date(0);
if (path.resolve(publicLabsRoot) !== expectedPublicLabsRoot) {
	throw new Error(`Refusing to replace unexpected publication root: ${publicLabsRoot}`);
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function formatByteSize(size) {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

function renderPage(title, content) {
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f5f7fb; }
* { box-sizing: border-box; }
body { margin: 0; }
a { color: #3730a3; text-underline-offset: 0.2em; }
main { width: min(70rem, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
.breadcrumbs { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0 0 1.5rem; color: #64748b; font-size: 0.9rem; }
.breadcrumbs a { color: inherit; }
.hero, .panel, .lab-card { border: 1px solid #dbe2ef; border-radius: 0.8rem; background: #fff; box-shadow: 0 0.25rem 1.2rem rgb(15 23 42 / 5%); }
.hero { padding: clamp(1.25rem, 4vw, 2.4rem); }
.eyebrow { margin: 0 0 0.55rem; color: #4f46e5; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.15; }
h2 { margin: 0 0 0.65rem; font-size: 1.15rem; }
p { line-height: 1.7; }
.lead { max-width: 52rem; margin: 0.8rem 0 0; color: #475569; font-size: 1.02rem; }
.meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0 0; padding: 0; list-style: none; }
.meta li { padding: 0.3rem 0.65rem; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 0.82rem; font-weight: 700; }
.actions { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 1.2rem; }
.action { display: inline-flex; align-items: center; min-height: 2.7rem; padding: 0.6rem 0.9rem; border: 1px solid #c7d2fe; border-radius: 0.55rem; background: #fff; font-weight: 750; text-decoration: none; }
.action--primary { border-color: #4338ca; background: #4338ca; color: #fff; }
.grid, .lab-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
.panel, .lab-card { padding: 1.2rem; }
.panel--wide { margin-top: 1rem; }
.panel p, .lab-card p { margin: 0.55rem 0 0; color: #475569; }
.panel ul { margin: 0.65rem 0 0; padding-left: 1.2rem; color: #475569; line-height: 1.7; }
.callout { border-color: #c7d2fe; background: #eef2ff; }
.callout strong { color: #312e81; }
pre { max-width: 100%; margin: 0.85rem 0 0; padding: 1rem; overflow-x: auto; border: 1px solid #dbe2ef; border-radius: 0.55rem; background: #f8fafc; color: #0f172a; font: 0.88rem/1.65 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.listing { white-space: pre; }
.listing-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.listing-heading p { margin: 0; color: #64748b; font-size: 0.86rem; }
.lab-card h2 a { text-decoration: none; }
.lab-card .actions { margin-top: 1rem; }
code { padding: 0.12em 0.32em; border-radius: 0.25rem; background: #eef2f7; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre code { padding: 0; background: transparent; }
@media (max-width: 720px) { .grid, .lab-grid { grid-template-columns: 1fr; } main { width: min(100% - 1rem, 70rem); padding-top: 0.5rem; } .hero, .panel, .lab-card { border-radius: 0.55rem; } }
</style>
</head>
<body>
<main>${content}</main>
</body>
</html>
`;
}

function renderDirectoryRows(entries, resolveHref) {
	const rows = entries.map((entry) => {
		const label = entry.name + (entry.kind === 'directory' ? '/' : '');
		const href = resolveHref
			? resolveHref(entry)
			: encodeURIComponent(entry.name) + (entry.kind === 'directory' ? '/' : '');
		const namePadding = ' '.repeat(Math.max(1, nameColumnWidth - label.length));
		const size = (entry.kind === 'directory' ? '-' : String(entry.size)).padStart(
			sizeColumnWidth,
			' ',
		);
		return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>${namePadding}${entry.modified ?? ''}${size}`;
	});
	return rows.join('\n');
}

function renderDirectoryIndex(displayedPath, entries, resolveHref) {
	const rows = renderDirectoryRows(entries, resolveHref);
	return renderPage(
		`Index of ${displayedPath}`,
		`<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><a href="/labs/">Labs</a><span>/</span><span>${escapeHtml(displayedPath)}</span></nav>
<section class="panel">
<div class="listing-heading"><h1>Index of ${escapeHtml(displayedPath)}</h1><p>Markdown 以阅读页打开，其他文件显示发布原文。</p></div>
<pre class="listing"><a href="../">../</a>\n${rows}</pre>
</section>`,
	);
}

function renderLabLanding(manifest, labName, entries, archiveSize) {
	const usage = manifest.usage;
	const archiveHref = `/labs/${encodeURIComponent(labName)}.tar.gz`;
	const readmeHref = getLabArtifactDisplayHref(labName, usage.readme);
	const directoryRows = renderDirectoryRows(entries, (entry) =>
		entry.kind === 'directory'
			? `${encodeURIComponent(entry.name)}/`
			: getLabArtifactDisplayHref(labName, entry.path),
	);
	const commonActions = `<div class="actions">
<a class="action action--primary" href="${escapeHtml(archiveHref)}" download>下载完整实验包</a>
<a class="action" href="${escapeHtml(readmeHref)}">阅读使用说明</a>
<a class="action" href="${escapeHtml(manifest.parent.href)}">返回${escapeHtml(manifest.parent.label)}</a>
</div>`;

	let workflow;
	if (usage.mode === 'starter') {
		const taskHref = getLabArtifactDisplayHref(labName, usage.currentTask);
		const downloaderCommands =
			`curl -LO ${siteOrigin}${archiveHref}\n` +
			`tar -xzf ${labName}.tar.gz\n` +
			`cd ${labName}\n` +
			`make setup\n` +
			`make grade`;
		const maintainerCommands =
			`cd labs/${labName}\n` +
			`make setup\n` +
			`make private-setup\n` +
			`make source-status\n` +
			`make test\n` +
			`make grade`;
		workflow = `<div class="grid">
<section class="panel">
<p class="eyebrow">下载者</p>
<h2>下载 Starter，在本地完成实现</h2>
<p>下载包中的 <code>${escapeHtml(usage.publicSource)}/</code> 是刻意保留 TODO 的公开起点。解压后直接修改它，再用公开测试和评分命令验收。</p>
<pre><code>${escapeHtml(downloaderCommands)}</code></pre>
<div class="actions"><a class="action" href="${escapeHtml(taskHref)}">打开当前任务书</a></div>
</section>
<section class="panel callout">
<p class="eyebrow">公开边界</p>
<h2>网站只展示 Starter，不展示个人答案</h2>
<ul>
<li><strong><code>${escapeHtml(usage.publicSource)}/</code></strong>：网站和压缩包中的公开 Starter。</li>
<li><strong><code>${escapeHtml(usage.privateSource)}/</code></strong>：维护者本地实现，被 Git 和发布器排除。</li>
<li>Markdown 在阅读页打开；源码、测试、数据和图表按发布原文打开。</li>
</ul>
</section>
</div>
<section class="panel panel--wide">
<p class="eyebrow">仓库维护者</p>
<h2>在私有工作区实现，不直接修改公开 Starter</h2>
<p><code>make private-setup</code> 只在首次使用时复制 Starter，并拒绝覆盖已有 <code>${escapeHtml(usage.privateSource)}/</code>。之后 Makefile 会自动选择私有源码。</p>
<pre><code>${escapeHtml(maintainerCommands)}</code></pre>
</section>`;
	} else {
		const evidenceCommands =
			`curl -LO ${siteOrigin}${archiveHref}\n` + `tar -xzf ${labName}.tar.gz\n` + `cd ${labName}`;
		workflow = `<div class="grid">
<section class="panel">
<p class="eyebrow">复现者</p>
<h2>下载完整证据包，从 README 开始</h2>
<p>该 Lab 是已完成实验的复现包。先阅读运行顺序和环境边界，再检查脚本、日志、响应与原始结果。</p>
<pre><code>${escapeHtml(evidenceCommands)}</code></pre>
</section>
<section class="panel callout">
<p class="eyebrow">证据边界</p>
<h2>目录只包含发布清单允许的材料</h2>
<p>发布器按 <code>lab.json</code> 白名单复制文件；本地环境、缓存、隐藏文件和私人目录不会进入网站或压缩包。</p>
</section>
</div>`;
	}

	return renderPage(
		manifest.title,
		`<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><a href="/labs/">Labs</a><span>/</span><span>${escapeHtml(labName)}</span></nav>
<header class="hero">
<p class="eyebrow">${usage.mode === 'starter' ? '公开 Starter' : '可复现实验证据'}</p>
<h1>${escapeHtml(manifest.title)}</h1>
<p class="lead">${escapeHtml(manifest.description)}</p>
<ul class="meta"><li>${entries.length} 个顶层条目</li><li>压缩包 ${escapeHtml(formatByteSize(archiveSize))}</li><li>${usage.mode === 'starter' ? '本地答案不发布' : '白名单发布'}</li></ul>
${commonActions}
</header>
${workflow}
<section class="panel panel--wide">
<div class="listing-heading"><h2>公开文件</h2><p>目录用于审计；开始实验请先读 README 或当前任务书。</p></div>
<pre class="listing"><a href="../">../</a>\n${directoryRows}</pre>
</section>`,
	);
}

function renderLabsHome(labs, entries) {
	const cards = labs
		.map(
			(lab) => `<article class="lab-card">
<p class="eyebrow">${lab.usageMode === 'starter' ? 'Starter Lab' : 'Evidence Lab'}</p>
<h2><a href="/labs/${encodeURIComponent(lab.slug)}/">${escapeHtml(lab.title)}</a></h2>
<p>${escapeHtml(lab.description)}</p>
<ul class="meta"><li>${lab.files} 个文件</li><li>${escapeHtml(formatByteSize(lab.archiveBytes))}</li></ul>
<div class="actions"><a class="action" href="/labs/${encodeURIComponent(lab.slug)}/">查看用法与文件</a><a class="action" href="/labs/${encodeURIComponent(lab.archive)}" download>下载</a></div>
</article>`,
		)
		.join('\n');
	const directoryRows = renderDirectoryRows(entries);

	return renderPage(
		'Labs · Starter 与可复现实验包',
		`<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><span>Labs</span></nav>
<header class="hero">
<p class="eyebrow">Labs</p>
<h1>Starter 与可复现实验包</h1>
<p class="lead">每个 Lab 页面都说明怎样下载、从哪里开始、哪些文件公开，以及维护者如何隔离本地实现。实验顺序仍以实验路线页为准。</p>
<div class="actions"><a class="action action--primary" href="/learning/">进入实验路线</a><a class="action" href="/labs/index.json">查看机器可读清单</a></div>
</header>
<section class="lab-grid">${cards}</section>
<section class="panel panel--wide">
<div class="listing-heading"><h2>发布目录</h2><p>压缩包与机器可读索引。</p></div>
<pre class="listing"><a href="../">../</a>\n${directoryRows}</pre>
</section>`,
	);
}

async function writeLabDirectoryIndexes(stagingRoot, labName, manifest, artifacts, archiveSize) {
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
			directoryPath === ''
				? renderLabLanding(
						manifest,
						labName,
						listLabDirectoryEntries(artifacts, directoryPath),
						archiveSize,
					)
				: renderDirectoryIndex(
						displayedPath,
						listLabDirectoryEntries(artifacts, directoryPath),
						(entry) =>
							entry.kind === 'directory'
								? `${encodeURIComponent(entry.name)}/`
								: getLabArtifactDisplayHref(labName, entry.path),
					),
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
			'--owner=0',
			'--group=0',
			'--numeric-owner',
			'--format=ustar',
			...archiveEntries,
		],
		{
			encoding: null,
			env: { ...process.env, COPYFILE_DISABLE: '1' },
			maxBuffer: 128 * 1024 * 1024,
		},
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
		const stagedArtifacts = [];
		for (const artifact of artifacts) {
			const targetPath = path.join(stagingRoot, labName, ...artifact.path.split('/'));
			await mkdir(path.dirname(targetPath), { recursive: true });
			await copyFile(artifact.absolutePath, targetPath);
			stagedArtifacts.push({ artifact, targetPath });

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

		// collectLabArtifacts() returns paths in a stable order. Normalizing the
		// staged mtimes makes the archive reproducible without GNU-only tar flags.
		await Promise.all(
			stagedArtifacts.map(({ targetPath }) =>
				utimes(targetPath, reproducibleArchiveTimestamp, reproducibleArchiveTimestamp),
			),
		);
		const archiveBuffer = createArchiveBuffer(labName, stagingRoot, artifacts);
		await Promise.all(
			stagedArtifacts.map(({ artifact, targetPath }) => {
				const modifiedDate = new Date(artifact.modifiedTimestamp);
				return utimes(targetPath, modifiedDate, modifiedDate);
			}),
		);
		await writeFile(path.join(stagingRoot, `${labName}.tar.gz`), archiveBuffer);
		await writeLabDirectoryIndexes(
			stagingRoot,
			labName,
			manifest,
			artifacts,
			archiveBuffer.byteLength,
		);
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
			description: manifest.description,
			usageMode: manifest.usage.mode,
			files: artifacts.length,
			archive: `${labName}.tar.gz`,
			archiveBytes: archiveBuffer.byteLength,
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
		renderLabsHome(publicationIndex, publicationEntries),
	);
	await rm(publicLabsRoot, { recursive: true, force: true });
	await rename(stagingRoot, publicLabsRoot);
} catch (error) {
	await rm(stagingRoot, { recursive: true, force: true });
	throw error;
}

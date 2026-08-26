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
const typographyFonts = [
	{
		name: 'merienda-one-latin-400-normal.woff2',
		source: path.join(
			workspaceRoot,
			'node_modules/@fontsource/merienda-one/files/merienda-one-latin-400-normal.woff2',
		),
	},
	{
		name: 'kalam-latin-400-normal.woff2',
		source: path.join(
			workspaceRoot,
			'node_modules/@fontsource/kalam/files/kalam-latin-400-normal.woff2',
		),
	},
	{
		name: 'fira-mono-latin-400-normal.woff2',
		source: path.join(
			workspaceRoot,
			'node_modules/@fontsource/fira-mono/files/fira-mono-latin-400-normal.woff2',
		),
	},
];
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
@font-face { font-family: "Merienda One"; src: url("/labs/_fonts/merienda-one-latin-400-normal.woff2") format("woff2"); font-display: swap; font-style: normal; font-weight: 400; }
@font-face { font-family: "Kalam"; src: url("/labs/_fonts/kalam-latin-400-normal.woff2") format("woff2"); font-display: swap; font-style: normal; font-weight: 400; }
@font-face { font-family: "Fira Mono"; src: url("/labs/_fonts/fira-mono-latin-400-normal.woff2") format("woff2"); font-display: swap; font-style: normal; font-weight: 400; }
:root { color-scheme: light; font-family: "Merienda One", Arial, Helvetica, sans-serif; font-size: 100%; line-height: 1.5; color: #0f172a; background: #fafbfc; }
*, *::before, *::after { box-sizing: border-box; }
body { display: flex; flex-direction: column; min-height: 100vh; margin: 0; background: #fafbfc; font-family: "Kalam", "Sans Serif", sans-serif; font-size: 1rem; line-height: inherit; }
a { color: #3730a3; text-decoration: none; text-underline-offset: 0.18em; }
a:hover { color: #312e81; text-decoration: underline; }
.site-header { position: sticky; top: 0; z-index: 40; flex: none; width: 100%; border-bottom: 1px solid rgb(15 23 42 / 10%); background: rgb(255 255 255 / 75%); backdrop-filter: blur(8px); }
.header-inner { display: flex; width: 100%; padding: 1rem 2rem; align-items: center; }
.site-title { color: #0f172a; font-family: "Merienda One", Arial, Helvetica, sans-serif; font-size: 1rem; white-space: nowrap; }
.page-shell { display: flex; flex: none; width: min(100%, 1024px); min-height: 100vh; margin: 0 auto; padding: 0 1rem; align-items: flex-start; }
.wiki { flex: none; width: min(100%, 768px); padding: 2.5rem; border: 0 solid #e5e7eb; background: rgb(229 229 229 / 10%); font-size: 1rem; line-height: 1.75; }
.wiki h1, .wiki h2, .wiki h3, .wiki h4, .wiki h5, .wiki h6 { color: #111827; font-family: "Merienda One", Arial, Helvetica, sans-serif; font-weight: 700; }
.wiki h1 { margin: 0 0 1rem; padding: 1.5rem 0 0; font-size: 1.5rem; line-height: 2rem; }
.wiki h2 { margin: 0; padding: 1.5rem 0 0.5rem; font-size: 1.25rem; line-height: 1.75rem; }
.wiki h3 { margin: 0; padding: 0.5rem 0; font-size: 1.125rem; line-height: 1.75rem; }
.wiki p { margin: 0; line-height: 1.625; }
.wiki p + p { margin-top: 0.25rem; }
.wiki strong, .wiki b { font-weight: 600; }
.breadcrumbs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0 0 0.25rem; color: #64748b; font-size: 0.9rem; }
.breadcrumbs a { color: inherit; }
.wiki-index-list, .lab-index { margin: 0.25rem 0; padding: 0 0 0 0.5rem; list-style-position: inside; }
.wiki-index-list { list-style-type: disc; }
.lab-index { list-style-type: decimal; }
.wiki-index-list li, .lab-index li { margin: 0.25rem 1rem; padding: 0; text-align: left; }
.link-row { margin-top: 0.25rem !important; }
.section-note, .lab-summary { color: #475569; }
.lab-kind { margin-right: 0.25rem; padding-right: 0.25rem; padding-left: 0.25rem; }
.lab-kind.is-blue { background: #e0f2fe; }
.lab-kind.is-gray { background: #f1f5f9; }
.lab-index .lab-links { margin-left: 0.35rem; white-space: nowrap; }
pre { max-width: 100%; margin: 0.5rem 0; padding: 0.5rem; overflow-x: auto; border: 0; border-radius: 0.375rem; background: rgb(226 232 240 / 70%); box-shadow: 0 1px 3px rgb(0 0 0 / 10%); color: #0f172a; font: 0.9rem/1.5 "Fira Mono", monospace; }
.listing { white-space: pre; }
code { padding: 0 0.125rem; background: transparent; color: #0f172a; font-family: "Fira Mono", monospace; font-size: 0.85em; }
pre code { padding: 0; font-size: inherit; }
.site-footer { flex: none; background: #f5f5f5; color: #525252; font-family: "Merienda One", Arial, Helvetica, sans-serif; text-align: center; }
.footer-inner { padding: 1.5rem; background: #e5e5e5; }
.site-footer a { color: inherit; }
@media (min-width: 768px) { .wiki { border-width: 1px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%); } }
@media (max-width: 767px) { .header-inner { padding: 0.75rem 1rem; } .wiki { padding: 1.5rem 0 2rem; } .wiki-index-list li, .lab-index li { margin-right: 0; margin-left: 0.5rem; } }
</style>
</head>
<body>
<header class="site-header"><div class="header-inner"><a class="site-title" href="/">QuanZhou's Wiki</a></div></header>
<div class="page-shell"><main class="wiki">${content}</main></div>
<footer class="site-footer"><div class="footer-inner"><a rel="license" href="http://creativecommons.org/licenses/by-nc/4.0/">Creative Commons License: BY-NC 4.0</a><br><a href="https://beian.miit.gov.cn/">苏 ICP 备 2026057919 号-1</a></div></footer>
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
<header>
<h1>Index of ${escapeHtml(displayedPath)}</h1>
<ul class="wiki-index-list"><li>Markdown 以阅读页打开，其他文件显示发布原文。</li><li><a href="../">返回上一级目录</a></li></ul>
</header>
<section><h2>公开文件</h2><pre class="listing"><a href="../">../</a>\n${rows}</pre></section>`,
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
	const commonActions = `<p class="link-row"><a href="${escapeHtml(archiveHref)}" download>下载完整实验包</a> | <a href="${escapeHtml(readmeHref)}">阅读使用说明</a> | <a href="${escapeHtml(manifest.parent.href)}">返回${escapeHtml(manifest.parent.label)}</a></p>`;

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
		workflow = `<section>
<h2>下载 Starter，在本地完成实现</h2>
<p>下载包中的 <code>${escapeHtml(usage.publicSource)}/</code> 是刻意保留 TODO 的公开起点。解压后直接修改它，再用公开测试和评分命令验收。</p>
<pre><code>${escapeHtml(downloaderCommands)}</code></pre>
<p class="link-row"><a href="${escapeHtml(taskHref)}">打开当前任务书</a></p>
</section>
<section>
<h2>网站只展示 Starter，不展示个人答案</h2>
<ul class="wiki-index-list">
<li><strong><code>${escapeHtml(usage.publicSource)}/</code></strong>：网站和压缩包中的公开 Starter。</li>
<li><strong><code>${escapeHtml(usage.privateSource)}/</code></strong>：维护者本地实现，被 Git 和发布器排除。</li>
<li>Markdown 在阅读页打开；源码、测试、数据和图表按发布原文打开。</li>
</ul>
</section>
<section>
<h2>在私有工作区实现，不直接修改公开 Starter</h2>
<p><code>make private-setup</code> 只在首次使用时复制 Starter，并拒绝覆盖已有 <code>${escapeHtml(usage.privateSource)}/</code>。之后 Makefile 会自动选择私有源码。</p>
<pre><code>${escapeHtml(maintainerCommands)}</code></pre>
</section>`;
	} else {
		const evidenceCommands =
			`curl -LO ${siteOrigin}${archiveHref}\n` + `tar -xzf ${labName}.tar.gz\n` + `cd ${labName}`;
		workflow = `<section>
<h2>下载完整证据包，从 README 开始</h2>
<p>该 Lab 是已完成实验的复现包。先阅读运行顺序和环境边界，再检查脚本、日志、响应与原始结果。</p>
<pre><code>${escapeHtml(evidenceCommands)}</code></pre>
</section>
<section>
<h2>目录只包含发布清单允许的材料</h2>
<p>发布器按 <code>lab.json</code> 白名单复制文件；本地环境、缓存、隐藏文件和私人目录不会进入网站或压缩包。</p>
</section>`;
	}

	return renderPage(
		manifest.title,
		`<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><a href="/labs/">Labs</a><span>/</span><span>${escapeHtml(labName)}</span></nav>
<header>
<h1>${escapeHtml(manifest.title)}</h1>
<ul class="wiki-index-list"><li><strong>类型：</strong>${usage.mode === 'starter' ? '公开 Starter' : '可复现实验证据'}</li><li>${escapeHtml(manifest.description)}</li><li><strong>内容：</strong>${entries.length} 个顶层条目；压缩包 ${escapeHtml(formatByteSize(archiveSize))}；${usage.mode === 'starter' ? '本地答案不发布' : '白名单发布'}</li></ul>
${commonActions}
</header>
${workflow}
<section>
<h2>公开文件</h2><p class="section-note">目录用于审计；开始实验请先读 README 或当前任务书。</p>
<pre class="listing"><a href="../">../</a>\n${directoryRows}</pre>
</section>`,
	);
}

function renderLabsHome(labs, entries) {
	const cards = labs
		.map(
			(lab) =>
				`<li><span class="lab-kind ${lab.usageMode === 'starter' ? 'is-blue' : 'is-gray'}">${lab.usageMode === 'starter' ? 'Starter' : 'Evidence'}</span><a href="/labs/${encodeURIComponent(lab.slug)}/">${escapeHtml(lab.title)}</a>（${lab.files} 个文件 · ${escapeHtml(formatByteSize(lab.archiveBytes))}）<br><span class="lab-summary">${escapeHtml(lab.description)}</span><br><span class="lab-links"><a href="/labs/${encodeURIComponent(lab.slug)}/">查看用法与文件</a> | <a href="/labs/${encodeURIComponent(lab.archive)}" download>下载</a></span></li>`,
		)
		.join('\n');
	const directoryRows = renderDirectoryRows(entries);

	return renderPage(
		'Labs · Starter 与可复现实验包',
		`<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><span>Labs</span></nav>
<header>
<h1>Starter 与可复现实验包</h1>
<ul class="wiki-index-list"><li>每个 Lab 页面都说明怎样下载、从哪里开始、哪些文件公开，以及维护者如何隔离本地实现。</li><li>实验顺序以 <a href="/learning/">实验路线</a> 为准；<a href="/labs/index.json">机器可读清单</a>用于自动化审计。</li></ul>
</header>
<section><h2>可用 Lab</h2><ol class="lab-index">${cards}</ol></section>
<section>
<h2>发布目录</h2><p class="section-note">压缩包与机器可读索引。</p>
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
	const typographyFontDirectory = path.join(stagingRoot, '_fonts');
	await mkdir(typographyFontDirectory, { recursive: true });
	await Promise.all(
		typographyFonts.map((font) =>
			copyFile(font.source, path.join(typographyFontDirectory, font.name)),
		),
	);

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

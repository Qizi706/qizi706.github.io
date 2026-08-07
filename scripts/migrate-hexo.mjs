import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArguments(argv) {
	const options = {
		write: false,
		force: false,
		only: [],
		source: path.resolve(projectRoot, '../qizi706/source/_posts'),
		destination: path.resolve(projectRoot, 'src/content/blog'),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === '--write') {
			options.write = true;
		} else if (argument === '--force') {
			options.force = true;
		} else if (argument === '--only') {
			const value = argv[index + 1];
			if (!value) throw new Error('--only requires a comma-separated list of post slugs');
			options.only = value
				.split(',')
				.map((slug) => slug.trim().replace(/\.md$/, ''))
				.filter(Boolean);
			index += 1;
		} else if (argument === '--source' || argument === '--destination') {
			const value = argv[index + 1];
			if (!value) throw new Error(`${argument} requires a path`);
			options[argument.slice(2)] = path.resolve(process.cwd(), value);
			index += 1;
		} else if (argument === '--help') {
			options.help = true;
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	return options;
}

function printHelp() {
	console.log(`Migrate Hexo Markdown posts to Astro content collections.

Usage:
  npm run migrate:hexo
  npm run migrate:hexo -- --write
  npm run migrate:hexo -- --write --force

Options:
  --write               Write converted posts (default is dry-run)
  --force               Overwrite existing destination posts
  --only <slug,...>     Migrate only the listed post slugs
  --source <path>       Hexo _posts directory
  --destination <path>  Astro blog content directory
  --help                Show this help`);
}

function splitFrontmatter(source, filename) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) throw new Error(`${filename}: missing YAML frontmatter`);

	return {
		frontmatter: match[1],
		body: source.slice(match[0].length),
	};
}

function unquote(value) {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function splitInlineList(value) {
	const content = value.trim().replace(/^\[/, '').replace(/\]$/, '');
	const items = [];
	let current = '';
	let quote = '';

	for (const character of content) {
		if ((character === '"' || character === "'") && (!quote || quote === character)) {
			quote = quote ? '' : character;
			current += character;
		} else if (character === ',' && !quote) {
			if (current.trim()) items.push(unquote(current));
			current = '';
		} else {
			current += character;
		}
	}

	if (current.trim()) items.push(unquote(current));
	return items.filter(Boolean);
}

function parseListValue(value) {
	const trimmed = value.trim();
	return trimmed.startsWith('[') && trimmed.endsWith(']')
		? splitInlineList(trimmed)
		: [unquote(trimmed)].filter(Boolean);
}

function parseHexoFrontmatter(source) {
	const lines = source.split(/\r?\n/);
	const data = {};

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^([A-Za-z][\w-]*):(?:\s*(.*))?$/);
		if (!match) continue;

		const [, key, rawValue = ''] = match;
		if (key === 'categories' || key === 'tags') {
			const values = [];
			if (rawValue.trim()) values.push(...parseListValue(rawValue));

			while (index + 1 < lines.length) {
				const item = lines[index + 1].match(/^\s+-\s+(.+)$/);
				if (!item) break;
				values.push(...parseListValue(item[1]));
				index += 1;
			}

			data[key] = [...new Set(values)];
		} else if (rawValue === 'true' || rawValue === 'false') {
			data[key] = rawValue === 'true';
		} else {
			data[key] = unquote(rawValue);
		}
	}

	return data;
}

function formatPubDate(value, filename) {
	const match = String(value ?? '').match(
		/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?(?:Z|[+-]\d{2}:?\d{2})?$/,
	);
	if (!match) throw new Error(`${filename}: unsupported date value "${value}"`);

	const time = match[2] ? (match[2].length === 5 ? `${match[2]}:00` : match[2]) : '00:00:00';
	return `${match[1]}T${time}+08:00`;
}

function dedent(source) {
	const lines = source.replace(/^\n+|\n+$/g, '').split('\n');
	const indents = lines
		.filter((line) => line.trim())
		.map((line) => line.match(/^\s*/)?.[0].length ?? 0);
	const indentation = indents.length ? Math.min(...indents) : 0;
	return lines.map((line) => line.slice(indentation)).join('\n');
}

function stripHtml(source) {
	return source.replace(/<[^>]+>/g, ' ');
}

function cleanDescription(source, fallback) {
	const excerptSource = source.includes('<!--more-->') ? source.split('<!--more-->', 1)[0] : source;
	const text = stripHtml(
		excerptSource
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/\{%[\s\S]*?%\}/g, ' ')
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/^\s{0,3}#{1,6}\s+/gm, '')
			.replace(/^\s*>\s?/gm, '')
			.replace(/^\s*[-*+]\s+/gm, '')
			.replace(/[`*_~]/g, '')
			.replace(/\$+/g, ''),
	)
		.replace(/\s+/g, ' ')
		.trim();

	if (!text) return fallback;
	return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
}

function convertNotes(source) {
	return source.replace(
		/^[ \t]*\{%\s*note(?:\s+([^\s%]+))?\s*%\}\s*\r?\n([\s\S]*?)^[ \t]*\{%\s*endnote\s*%\}\s*$/gim,
		(_, variant = 'note', content) => {
			const labels = {
				danger: 'CAUTION',
				info: 'NOTE',
				note: 'NOTE',
				success: 'TIP',
				warning: 'WARNING',
			};
			const label = labels[String(variant).toLowerCase()] ?? 'NOTE';
			const quoted = dedent(content)
				.split('\n')
				.map((line) => (line ? `> ${line}` : '>'))
				.join('\n');
			return `> [!${label}]\n${quoted}\n`;
		},
	);
}

function convertLegacyDiagrams(source) {
	const figuresConverted = source.replace(
		/<figure>\s*\{%\s*mermaid\s*%\}\s*([\s\S]*?)\s*\{%\s*endmermaid\s*%\}\s*(?:<figcaption[^>]*>([\s\S]*?)<\/figcaption>\s*)?<\/figure>/gi,
		(_, diagram, rawCaption = '') => {
			const caption = stripHtml(rawCaption).replace(/\s+/g, ' ').trim();
			return `\`\`\`text\n${dedent(diagram)}\n\`\`\`${caption ? `\n\n*${caption}*` : ''}`;
		},
	);

	return figuresConverted
		.replace(/^[ \t]*\{%\s*mermaid\s*%\}\s*$/gim, '```text')
		.replace(/^[ \t]*\{%\s*endmermaid\s*%\}\s*$/gim, '```');
}

function convertBody(source) {
	return convertLegacyDiagrams(convertNotes(source))
		.replace(/^\s*<!--more-->\s*$/gim, '')
		.replaceAll('/asserts/', '/assets/')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function yamlString(value) {
	return JSON.stringify(String(value));
}

function yamlList(name, values) {
	if (!values.length) return `${name}: []`;
	return `${name}:\n${values.map((value) => `  - ${yamlString(value)}`).join('\n')}`;
}

function serializePost(frontmatter, body, filename) {
	if (!frontmatter.title) throw new Error(`${filename}: title is required`);
	if (!frontmatter.date) throw new Error(`${filename}: date is required`);

	const description = cleanDescription(body, frontmatter.title);
	const output = [
		'---',
		`title: ${yamlString(frontmatter.title)}`,
		`description: ${yamlString(description)}`,
		`pubDate: ${yamlString(formatPubDate(frontmatter.date, filename))}`,
		yamlList('categories', frontmatter.categories ?? []),
		yamlList('tags', frontmatter.tags ?? []),
		'draft: false',
		`mathjax: ${frontmatter.mathjax === true}`,
		'---',
		'',
		convertBody(body),
		'',
	].join('\n');

	const unsupported = output.match(/\{%|<!--more-->|\/asserts\//);
	if (unsupported)
		throw new Error(`${filename}: unsupported Hexo syntax remains: ${unsupported[0]}`);
	return output;
}

async function fileExists(filename) {
	try {
		await readFile(filename);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}

	const allFilenames = (await readdir(options.source))
		.filter((filename) => filename.endsWith('.md'))
		.sort();
	const filenames = options.only.length
		? allFilenames.filter((filename) => options.only.includes(filename.replace(/\.md$/, '')))
		: allFilenames;
	const missingSlugs = options.only.filter((slug) => !allFilenames.includes(`${slug}.md`));
	if (missingSlugs.length) throw new Error(`Unknown post slug(s): ${missingSlugs.join(', ')}`);

	if (options.write) await mkdir(options.destination, { recursive: true });

	const summary = { create: 0, overwrite: 0, skip: 0 };
	for (const filename of filenames) {
		const sourcePath = path.join(options.source, filename);
		const destinationPath = path.join(options.destination, filename);
		const source = await readFile(sourcePath, 'utf8');
		const { frontmatter: rawFrontmatter, body } = splitFrontmatter(source, filename);
		const converted = serializePost(parseHexoFrontmatter(rawFrontmatter), body, filename);
		const exists = await fileExists(destinationPath);

		if (exists && !options.force) {
			console.log(`[skip]      ${filename} (already exists; use --force to overwrite)`);
			summary.skip += 1;
			continue;
		}

		const action = exists ? 'overwrite' : 'create';
		console.log(`[${options.write ? action : `would-${action}`}] ${filename}`);
		summary[action] += 1;
		if (options.write) await writeFile(destinationPath, converted, 'utf8');
	}

	console.log(
		`\n${options.write ? 'Migration' : 'Dry-run'} complete: ${filenames.length} source posts, ` +
			`${summary.create} create, ${summary.overwrite} overwrite, ${summary.skip} skip.`,
	);
	if (!options.write) console.log('Run with --write after reviewing this plan.');
}

main().catch((error) => {
	console.error(`Migration failed: ${error.message}`);
	process.exitCode = 1;
});

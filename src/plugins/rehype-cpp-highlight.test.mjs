import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import rehypeCppHighlight, { cppLanguages, highlightCpp } from './rehype-cpp-highlight.mjs';

function text(node) {
	return node.type === 'text' ? node.value : (node.children ?? []).map(text).join('');
}
async function tokens(source) {
	const children = await highlightCpp(source);
	assert.equal(text({ children }), source, 'rendering must preserve all source characters');
	return children
		.filter((node) => node.type === 'element')
		.flatMap((line) =>
			line.children.map((token) => ({
				text: text(token),
				kind: token.properties.className[1],
				style: token.properties.style,
			})),
		);
}
function expectToken(result, spelling, kind) {
	assert.ok(
		result.some((token) => token.text === spelling && token.kind === kind),
		`${spelling}: expected ${kind}`,
	);
}

test('Buffer initialization forms are objects, not functions', async () => {
	const result = await tokens('Buffer a(3);\nBuffer b{3};\nBuffer c{3, 7};\nBuffer d = {3};');
	for (const name of ['a', 'b', 'c', 'd']) expectToken(result, name, 'variable');
	assert.equal(result.filter((t) => t.text === 'Buffer' && t.kind === 'type').length, 4);
	assert.ok(!result.some((t) => t.kind === 'function'));
});

test('default initialization and function declaration stay distinct', async () => {
	const result = await tokens('std::string a;\nstd::string b{};\nstd::string c();');
	expectToken(result, 'a', 'variable');
	expectToken(result, 'b', 'variable');
	expectToken(result, 'c', 'function');
	assert.equal(result.filter((t) => t.text === 'string' && t.kind === 'type').length, 3);
});

test('auto and template declarations preserve types and object names', async () => {
	const result = await tokens(
		'auto a = 7;\nauto b{7};\nauto c = {7};\nstd::vector<int> d(3, 7);\nstd::vector<int> e{3, 7};',
	);
	for (const name of ['a', 'b', 'c', 'd', 'e']) expectToken(result, name, 'variable');
	expectToken(result, 'auto', 'primitive');
	expectToken(result, 'int', 'primitive');
	expectToken(result, 'vector', 'type');
});

test('multiline initializers, nested templates and multiple declarators', async () => {
	const result = await tokens(
		'std::vector<std::vector<int>> grid(\n  3, std::vector<int>(7)\n);\nBuffer a{3}, b{7};\nconst Buffer& view = a;',
	);
	for (const name of ['grid', 'a', 'b', 'view']) expectToken(result, name, 'variable');
	expectToken(result, 'const', 'keyword');
});

test('function names remain functions, including parameterized declarations', async () => {
	const result = await tokens(
		'Buffer make();\nBuffer build(int count);\nvoid run() { inspect(3); object.inspect(); }',
	);
	for (const name of ['make', 'build', 'run', 'inspect']) expectToken(result, name, 'function');
});

test('comments, raw strings, Unicode and HTML-looking source are preserved', async () => {
	const result = await tokens(
		'// 中文 😀 Buffer a(3);\nstd::string text = R"(\nBuffer fake(3); <script> &\n)";\n/* Buffer hidden{}; */\nBuffer real{3};\n',
	);
	expectToken(result, 'real', 'variable');
	assert.ok(!result.some((t) => ['fake', 'hidden'].includes(t.text) && t.kind === 'variable'));
	assert.ok(result.some((t) => t.kind === 'string' && t.text.includes('<script>')));
	assert.ok(result.some((t) => t.kind === 'comment' && t.text.includes('中文 😀')));
});

test('incomplete teaching snippets still render without dropping text', async () => {
	await tokens('template<class T>\nauto first(T& value) {\n  return value.front();\n');
	await tokens('');
});

function block(language, source) {
	return {
		type: 'element',
		tagName: 'pre',
		properties: {},
		children: [
			{
				type: 'element',
				tagName: 'code',
				properties: { className: [`language-${language}`] },
				children: [{ type: 'text', value: source }],
			},
		],
	};
}

test('rehype handles C++ aliases while leaving other code blocks untouched', async () => {
	const other = block('javascript', 'const value = make(3);');
	const before = structuredClone(other);
	const tree = {
		type: 'root',
		children: [...cppLanguages.map((lang) => block(lang, 'Buffer a(3);')), other],
	};
	await rehypeCppHighlight()(tree);
	for (const node of tree.children.slice(0, -1)) {
		assert.equal(node.properties['data-highlighter'], 'tree-sitter');
		assert.equal(text(node), 'Buffer a(3);');
		assert.ok(node.properties.className.includes('astro-code'));
	}
	assert.deepEqual(other, before);
});

test('existing C++ blog snippets all parse and preserve their source', async () => {
	let count = 0;
	const directory = new URL('../content/blog/', import.meta.url);
	for (const name of await readdir(directory)) {
		if (!/\.mdx?$/.test(name)) continue;
		const content = await readFile(new URL(name, directory), 'utf8');
		for (const match of content.matchAll(/```(?:cpp|c\+\+|cc|cxx|hpp|hxx)\s*\n([\s\S]*?)```/g)) {
			await tokens(match[1]);
			count++;
		}
	}
	assert.ok(count > 50, `expected to check the article corpus, got ${count}`);
});

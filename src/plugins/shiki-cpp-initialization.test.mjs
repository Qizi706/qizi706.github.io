import assert from 'node:assert/strict';
import test from 'node:test';
import { codeToHtml } from 'shiki';
import cppInitialization from './shiki-cpp-initialization.mjs';
import { pygmentsDefaultTheme as theme } from '../themes/pygments-default.mjs';

async function highlight(source, { fix = true, lang = 'cpp' } = {}) {
	let result;
	await codeToHtml(source, {
		lang,
		theme,
		includeExplanation: true,
		transformers: [
			...(fix ? [cppInitialization()] : []),
			{
				tokens(lines) {
					result = lines;
				},
			},
		],
	});
	assert.equal(result.map((line) => line.map((t) => t.content).join('')).join('\n'), source);
	return result.map((line) =>
		line.flatMap((t) =>
			[...t.content].map((char) => ({
				char,
				color: t.color?.toLowerCase(),
				fontStyle: t.fontStyle ?? 0,
			})),
		),
	);
}

function wordStyle(line, word, occurrence = 0) {
	const text = line.map((c) => c.char).join('');
	let index = -1;
	for (let i = 0; i <= occurrence; i++) index = text.indexOf(word, index + 1);
	assert.ok(index >= 0);
	return line
		.slice(index, index + word.length)
		.map(({ color, fontStyle }) => ({ color, fontStyle }));
}

const typeStyle = { color: '#0000ff', fontStyle: 2 };
const variableStyle = { color: '#0f172a', fontStyle: 0 };

test('all four initialization forms distinguish types from object names', async () => {
	const lines = await highlight(
		'Buffer a(3); // 数量\nBuffer b{3};\nBuffer c{3, 7};\nBuffer d = {3};',
	);
	for (const [i, name] of ['a', 'b', 'c', 'd'].entries()) {
		assert.deepEqual(wordStyle(lines[i], 'Buffer'), Array(6).fill(typeStyle));
		assert.deepEqual(wordStyle(lines[i], ` ${name}`).slice(1), [variableStyle]);
	}
});

test('qualifiers, namespace and template types retain their own highlighting', async () => {
	const source =
		'const Buffer& view = source;\nns::Buffer value = {3};\nstd::vector<int> values(3, 7);';
	const lines = await highlight(source);
	assert.deepEqual(wordStyle(lines[0], 'view'), Array(4).fill(variableStyle));
	assert.deepEqual(wordStyle(lines[1], 'Buffer'), Array(6).fill(typeStyle));
	assert.deepEqual(wordStyle(lines[2], 'vector'), Array(6).fill(typeStyle));
	assert.deepEqual(wordStyle(lines[2], 'values'), Array(6).fill(variableStyle));
	const original = await highlight(source, { fix: false });
	assert.deepEqual(wordStyle(lines[0], 'const'), wordStyle(original[0], 'const'));
	assert.deepEqual(wordStyle(lines[2], 'int'), wordStyle(original[2], 'int'));
});

test('function declarations and calls are not rewritten as object names', async () => {
	const source =
		'Buffer make();\nBuffer make(int count);\nBuffer make(int count) { return Buffer{count}; }\ninspect(3);\nBuffer ambiguous(other);\nreturn Buffer{3};\nint count = 3;';
	assert.deepEqual(await highlight(source), await highlight(source, { fix: false }));
});

test('declaration-looking text in comments, raw strings and macros is untouched', async () => {
	const source =
		'// Buffer a(3);\n/*\nBuffer b = {3};\n*/\nauto text = R"(\nBuffer c{3};\n)";\n#define VALUE Buffer d(3)';
	assert.deepEqual(await highlight(source), await highlight(source, { fix: false }));
});

test('ordinary strings and comments keep their original colors', async () => {
	const source = 'Label label("Buffer a(3)"); // Buffer b{3};';
	const actual = (await highlight(source))[0];
	const original = (await highlight(source, { fix: false }))[0];
	const start = source.indexOf('(');
	assert.deepEqual(actual.slice(start), original.slice(start));
});

test('other languages are unchanged', async () => {
	const source = 'const value = make(3); // Buffer a(3)';
	assert.deepEqual(
		await highlight(source, { lang: 'javascript' }),
		await highlight(source, { lang: 'javascript', fix: false }),
	);
});

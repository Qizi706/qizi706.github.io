// TextMate can mistake `T value(3)` for a function and miss T in `T value = ...`.
// Correct only unambiguous, single-line declarations; this is not a C++ parser.
const declaration =
	/^\s*(?:(?:const|volatile|static|constexpr|constinit|inline|thread_local)\s+)*(?<type>[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)(?:\s*<[^;{}()]+>)?\s*[*&]*\s+(?<variable>[A-Za-z_]\w*)\s*(?<initializer>=(?!=)|\{|\()/d;
const nonTypes = new Set([
	'return',
	'co_return',
	'throw',
	'new',
	'delete',
	'using',
	'typedef',
	'class',
	'struct',
	'enum',
	'union',
	'namespace',
	'case',
	'else',
	'void',
	'auto',
	'bool',
	'char',
	'char8_t',
	'char16_t',
	'char32_t',
	'wchar_t',
	'short',
	'int',
	'long',
	'signed',
	'unsigned',
	'float',
	'double',
]);

/** @param {import('shiki').ThemedToken} token */
function isProtected(token) {
	return token.explanation?.some((part) =>
		part.scopes.some(({ scopeName }) =>
			/^(comment|string|meta\.preprocessor|keyword|storage)\b/.test(scopeName),
		),
	);
}

/**
 * Split tokens at the corrected ranges without changing source text or offsets.
 * @param {import('shiki').ThemedToken[]} line
 * @param {{ start: number, end: number, color: string, fontStyle: number }[]} ranges
 */
function restyle(line, ranges) {
	let position = 0;
	return line.flatMap((token) => {
		const start = position;
		position += token.content.length;
		const cuts = [start, position];
		for (const range of ranges) {
			if (range.start > start && range.start < position) cuts.push(range.start);
			if (range.end > start && range.end < position) cuts.push(range.end);
		}
		const points = [...new Set(cuts)].sort((a, b) => a - b);
		return points.slice(0, -1).map((from, index) => {
			const to = points[index + 1];
			const range = ranges.find((r) => r.start <= from && to <= r.end);
			const result = {
				...token,
				content: token.content.slice(from - start, to - start),
				offset: token.offset + from - start,
			};
			if (range) {
				result.color = range.color;
				result.fontStyle = range.fontStyle;
			}
			return result;
		});
	});
}

/** @returns {import('shiki').ShikiTransformer} */
export default function cppInitialization() {
	return {
		name: 'cpp-initialization',
		preprocess(_code, options) {
			if (options.lang === 'cpp' || options.lang === 'c++') {
				options.includeExplanation = true;
			}
		},
		tokens(lines) {
			if (this.options.lang !== 'cpp' && this.options.lang !== 'c++') return;
			// Derive styles from the active theme, rather than duplicating its colors.
			const sample = this.codeToTokens('class ShikiType {}; int shiki_value;', {
				...this.options,
				lang: 'cpp',
				transformers: [],
				includeExplanation: true,
			});
			const type = sample.tokens.flat().find((t) => t.content === 'ShikiType');
			if (!type?.color || !sample.fg) return;

			return lines.map((line) => {
				const source = line.map((t) => t.content).join('');
				const match = declaration.exec(source);
				if (!match?.groups || !match.indices?.groups) return line;
				const { type: name, initializer } = match.groups;
				if (nonTypes.has(name)) return line;
				// `T f()` and `T f(U)` may declare functions. Only expressions whose
				// first token cannot be a parameter type are accepted here.
				if (
					initializer === '(' &&
					!/^\s*(?:[+-]?\s*(?:\d|\.\d)|["']|(?:true|false|nullptr)\b)/.test(
						source.slice(match[0].length),
					)
				)
					return line;
				const [typeStart, typeEnd] = match.indices.groups.type;
				const [variableStart, variableEnd] = match.indices.groups.variable;
				let position = 0;
				const blocked = line.some((token) => {
					const start = position;
					position += token.content.length;
					const overlapsName =
						(start < typeEnd && position > typeStart) ||
						(start < variableEnd && position > variableStart);
					return overlapsName && isProtected(token);
				});
				if (blocked) return line;
				return restyle(line, [
					// Preserve namespace colors and template argument highlighting.
					{
						start: typeEnd - (name.split('::').at(-1) ?? name).length,
						end: typeEnd,
						color: type.color,
						fontStyle: type.fontStyle ?? 0,
					},
					{ start: variableStart, end: variableEnd, color: sample.fg, fontStyle: 0 },
				]);
			});
		},
	};
}

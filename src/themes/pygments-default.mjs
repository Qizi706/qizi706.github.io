/** @type {import('shiki').ThemeRegistrationRaw} */
export const pygmentsDefaultTheme = {
	name: 'pygments-default',
	type: 'light',
	colors: {
		'editor.background': '#00000000',
		'editor.foreground': '#0f172a',
	},
	settings: [
		{
			scope: ['comment', 'punctuation.definition.comment'],
			settings: { foreground: '#408080', fontStyle: 'italic' },
		},
		{
			scope: ['keyword', 'keyword.control', 'keyword.other', 'storage.modifier'],
			settings: { foreground: '#008000', fontStyle: 'bold' },
		},
		{
			scope: ['storage.type'],
			settings: { foreground: '#008000', fontStyle: 'bold' },
		},
		{
			scope: [
				'storage.type.built-in.primitive',
				'storage.type.primitive',
				'support.type.primitive',
			],
			settings: { foreground: '#b00040', fontStyle: '' },
		},
		{
			scope: ['keyword.operator'],
			settings: { foreground: '#666666', fontStyle: '' },
		},
		{
			scope: ['keyword.operator.word', 'keyword.operator.cast'],
			settings: { foreground: '#008000', fontStyle: 'bold' },
		},
		{
			scope: ['constant.numeric'],
			settings: { foreground: '#666666' },
		},
		{
			scope: ['string', 'string.quoted', 'constant.character'],
			settings: { foreground: '#ba2121' },
		},
		{
			scope: ['constant.character.escape'],
			settings: { foreground: '#bb6622', fontStyle: 'bold' },
		},
		{
			scope: ['entity.name.function', 'support.function'],
			settings: { foreground: '#0000ff' },
		},
		{
			scope: ['entity.name.type', 'entity.name.class', 'support.class'],
			settings: { foreground: '#0000ff', fontStyle: 'bold' },
		},
		{
			scope: ['support.function.builtin', 'support.type.builtin', 'constant.language'],
			settings: { foreground: '#008000' },
		},
		{
			scope: [
				'meta.preprocessor',
				'keyword.control.directive',
				'entity.name.function.preprocessor',
			],
			settings: { foreground: '#bc7a00' },
		},
		{
			scope: ['entity.other.attribute-name'],
			settings: { foreground: '#7d9029' },
		},
		{
			scope: ['entity.name.tag'],
			settings: { foreground: '#008000', fontStyle: 'bold' },
		},
		{
			scope: ['string.regexp'],
			settings: { foreground: '#bb6688' },
		},
		{
			scope: ['markup.inserted'],
			settings: { foreground: '#00a000' },
		},
		{
			scope: ['markup.deleted'],
			settings: { foreground: '#a00000' },
		},
		{
			scope: ['invalid', 'invalid.illegal'],
			settings: { foreground: '#ff0000' },
		},
	],
};

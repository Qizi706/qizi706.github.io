// @ts-check

import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import rehypeCallouts from './src/plugins/rehype-callouts.mjs';
import rehypeMermaid from './src/plugins/rehype-mermaid.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://qizi706.github.io',
	integrations: [mdx(), sitemap()],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex, rehypeCallouts, rehypeMermaid],
		}),
		syntaxHighlight: {
			type: 'shiki',
			excludeLangs: ['math', 'mermaid'],
		},
	},
	fonts: [
		{
			provider: fontProviders.fontsource(),
			name: 'Merienda One',
			cssVariable: '--font-merienda',
			weights: [400],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['Arial', 'Helvetica', 'sans-serif'],
			optimizedFallbacks: false,
		},
	],
});

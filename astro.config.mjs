// @ts-check

import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import kvCacheLab from './labs/kv-cache-batch/lab.json';
import rehypeCallouts from './src/plugins/rehype-callouts.mjs';
import { legacyPostRedirects } from './src/legacy-post-redirects.mjs';
import { pygmentsDefaultTheme } from './src/themes/pygments-default.mjs';

/** @param {string} pathname */
const normalizePathname = (pathname) => pathname.replace(/\/$/, '');
const phase2Preview = kvCacheLab.progress.preview;
const unlistedPathnames = new Set([phase2Preview.path].map(normalizePathname));

// https://astro.build/config
export default defineConfig({
	site: 'https://zqwiki.cn',
	trailingSlash: 'ignore',
	redirects: legacyPostRedirects,
	integrations: [
		mdx(),
		sitemap({
			filter: (page) => {
				const pathname = new URL(page).pathname;
				return (
					!Object.hasOwn(legacyPostRedirects, pathname) &&
					!unlistedPathnames.has(normalizePathname(pathname))
				);
			},
		}),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex, rehypeCallouts],
		}),
		syntaxHighlight: {
			type: 'shiki',
			excludeLangs: ['math'],
		},
		shikiConfig: {
			theme: pygmentsDefaultTheme,
			langAlias: { nasm: 'asm' },
			wrap: false,
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

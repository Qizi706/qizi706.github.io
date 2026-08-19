// @ts-check

import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import rehypeCallouts from './src/plugins/rehype-callouts.mjs';
import { legacyPostRedirects } from './src/legacy-post-redirects.mjs';
import { pygmentsDefaultTheme } from './src/themes/pygments-default.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://zqwiki.cn',
  trailingSlash: 'always',
  redirects: legacyPostRedirects,
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !Object.hasOwn(legacyPostRedirects, new URL(page).pathname),
    }),
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex, rehypeCallouts],
    }),
    syntaxHighlight: {
      type: 'shiki',
      excludeLangs: ['math', 'mermaid'],
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

import type { CollectionEntry } from 'astro:content';

type BlogPost = Pick<CollectionEntry<'blog'>, 'id' | 'data'>;

export function getPostUrl(post: BlogPost): string {
	return `/blog/${post.id}/`;
}

export function getCategorySlug(category: string): string {
	return (
		category
			.normalize('NFKC')
			.trim()
			.toLocaleLowerCase('en-US')
			.replace(/\+/g, '-plus')
			.replace(/&/g, '-and-')
			.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || 'uncategorized'
	);
}

export function getCategoryUrl(category: string): string {
	return `/category/${getCategorySlug(category)}/`;
}

export function getPrimaryCategorySlug(post: BlogPost): string {
	return getCategorySlug(post.data.categories[0] ?? 'uncategorized');
}

function createLegacyPostRedirects(category, slugs) {
	return Object.fromEntries(
		slugs.map((slug) => [`/${category}/${slug}/`, { status: 301, destination: `/blog/${slug}/` }]),
	);
}

export const legacyPostRedirects = {
	...createLegacyPostRedirects('mit-courses', [
		'6-s081-lab1',
		'6-s081-lab2',
		'6-s081-lab3',
		'6-s081-lab4',
		'6-s081-lab5',
		'6-s081-lab6',
		'6-s081-lab7',
		'6-s081-lab8',
		'6-s081-lab9',
	]),
	...createLegacyPostRedirects('c-c-plus-plus', [
		'cast',
		'cpp-build-tools',
		'perfect-forwarding',
		'thread',
	]),
	...createLegacyPostRedirects('随笔', ['conjecture-verification-practice']),
	...createLegacyPostRedirects('分布式', [
		'distributed-basis',
		'distributed-foundation-cache-migration-eviction',
		'distributed-foundation-failure-handling',
		'distributed-foundation-os-network-concurrency-storage',
		'distributed-foundation-replication-consistency',
		'distributed-foundation-rpc-remote-call',
		'distributed-foundation-scheduling-load-balancing',
		'distributed-foundation-state-machine-sharding-metadata',
	]),
	...createLegacyPostRedirects('计算机基础', ['https']),
};

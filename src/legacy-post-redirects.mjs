function createLegacyPostRedirects(category, slugs) {
	return Object.fromEntries(
		slugs.map((slug) => [`/${category}/${slug}/`, { status: 301, destination: `/blog/${slug}/` }]),
	);
}

function createLabArtifactRedirects(labName, movedArtifacts) {
	return Object.fromEntries(
		Object.entries(movedArtifacts).flatMap(([oldPath, newPath]) => [
			[`/labs/${labName}/${oldPath}`, `/labs/${labName}/${newPath}`],
			[`/labs/${labName}/view/${oldPath}/`, `/labs/${labName}/view/${newPath}/`],
		]),
	);
}

export const legacyPostRedirects = {
	'/labs/llm-inference-request-lifecycle/': '/labs/serving-baseline/',
	'/labs/llm-inference-request-lifecycle/view/[...path]': '/labs/serving-baseline/view/[...path]',
	'/labs/llm-inference-request-lifecycle/[...path]': '/labs/serving-baseline/view/[...path]',
	'/labs/attention-kv-caceh/': '/labs/kv-cache-batch/',
	'/labs/attention-kv-caceh/view/src/attention_kv_caceh/__init__.py/':
		'/labs/kv-cache-batch/view/src/kv_cache_batch/__init__.py/',
	'/labs/attention-kv-caceh/view/src/attention_kv_caceh/attention.py/':
		'/labs/kv-cache-batch/view/src/kv_cache_batch/attention.py/',
	'/labs/attention-kv-caceh/view/src/attention_kv_caceh/benchmark.py/':
		'/labs/kv-cache-batch/view/src/kv_cache_batch/benchmark.py/',
	'/labs/attention-kv-caceh/src/attention_kv_caceh/__init__.py/':
		'/labs/kv-cache-batch/view/src/kv_cache_batch/__init__.py/',
	'/labs/attention-kv-caceh/src/attention_kv_caceh/attention.py/':
		'/labs/kv-cache-batch/view/src/kv_cache_batch/attention.py/',
	'/labs/attention-kv-caceh/src/attention_kv_caceh/benchmark.py/':
		'/labs/kv-cache-batch/view/src/kv_cache_batch/benchmark.py/',
	'/labs/attention-kv-caceh/view/[...path]': '/labs/kv-cache-batch/view/[...path]',
	'/labs/attention-kv-caceh/[...path]': '/labs/kv-cache-batch/view/[...path]',
	...createLabArtifactRedirects('serving-baseline', {
		'benchmark_lengths.py': 'scripts/benchmark_ollama_input_length.py',
		'vllm-metal-install.sh': 'scripts/install_vllm_metal.sh',
		'length-results-v1.csv': 'results/ollama_length_scan_v1.csv',
		'input-length-results-v2.csv': 'results/ollama_input_length_scan_v2.csv',
		'vllm-metal-install.log': 'logs/vllm_metal_install.log',
		'vllm-server.log': 'logs/vllm_metal_server.log',
		'vllm-response.json': 'responses/vllm_chat_completion.json',
	}),
	...createLabArtifactRedirects('kv-cache-batch', {
		'LEARNING_PLAN.md': 'docs/LEARNING_PLAN.md',
		'src/numpy_semantics.py': 'examples/numpy_array_semantics.py',
		'src/kv_cache_batch/summarize.py': 'src/kv_cache_batch/summarize_batch_size.py',
		'tests/test_summarize.py': 'tests/test_summarize_batch_size.py',
		'results/benchmark.csv': 'results/batch-length-scan/raw.csv',
		'results/m1-batch-size/raw.csv': 'results/batch-size-scan/raw.csv',
		'results/m1-batch-size/summary.csv': 'results/batch-size-scan/summary.csv',
		'results/m1-batch-size/latency.svg': 'results/batch-size-scan/batch-latency-percentiles.svg',
		'results/m1-batch-size/throughput.svg': 'results/batch-size-scan/positions-throughput.svg',
		'results/m1-batch-size/conclusion.md': 'results/batch-size-scan/knee-analysis.md',
	}),
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

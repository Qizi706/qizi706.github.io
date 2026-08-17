export const kvCacheBatchBasePath = '/labs/kv-cache-batch/';

export const kvCacheBatchArtifacts = [
	{
		path: 'README.md',
		modified: '18-Aug-2026 02:34',
		size: 11373,
	},
	{
		path: 'docs/LEARNING_PLAN.md',
		modified: '18-Aug-2026 02:34',
		size: 29461,
	},
	{
		path: 'examples/numpy_array_semantics.py',
		modified: '18-Aug-2026 00:12',
		size: 783,
	},
	{
		path: 'pyproject.toml',
		modified: '18-Aug-2026 02:18',
		size: 630,
	},
	{
		path: 'uv.lock',
		modified: '18-Aug-2026 02:06',
		size: 66874,
	},
	{
		path: 'src/kv_cache_batch/__init__.py',
		modified: '17-Aug-2026 23:29',
		size: 162,
	},
	{
		path: 'src/kv_cache_batch/attention.py',
		modified: '18-Aug-2026 00:50',
		size: 5418,
	},
	{
		path: 'src/kv_cache_batch/benchmark.py',
		modified: '18-Aug-2026 02:10',
		size: 11304,
	},
	{
		path: 'src/kv_cache_batch/summarize_batch_size.py',
		modified: '18-Aug-2026 02:33',
		size: 14496,
	},
	{
		path: 'tests/test_attention.py',
		modified: '18-Aug-2026 02:10',
		size: 4924,
	},
	{
		path: 'tests/test_summarize_batch_size.py',
		modified: '18-Aug-2026 02:33',
		size: 2127,
	},
	{
		path: 'results/batch-length-scan/raw.csv',
		modified: '18-Aug-2026 02:14',
		size: 13742,
	},
	{
		path: 'results/batch-size-scan/raw.csv',
		modified: '18-Aug-2026 02:11',
		size: 10700,
	},
	{
		path: 'results/batch-size-scan/summary.csv',
		modified: '18-Aug-2026 02:38',
		size: 357,
	},
	{
		path: 'results/batch-size-scan/batch-latency-percentiles.svg',
		modified: '18-Aug-2026 02:38',
		size: 37934,
	},
	{
		path: 'results/batch-size-scan/positions-throughput.svg',
		modified: '18-Aug-2026 02:38',
		size: 32136,
	},
	{
		path: 'results/batch-size-scan/knee-analysis.md',
		modified: '18-Aug-2026 02:38',
		size: 1048,
	},
] as const;

export type KvCacheBatchArtifact = (typeof kvCacheBatchArtifacts)[number];

export function encodeKvCacheBatchArtifactPath(artifactPath: string): string {
	return artifactPath.split('/').map(encodeURIComponent).join('/');
}

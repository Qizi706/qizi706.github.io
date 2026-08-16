export const phase2LabBasePath = '/labs/attention-kv-caceh/';

export const phase2LabArtifacts = [
	{
		path: 'README.md',
		modified: '17-Aug-2026 01:02',
		size: 7497,
	},
	{
		path: 'pyproject.toml',
		modified: '17-Aug-2026 00:57',
		size: 496,
	},
	{
		path: 'uv.lock',
		modified: '16-Aug-2026 15:14',
		size: 14177,
	},
	{
		path: 'src/attention_kv_caceh/__init__.py',
		modified: '17-Aug-2026 00:57',
		size: 166,
	},
	{
		path: 'src/attention_kv_caceh/attention.py',
		modified: '17-Aug-2026 00:57',
		size: 5102,
	},
	{
		path: 'src/attention_kv_caceh/benchmark.py',
		modified: '17-Aug-2026 00:57',
		size: 6926,
	},
	{
		path: 'tests/test_attention.py',
		modified: '17-Aug-2026 00:57',
		size: 2550,
	},
	{
		path: 'results/benchmark.csv',
		modified: '17-Aug-2026 00:58',
		size: 34967,
	},
] as const;

export type Phase2LabArtifact = (typeof phase2LabArtifacts)[number];

export function encodePhase2ArtifactPath(artifactPath: string): string {
	return artifactPath.split('/').map(encodeURIComponent).join('/');
}

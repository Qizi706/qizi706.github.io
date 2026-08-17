export const servingBaselineBasePath = '/labs/serving-baseline/';

export const servingBaselineArtifacts = [
	{
		path: 'README.md',
		modified: '18-Aug-2026 02:34',
		size: 2270,
	},
	{
		path: 'scripts/benchmark_ollama_input_length.py',
		modified: '18-Aug-2026 02:33',
		size: 4602,
	},
	{
		path: 'scripts/install_vllm_metal.sh',
		modified: '18-Aug-2026 02:39',
		size: 6059,
	},
	{
		path: 'results/ollama_length_scan_v1.csv',
		modified: '11-Aug-2026 14:55',
		size: 2752,
	},
	{
		path: 'results/ollama_input_length_scan_v2.csv',
		modified: '11-Aug-2026 15:06',
		size: 1486,
	},
	{
		path: 'logs/vllm_metal_install.log',
		modified: '11-Aug-2026 15:19',
		size: 4007,
	},
	{
		path: 'logs/vllm_metal_server.log',
		modified: '11-Aug-2026 15:45',
		size: 15514,
	},
	{
		path: 'responses/vllm_chat_completion.json',
		modified: '11-Aug-2026 15:45',
		size: 868,
	},
] as const;

export type ServingBaselineArtifact = (typeof servingBaselineArtifacts)[number];

export function encodeServingBaselineArtifactPath(artifactPath: string): string {
	return artifactPath.split('/').map(encodeURIComponent).join('/');
}

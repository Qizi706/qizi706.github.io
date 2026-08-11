export const phase1LabBasePath = '/labs/llm-inference-request-lifecycle/';

export const phase1LabArtifacts = [
	{
		name: 'README.md',
		modified: '11-Aug-2026 18:30',
		size: 1403,
	},
	{
		name: 'benchmark_lengths.py',
		modified: '11-Aug-2026 15:06',
		size: 4474,
	},
	{
		name: 'input-length-results-v2.csv',
		modified: '11-Aug-2026 15:06',
		size: 1486,
	},
	{
		name: 'length-results-v1.csv',
		modified: '11-Aug-2026 14:55',
		size: 2752,
	},
	{
		name: 'vllm-metal-install.sh',
		modified: '11-Aug-2026 15:19',
		size: 6040,
	},
	{
		name: 'vllm-metal-install.log',
		modified: '11-Aug-2026 15:19',
		size: 4007,
	},
	{
		name: 'vllm-response.json',
		modified: '11-Aug-2026 15:45',
		size: 868,
	},
	{
		name: 'vllm-server.log',
		modified: '11-Aug-2026 15:45',
		size: 15514,
	},
] as const;

export type Phase1LabArtifact = (typeof phase1LabArtifacts)[number];

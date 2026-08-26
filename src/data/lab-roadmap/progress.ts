import { phase2 } from './phase-2';

const activeParts = phase2.units.flatMap((unit) =>
	(unit.parts ?? []).filter((part) => part.status === 'active'),
);

if (activeParts.length !== 1) {
	throw new Error(`Phase 2 must have exactly one active Lab task; found ${activeParts.length}.`);
}

const orderedParts = phase2.units.flatMap((unit) => unit.parts ?? []);
const activePart = activeParts[0];
const activePartIndex = orderedParts.findIndex((part) => part.id === activePart.id);
const nextPart = orderedParts[activePartIndex + 1];

if (!nextPart) throw new Error(`No next Lab task follows ${activePart.id}.`);

const taskDetails = {
	'M2-B': {
		period: '2026.08.25 · 120 min',
		objective:
			'在 H_q=H_kv 条件下，让每个 Batch、每个 Head 独立完成 Scaled Dot-Product Causal Attention，并用独立 Oracle 证明 Score 轴、Mask、Softmax 轴和输出元素都正确。',
		question:
			'给定 Q/K/V=[B,H,T,D_head]，怎样证明批量矩阵乘法没有混合 Batch 或 Head，并且每个位置只能对历史 Token 归一化？',
		prediction:
			'固定 B=2、H=3、T=4、D_head=5 时，Score/Weight=[2,3,4,4]、逐 Head 输出=[2,3,4,5]；修改未来 Token、其他 Head 或其他 Batch 不应污染目标位置。',
		preRead: [
			{
				label: 'Harvard · Scaled Dot-Product Attention',
				href: 'https://nlp.seas.harvard.edu/annotated-transformer/',
				focus: '只看缩放原因、Mask 位置、Softmax 轴和 MHA 第 2 步。',
			},
			{
				label: 'NumPy · matmul',
				href: 'https://numpy.org/doc/stable/reference/generated/numpy.matmul.html',
				focus: '只看 stacks of matrices 的最后两轴规则。',
			},
			{
				label: 'NumPy · triu',
				href: 'https://numpy.org/doc/stable/reference/generated/numpy.triu.html',
				focus: '只看 k=1 如何选择严格未来位置。',
			},
		],
		artifact:
			'multi_head_attention.py、test_multi_head_attention.py，以及 M2-B 工作表中的 Shape 推导、独立标量 Oracle、首次失败和闭卷解释。',
		acceptance:
			'Score、Weight 与逐 Head 输出 Shape 正确；至少两个非零坐标匹配独立标量 Oracle；因果性、Batch/Head 隔离、输入契约与完整回归全部通过；关闭代码后能解释缩放与 Softmax 轴。',
		steps: [
			'10 min：关闭实现，填写 Q@K^T、Mask、Softmax 与 Output 的 Shape/轴预测。',
			'15 min：只读 Annotated Transformer、matmul 与 triu 的指定段落，各留一句确认或修正。',
			'30 min：先写独立标量 Oracle、Future Token、Head/Batch 隔离和非法 Shape 测试，保存第一次失败。',
			'30 min：实现无 Cache MHA 核心，只返回逐 Head Output 与 Weight，不合并 Head。',
			'15 min：只依据失败信息修正 Score、Mask 或 Softmax Axis。',
			'10 min：运行 M2-B 定向测试与完整回归测试。',
			'10 min：关闭代码重做坐标推导，并解释为什么除以 sqrt(D_head)。',
		],
		nextDecision:
			'M2-B 全部门禁通过后进入 M2-C Cached MHA；任一项失败就继续修正 B，不提前实现 Cache、GQA Head 映射或 Output Projection。',
		document: 'checkoffs/m2-b-causal-attention.md',
		assignment: 'assignments/m2-b-causal-attention.md',
	},
} as const;

const currentDetails = taskDetails[activePart.id as keyof typeof taskDetails];

if (!currentDetails) {
	throw new Error(`Missing task details for active Lab task ${activePart.id}.`);
}

export const phase2Progress = {
	milestone: {
		period: phase2.period,
		title: `阶段 2 · ${phase2.title}`,
		goal: phase2.goal,
		coreRoute: 'P0 → M0 → M1 → M2 → S0 → S1 → S2 → S3 → S4 → F0',
		finalArtifact: '《vLLM 推理性能实验：并发、Batch Size 与输入长度如何影响吞吐和延迟》',
	},
	completed: [
		{
			id: 'M0',
			period: '2026.08.12 — 2026.08.18',
			title: 'KV Cache、预分配与固定 Batch 机制闭环',
			summary:
				'No Cache、Dynamic Cache、Preallocated Cache 与固定 B=2 Batched Decode 均通过 Oracle，并保存 300 条 Length Scan 样本。',
		},
		{
			id: 'P0',
			period: '2026.08.19',
			title: 'NumPy View/Copy 与轴语义闭环',
			summary:
				'六个 Case 均保留预测、观察、判定与断言；能够区分 Binding、View、Copy、Stride 与 Buffer 分配。',
			featured: true,
		},
		{
			id: 'M1',
			period: '2026.08.20',
			title: 'Batch Size 曲线',
			summary: 'B=1/2/4/8 均通过正确性检查，保存 240 条原始样本并得到 Knee=B=8。',
		},
		{
			id: 'M2-A1',
			period: '2026.08.20 · 120 min',
			title: '只完成 Query Head 轴变换',
			summary:
				'split_heads 已通过 Shape、非零坐标元素映射和内存共享三项测试；完整 9 项回归测试通过。',
			featured: true,
		},
		{
			id: 'M2-A2',
			period: '2026.08.22 — 2026.08.25',
			title: 'Q/K/V 投影与输入契约',
			summary:
				'project_qkv 已通过 Shape、两个非零坐标 Oracle 和五类非法配置测试；A2 定向 6 项与完整 12 项回归测试通过，并完成闭卷 Shape 推导。',
			featured: true,
		},
	],
	current: { ...activePart, ...currentDetails },
	next: { id: nextPart.id, title: nextPart.title },
	evidence: {
		tests: 12,
		rawSamples: 540,
		summary:
			'A2 projection contracts · 300 length-scan + 240 batch-size samples · rebuildable aggregates · two figures · Knee analysis',
	},
} as const;

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
	'M2-C': {
		period: '2026.09.01 · 120 min',
		objective:
			'在 H_q=H_kv 条件下逐 Token 追加 K/V Cache，并证明每一步 Cached Output 都与 M2-B Full-Recompute Oracle 的当前位置数值等价。',
		question:
			'给定当前 Q/K/V=[B,H,1,D_head] 与历史 Cache，怎样证明追加后的 Cache、Weight 和 Output 只包含可见前缀，并且没有混合 Batch 或 Head？',
		prediction:
			'固定 B=2、H=3、T=4、D_head=5 时，第 t 步 Cache=[2,3,t+1,5]、Weight=[2,3,1,t+1]、Output=[2,3,1,5]；逐步输出应等于完整前缀重算的最后一个位置。',
		preRead: [
			{
				label: 'Hugging Face · Caching',
				href: 'https://huggingface.co/docs/transformers/main/cache_explanation',
				focus: '只看 Cache update、Attention mask 与逐 Token Shape。',
			},
		],
		artifact:
			'multi_head_attention.py、Cached MHA 定向测试，以及 M2-C 工作表中的逐步 Shape、首次失败、等价性证据和闭卷解释。',
		acceptance:
			'每一步 Cached Output 与完整前缀重算的最后位置数值等价；Cache/Weight/Output Shape、前缀内容、Batch/Head 隔离、输入契约与 M2-B 回归全部通过。',
		steps: [
			'10 min：关闭实现，填写第 t 步输入、Cache、Weight 与 Output Shape。',
			'15 min：只读 Hugging Face Caching 的指定段落，记录它确认或修正了哪条预测。',
			'30 min：先写逐位置 Full-Recompute 对照、Cache 内容、隔离性和非法输入测试，保存第一次失败。',
			'30 min：实现单步 K/V 追加与当前 Query 对完整 Cache 的 Attention。',
			'15 min：只依据失败信息修正 Token Axis、Cache 更新或返回顺序。',
			'10 min：运行 M2-C 定向测试与 M2-B 完整回归测试。',
			'10 min：关闭代码解释为什么单步 Decode 不需要显式 Causal Mask，以及 Cache 为什么只追加 K/V。',
		],
		nextDecision:
			'M2-C 全部门禁通过后进入 M2-D GQA Head 映射；任一项失败就继续修正 Cache 语义，不提前实现 GQA、Head 合并或 Output Projection。',
		document: 'checkoffs/m2-c-cached-mha.md',
		assignment: 'assignments/m2-c-cached-mha.md',
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
		{
			id: 'M2-B',
			period: '2026.08.25 — 2026.09.01',
			title: '无 Cache Multi-Head Causal Attention',
			summary:
				'Score、Causal Mask、稳定 Softmax、逐 Head Output、Future Token 与 Batch/Head 隔离全部通过；定向评分 60/60，整份作业 100/100，私人仓库 16 项回归通过。',
			featured: true,
		},
	],
	current: { ...activePart, ...currentDetails },
	next: { id: nextPart.id, title: nextPart.title },
	evidence: {
		tests: 16,
		rawSamples: 540,
		summary:
			'M2-B causal-attention Oracle and isolation · 300 length-scan + 240 batch-size samples · rebuildable aggregates · two figures · Knee analysis',
	},
} as const;

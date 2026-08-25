export type CourseStatus = 'done' | 'active' | 'pending' | 'optional';

export interface CoursePart {
	id: string;
	title: string;
	status: CourseStatus;
	checkoff: string;
}

export interface CourseUnit {
	id: string;
	title: string;
	status: CourseStatus;
	duration: string;
	dependsOn: string;
	question: string;
	work: string;
	artifact: string;
	acceptance: string;
	unlocks: string;
	href?: string;
	parts?: CoursePart[];
}

export interface CoursePhase {
	id: 'phase-1' | 'phase-2';
	number: string;
	title: string;
	shortTitle: string;
	status: 'done' | 'active';
	period: string;
	goal: string;
	entryCheck: string;
	completion: string;
	path: string;
	units: CourseUnit[];
}

export const phase1: CoursePhase = {
	id: 'phase-1',
	number: '01',
	title: 'LLM Serving 请求链路与可复现基线',
	shortTitle: '从模型调用到可测量的服务',
	status: 'done',
	period: '2026.07.27 — 2026.08.11',
	goal: '先观察一个真实的单机推理服务，建立请求链路、阶段划分、指标口径和实验边界，再进入机制实现。',
	entryCheck:
		'能够使用终端、Git 和 Python 脚本；理解进程、HTTP 请求和基本矩阵乘法。暂时不要求理解 vLLM 调度器或 Attention 内核。',
	completion:
		'能够闭卷画出请求链路，独立启动服务、复跑长度扫描，并用环境、负载、指标和原始证据限定结论。',
	path: '/learning/phase-1/',
	units: [
		{
			id: 'P1-L0',
			title: '区分模型、推理与 Serving',
			status: 'done',
			duration: '45–60 min',
			dependsOn: '课程入口检查',
			question: '为什么“能生成文本的模型”还不是“可以稳定接收请求的服务”？',
			work: '比较训练、离线推理和在线 Serving 的输入、状态与系统目标；画出 API、引擎和资源三层边界。',
			artifact: '一张三层系统图，以及每层各一句职责说明。',
			acceptance: '不看文章解释模型权重、推理引擎和 API Server 为什么不能混为一谈。',
			unlocks: 'P1-L1 请求全链路',
			href: '/blog/llm-inference-request-lifecycle/',
		},
		{
			id: 'P1-L1',
			title: '追踪一条请求的完整生命周期',
			status: 'done',
			duration: '90–120 min',
			dependsOn: 'P1-L0',
			question: 'Prompt 从 HTTP 输入到流式 Token 返回，中间依次发生什么？',
			work: '按 API → Chat Template → Tokenizer → Scheduler → Prefill → KV Cache → Decode → Streaming 追踪状态变化。',
			artifact: '请求链路图、Prefill/Decode 对照表和 KV Cache 状态说明。',
			acceptance: '能指出每个阶段的输入、输出、持久状态和可能等待的位置。',
			unlocks: 'P1-L2 本地服务 Bring-up',
			href: '/blog/llm-inference-request-lifecycle/',
		},
		{
			id: 'P1-L2',
			title: '启动本地推理服务并冻结环境',
			status: 'done',
			duration: '90–120 min',
			dependsOn: 'P1-L1',
			question: '怎样证明请求确实经过了预期 Runtime、模型和 Backend？',
			work: '启动 Ollama 与 vLLM Metal，保存安装/启动日志、完整命令和一份 OpenAI-compatible 响应。',
			artifact: '安装脚本、服务日志、环境说明和原始 JSON 响应。',
			acceptance: '从干净终端复现服务，并从日志中定位模型、Backend、KV Cache 预算和端点。',
			unlocks: 'P1-L3 测量契约',
			href: '/labs/serving-baseline/read/README/',
		},
		{
			id: 'P1-L3',
			title: '建立可信的测量契约',
			status: 'done',
			duration: '60–90 min',
			dependsOn: 'P1-L2',
			question: '怎样避免把一次请求的偶然耗时写成系统结论？',
			work: '冻结模型、Prompt、输出长度、Warmup、重复次数与计时边界；区分近似 TPOT、严格 ITL、TTFT 和 E2E。',
			artifact: '可重复运行的 Benchmark 脚本与实验契约。',
			acceptance: '每个结果都能回答环境、负载、控制变量、统计口径和原始数据位置。',
			unlocks: 'P1-L4 Length Scan',
			href: '/labs/serving-baseline/scripts/benchmark_ollama_input_length.py',
		},
		{
			id: 'P1-L4',
			title: '执行 Input / Output Length Scan',
			status: 'done',
			duration: '2 × 120 min',
			dependsOn: 'P1-L3',
			question: '输入长度和输出长度分别怎样影响 Prefill、Decode 与端到端耗时？',
			work: '先写趋势预测，再一次只改变一个长度变量；运行 Warmup 和重复测量，保存 CSV，并解释异常与 Backend 边界。',
			artifact: '两版长度扫描 CSV、实验文章和可追溯到脚本的结论。',
			acceptance: '能从原始 CSV 重建结论，并明确哪些指标只是 Runtime 提供的近似值。',
			unlocks: 'P1-F 阶段验收',
			href: '/blog/llm-inference-request-lifecycle-practice/',
		},
		{
			id: 'P1-F',
			title: 'Phase 1 Checkoff',
			status: 'done',
			duration: '45–60 min',
			dependsOn: 'P1-L0 — P1-L4',
			question: '是否已经拥有进入机制实现所需的系统模型和证据纪律？',
			work: '闭卷重画请求链路；复跑一个扫描点；从日志、响应、脚本和 CSV 各解释一条证据；列出尚未验证的并发与尾延迟结论。',
			artifact: '两篇阶段文章与完整 serving-baseline 复现包。',
			acceptance: '链路解释、复跑和证据边界三项同时通过；只完成阅读不算通过。',
			unlocks: 'Phase 2 · P0 NumPy 语义热身',
			href: '/learning/phase-1/#checkoff',
		},
	],
};

export const phase2: CoursePhase = {
	id: 'phase-2',
	number: '02',
	title: '推理机制、调度与 vLLM 性能工程',
	shortTitle: '从最小 Oracle 到真实 Serving 因果链',
	status: 'active',
	period: '2026.08.12 — 2026.09.12',
	goal: '先在 NumPy 中建立可证明正确的 Attention/KV Cache Oracle，再把同一组问题迁移到真实 vLLM 的容量、调度、吞吐和延迟实验。',
	entryCheck:
		'Phase 1 Checkoff 通过；能解释 Prefill、Decode、KV Cache、TTFT/TPOT/E2E，并能保留脚本、环境与原始结果。',
	completion:
		'完成 P0、M0–M2、S0–S4 与 F0：正确性测试通过、原始数据可重建、客户端和服务端证据能够共同支持最终结论。',
	path: '/learning/phase-2/',
	units: [
		{
			id: 'P0',
			title: 'Python / NumPy Buffer 与轴语义',
			status: 'done',
			duration: '60–90 min',
			dependsOn: 'Phase 1 Checkoff',
			question: 'View、Copy、Stride、Broadcasting 与矩阵轴怎样影响正确性和测量？',
			work: '对 Binding、浅复制、基础切片、Advanced Indexing、swapaxes 和 concatenate 先预测再运行。',
			artifact: '六个可执行小实验、断言与预测/观察记录。',
			acceptance: '能从 Buffer + Shape + Stride 解释六个 Case，并映射回 Attention 热路径。',
			unlocks: 'M0 单 Head KV Cache',
			href: '/labs/kv-cache-batch/read/docs/gates/P0/',
		},
		{
			id: 'M0',
			title: '单 Head Attention、KV Cache 与预分配',
			status: 'done',
			duration: '3 × 120 min',
			dependsOn: 'P0',
			question: 'KV Cache 复用了什么计算，动态追加又引入了什么数据移动？',
			work: '依次实现 Full Recompute、Dynamic Cache、Preallocated Cache 和固定 B=2 Batched Decode；先做 Oracle，再计时。',
			artifact: '正确性测试、三条 Cache 路径和 300 条 Batch Length Scan 样本。',
			acceptance:
				'所有位置与 Full Recompute 数值等价，Cache Shape 正确，性能结论不越过 CPU/NumPy 边界。',
			unlocks: 'M1 Batch Size 曲线',
			href: '/labs/kv-cache-batch/results/batch-length-scan/',
		},
		{
			id: 'M1',
			title: 'Batch Size 曲线与收益收窄',
			status: 'done',
			duration: '3 × 90–150 min',
			dependsOn: 'M0',
			question: '固定长度时，Batch Wall Time、摊销成本和 Positions/s 怎样变化？',
			work: '验证 B=1/2/4/8 的独立性，随机化运行顺序，保留 240 条样本，从 Raw CSV 重建 P50/P95 和 Knee。',
			artifact: '原始 CSV、汇总、两张曲线和 Knee 分析。',
			acceptance: '正确性先于计时；曲线完全由原始数据生成；能区分摊销成本与请求延迟。',
			unlocks: 'M2 Multi-Head / GQA',
			href: '/labs/kv-cache-batch/read/docs/gates/M1/',
		},
		{
			id: 'M2',
			title: '从 Head 轴到 Cached MHA / GQA 容量',
			status: 'active',
			duration: '6 × 120 min',
			dependsOn: 'M1',
			question: '怎样证明 Batch、Query Head、KV Head、Token 与 D_head 的轴语义及状态隔离？',
			work: '按 A1 → A2 → B → C → D → E 推进；每次只增加一个可被独立 Oracle 否证的变换。',
			artifact: 'multi_head.py、独立测试、M2 工作表与 MHA/GQA KV 容量表。',
			acceptance:
				'Full Recompute 与 Cached Decode 等价，GQA 映射和容量公式通过测试，闭卷完成 Shape 推导。',
			unlocks: 'S0 冻结真实 vLLM 环境',
			href: '/labs/kv-cache-batch/read/docs/gates/M2/',
			parts: [
				{
					id: 'M2-A1',
					title: '拆分 Head 轴',
					status: 'done',
					checkoff: 'Shape、非零坐标映射、共享 Buffer',
				},
				{
					id: 'M2-A2',
					title: 'Q/K/V 投影契约',
					status: 'done',
					checkoff: '投影 Shape、标量 Oracle、非法配置',
				},
				{
					id: 'M2-B',
					title: '无 Cache MHA Oracle',
					status: 'active',
					checkoff: 'Score、Mask、Softmax、Output、隔离性',
				},
				{
					id: 'M2-C',
					title: 'Cached MHA',
					status: 'pending',
					checkoff: '逐位置等价与 Cache Shape',
				},
				{
					id: 'M2-D',
					title: 'GQA Head 映射',
					status: 'pending',
					checkoff: 'Query → KV Head 映射与非法配置',
				},
				{
					id: 'M2-E',
					title: 'KV 容量公式',
					status: 'pending',
					checkoff: '公式字节数与 nbytes 精确一致',
				},
			],
		},
		{
			id: 'S0',
			title: '冻结真实 vLLM 环境与可观测性',
			status: 'pending',
			duration: '1–2 × 120 min',
			dependsOn: 'M2',
			question: '当前 Backend 实际支持哪些配置、指标和端点？',
			work: '重新记录硬件、OS、Python、vLLM/插件/模型版本、启动命令、帮助输出和 Capability Matrix。',
			artifact: '不可变环境快照、端点样本与能力矩阵。',
			acceptance: '任何后续结果都能回指同一环境；不沿用 Phase 1 的旧快照。',
			unlocks: 'S1 单并发稳态基线',
			href: '/labs/kv-cache-batch/read/docs/PLAN/#gate-s0冻结真实-vllm-环境',
		},
		{
			id: 'S1',
			title: '单并发稳态与显存基线',
			status: 'pending',
			duration: '2 × 120 min',
			dependsOn: 'S0',
			question: '没有排队竞争时，系统的 TTFT、TPOT、吞吐和显存基线是什么？',
			work: '固定单一负载，Warmup 后独立运行三轮，同时保存客户端指标和服务端内存/KV 指标。',
			artifact: '三轮 Raw 结果、稳定性检查与显存组成表。',
			acceptance: 'P50/P95/P99 可重建；轮间差异可解释；客户端与服务端时间口径不混淆。',
			unlocks: 'S2 Input Length',
			href: '/labs/kv-cache-batch/read/docs/PLAN/#gate-s1单并发稳态基线',
		},
		{
			id: 'S2',
			title: '真实 Serving Input Length Scan',
			status: 'pending',
			duration: '2 × 120 min',
			dependsOn: 'S1',
			question: 'Prompt 变长时，Prefill 工作、KV 状态和用户延迟怎样共同变化？',
			work: '固定输出长度与并发，只扫描输入长度；同步记录 TTFT、TPOT、E2E、吞吐、KV 使用与显存。',
			artifact: '输入长度曲线、Raw 样本和异常点复测。',
			acceptance: '只对测量范围内趋势下结论，并用状态量或服务端指标排除竞争解释。',
			unlocks: 'S3 Client Concurrency',
			href: '/labs/kv-cache-batch/read/docs/PLAN/#gate-s2input-length',
		},
		{
			id: 'S3',
			title: 'Client Concurrency 与饱和点',
			status: 'pending',
			duration: '2–3 × 120 min',
			dependsOn: 'S2',
			question: '并发增加到哪里开始只增加排队和尾延迟，而不再增加有效吞吐？',
			work: '固定请求 Shape 和服务端配置，扫描客户端并发；记录实际运行/等待请求、吞吐和延迟分位数。',
			artifact: '吞吐—延迟曲线、饱和点和服务端状态对照。',
			acceptance: '区分 Client Concurrency、Active Sequences 和实际 Scheduler Batch。',
			unlocks: 'S4 Scheduler Budget',
			href: '/labs/kv-cache-batch/read/docs/PLAN/#gate-s3client-concurrency',
		},
		{
			id: 'S4',
			title: 'Scheduler Budget 单变量对照',
			status: 'pending',
			duration: '2–3 × 120 min',
			dependsOn: 'S3',
			question: '序列上限和 Token Budget 分别怎样改变实际调度批量与吞吐—延迟权衡？',
			work: '先只扫描 max_num_seqs，恢复后再只扫描 max_num_batched_tokens；每轮同时保留客户端和 Scheduler 证据。',
			artifact: '两组单变量扫描、实际批量对照和配置边界表。',
			acceptance: '不能仅凭客户端相关性声称 Scheduler 因果；配置值、实际行为和结果三者能够对应。',
			unlocks: 'F0 核心综合',
			href: '/labs/kv-cache-batch/read/docs/PLAN/#gate-s4scheduler-budget',
		},
		{
			id: 'F0',
			title: 'Phase 2 Checkoff 与最终交付',
			status: 'pending',
			duration: '2 × 120 min',
			dependsOn: 'P0、M0–M2、S0–S4',
			question: '能否把机制、实现、真实测量和结论边界连接成一条可复查的因果链？',
			work: '重建核心曲线，复测异常，完成十个知识点闭卷答辩，形成 Supported/Refuted/Inconclusive 结论矩阵。',
			artifact: '复现包、结论矩阵与最终 vLLM 性能文章。',
			acceptance:
				'所有核心 Gate 通过；原始数据可重建；文章中的每条性能结论都有明确证据和适用范围。',
			unlocks: 'Core Complete；再按问题选择进阶扩展',
			href: '/labs/kv-cache-batch/read/docs/PLAN/#gate-f0原始阶段产出与核心完成',
		},
	],
};

export const phase2Extensions: CourseUnit[] = [
	{
		id: 'S5',
		title: 'Mixed Prefill / Decode 与 Chunked Prefill',
		status: 'optional',
		duration: '按问题投入',
		dependsOn: 'F0 或明确的混合负载问题',
		question: '长 Prefill 怎样干扰 Decode ITL，Chunking 改变了什么？',
		work: '构造真实流式混合负载并保存时间线。',
		artifact: 'Prefill/Decode 时间线与 Chunked Prefill 对照。',
		acceptance: '能够区分改善 Decode 响应性与增加调度/执行开销。',
		unlocks: '针对调度公平性的源码追踪',
	},
	{
		id: 'S6',
		title: 'Prefix Reuse',
		status: 'optional',
		duration: '按问题投入',
		dependsOn: 'F0 或重复前缀工作负载',
		question: '共享前缀命中时复用了什么，主要改变哪个阶段？',
		work: '构造命中/未命中对照，记录 TTFT、命中状态与额外管理成本。',
		artifact: 'Prefix Hit 对照与证据边界。',
		acceptance: '不把 Prefill 复用外推为 Decode、质量或整体吞吐必然同比提升。',
		unlocks: '真实业务前缀策略',
	},
	{
		id: 'R0',
		title: '固定版本源码追踪',
		status: 'optional',
		duration: '按问题投入',
		dependsOn: '至少一个已经复现的 S 系列现象',
		question: '哪个具体源码状态转换解释了已经观测到的现象？',
		work: '固定 Commit，只追一条 Request/Scheduler/KV Cache 垂直切片，再回到实验验证。',
		artifact: '调用链、状态机和验证性复跑。',
		acceptance: '源码阅读产生新的可证伪预测，而不是停在函数名罗列。',
		unlocks: '更深的运行时优化研究',
	},
	{
		id: 'T0',
		title: '跨模型 / Backend / 硬件迁移',
		status: 'optional',
		duration: '按问题投入',
		dependsOn: 'F0',
		question: '哪些趋势来自机制，哪些只属于当前环境？',
		work: '迁移前预测差异，重新冻结第二环境，复跑基线和一个压力实验。',
		artifact: '第二环境复现包与差异解释。',
		acceptance: '明确 Supported、Changed 与 Inconclusive，不用一次迁移声称普遍规律。',
		unlocks: '跨环境可推广结论',
	},
];

export const learningPhases = [phase1, phase2];

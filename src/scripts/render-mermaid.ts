const codeBlocks = Array.from(
	document.querySelectorAll<HTMLElement>('pre > code.language-mermaid'),
);

const presentationIconPath = 'M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3m4 18 5-5 5 5';
const closeIconPath = 'M6 6l12 12M18 6 6 18';

const describeError = (error: unknown) => {
	if (error instanceof Error) return error.message;
	if (typeof error === 'object' && error !== null && 'str' in error) {
		return String(error.str);
	}
	return String(error);
};

type DiagramView = {
	shell: HTMLElement;
	diagram: HTMLElement;
	viewport: HTMLElement;
	toolbar: HTMLElement;
	zoomInput: HTMLInputElement;
};

const createDiagramView = (): DiagramView => {
	const shell = document.createElement('figure');
	const toolbar = document.createElement('div');
	const viewport = document.createElement('div');
	const diagram = document.createElement('div');
	const zoomControl = document.createElement('label');
	const zoomInput = document.createElement('input');
	const zoomSuffix = document.createElement('span');

	shell.className = 'mermaid-shell';
	toolbar.className = 'mermaid-toolbar';
	toolbar.setAttribute('aria-label', 'Mermaid 图表控制');
	viewport.className = 'mermaid-viewport';
	viewport.tabIndex = 0;
	viewport.setAttribute('aria-label', '可缩放和拖动的 Mermaid 图表');
	diagram.className = 'mermaid mermaid-diagram';
	zoomControl.className = 'mermaid-zoom-control';
	zoomInput.className = 'mermaid-zoom-input';
	zoomInput.type = 'number';
	zoomInput.inputMode = 'decimal';
	zoomInput.min = '50';
	zoomInput.step = '5';
	zoomInput.value = '100';
	zoomInput.setAttribute('aria-label', '图表缩放百分比');
	zoomSuffix.className = 'mermaid-zoom-suffix';
	zoomSuffix.setAttribute('aria-hidden', 'true');
	zoomSuffix.textContent = '%';
	zoomControl.append(zoomInput, zoomSuffix);

	const controls = [
		{ action: 'zoom-out', label: '缩小图表', icon: 'M5 12h14' },
		{ action: 'zoom-in', label: '放大图表', icon: 'M12 5v14m-7-7h14' },
		{
			action: 'present',
			label: '打开投影模式',
			icon: presentationIconPath,
		},
	];

	for (const control of controls) {
		const button = document.createElement('button');
		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

		button.type = 'button';
		button.dataset.mermaidAction = control.action;
		button.setAttribute('aria-label', control.label);
		button.title = control.label;
		if (control.action === 'present') button.setAttribute('aria-pressed', 'false');
		icon.setAttribute('viewBox', '0 0 24 24');
		icon.setAttribute('aria-hidden', 'true');
		path.setAttribute('d', control.icon);
		icon.append(path);
		button.append(icon);
		toolbar.append(button);
	}

	toolbar.append(zoomControl);
	viewport.append(diagram);
	shell.append(toolbar, viewport);

	return { shell, diagram, viewport, toolbar, zoomInput };
};

const enableDiagramNavigation = ({ shell, diagram, viewport, toolbar, zoomInput }: DiagramView) => {
	const svg = diagram.querySelector('svg');
	if (!(svg instanceof SVGSVGElement)) return;

	const naturalWidth = svg.viewBox.baseVal.width || svg.getBoundingClientRect().width;
	const naturalHeight = svg.viewBox.baseVal.height || svg.getBoundingClientRect().height;
	if (naturalWidth <= 0 || naturalHeight <= 0) return;

	const horizontalPadding = 24;
	const verticalPadding = 24;
	let fitScale = 1;
	let minScale = 0.5;
	let maxScale = 4;
	let scale = 1;
	let isPresenting = false;
	let restoreFocus: HTMLElement | null = null;

	const updateScaleBounds = () => {
		const widthScale = (viewport.clientWidth - horizontalPadding) / naturalWidth;
		const heightScale = (viewport.clientHeight - verticalPadding) / naturalHeight;
		const availableScale = isPresenting ? Math.min(widthScale, heightScale) : widthScale;
		fitScale = Math.min(Math.max(availableScale, 0.1), isPresenting ? 2 : 1);
		minScale = fitScale * 0.5;
		maxScale = Math.max(fitScale * 4, 2);
		zoomInput.min = String(Math.round((minScale / fitScale) * 100));
		zoomInput.max = String(Math.round((maxScale / fitScale) * 100));
	};

	const applyScale = (nextScale: number, anchorX = viewport.clientWidth / 2) => {
		const oldScrollWidth = Math.max(viewport.scrollWidth, 1);
		const anchorRatio = (viewport.scrollLeft + anchorX) / oldScrollWidth;

		scale = Math.min(Math.max(nextScale, minScale), maxScale);
		const scaledWidth = naturalWidth * scale;
		svg.style.width = `${scaledWidth}px`;
		svg.style.height = 'auto';
		diagram.style.width = `${scaledWidth + horizontalPadding}px`;
		zoomInput.value = String(Math.round((scale / fitScale) * 100));

		requestAnimationFrame(() => {
			viewport.scrollLeft = anchorRatio * viewport.scrollWidth - anchorX;
		});
	};

	const commitZoomInput = () => {
		const percentage = Number(zoomInput.value);
		if (zoomInput.value.trim() === '' || !Number.isFinite(percentage)) {
			zoomInput.value = String(Math.round((scale / fitScale) * 100));
			return;
		}

		applyScale(fitScale * (percentage / 100));
	};

	zoomInput.addEventListener('change', commitZoomInput);
	zoomInput.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		commitZoomInput();
		zoomInput.select();
	});

	const resetView = () => {
		updateScaleBounds();
		applyScale(fitScale);
		requestAnimationFrame(() => {
			viewport.scrollLeft = Math.max((viewport.scrollWidth - viewport.clientWidth) / 2, 0);
			viewport.scrollTop = Math.max((viewport.scrollHeight - viewport.clientHeight) / 2, 0);
		});
	};

	const updatePresentationControl = (button: HTMLButtonElement, open: boolean) => {
		const label = open ? '关闭投影模式' : '打开投影模式';
		button.dataset.mermaidAction = open ? 'close-presentation' : 'present';
		button.setAttribute('aria-label', label);
		button.setAttribute('aria-pressed', String(open));
		button.title = label;
		button.querySelector('path')?.setAttribute('d', open ? closeIconPath : presentationIconPath);
	};

	const closePresentation = () => {
		if (!isPresenting) return;
		isPresenting = false;
		shell.classList.remove('is-presenting');
		shell.removeAttribute('role');
		shell.removeAttribute('aria-modal');
		document.body.classList.remove('mermaid-presentation-open');

		const button = toolbar.querySelector<HTMLButtonElement>(
			'button[data-mermaid-action="close-presentation"]',
		);
		if (button) updatePresentationControl(button, false);

		requestAnimationFrame(() => {
			resetView();
			(restoreFocus ?? button)?.focus({ preventScroll: true });
			restoreFocus = null;
		});
	};

	const openPresentation = (button: HTMLButtonElement) => {
		if (isPresenting) return;
		isPresenting = true;
		restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
		shell.classList.add('is-presenting');
		shell.setAttribute('role', 'dialog');
		shell.setAttribute('aria-modal', 'true');
		document.body.classList.add('mermaid-presentation-open');
		updatePresentationControl(button, true);

		requestAnimationFrame(() => {
			resetView();
			viewport.focus({ preventScroll: true });
		});
	};

	toolbar.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
			'button[data-mermaid-action]',
		);
		if (!button) return;

		switch (button.dataset.mermaidAction) {
			case 'zoom-in':
				applyScale(scale * 1.2);
				break;
			case 'zoom-out':
				applyScale(scale / 1.2);
				break;
			case 'present':
				openPresentation(button);
				break;
			case 'close-presentation':
				closePresentation();
				break;
		}
	});

	const isEscapeKey = (event: KeyboardEvent) => {
		const legacyKeyCode = Reflect.get(event, 'keyCode');
		return (
			event.key === 'Escape' ||
			event.key === 'Esc' ||
			event.code === 'Escape' ||
			legacyKeyCode === 27
		);
	};

	const handlePresentationEscape = (event: KeyboardEvent) => {
		if (!isPresenting || !isEscapeKey(event)) return false;
		event.preventDefault();
		closePresentation();
		return true;
	};

	window.addEventListener(
		'keydown',
		(event) => {
			if (handlePresentationEscape(event) || !isPresenting || event.key !== 'Tab') return;

			const focusableControls: HTMLElement[] = [
				...toolbar.querySelectorAll<HTMLButtonElement>('button'),
				zoomInput,
				viewport,
			];
			const first = focusableControls[0];
			const last = focusableControls.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		},
		{ capture: true },
	);

	window.addEventListener('keyup', handlePresentationEscape, { capture: true });

	viewport.addEventListener(
		'wheel',
		(event) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			const rect = viewport.getBoundingClientRect();
			applyScale(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX - rect.left);
		},
		{ passive: false },
	);

	viewport.addEventListener('keydown', (event) => {
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			applyScale(scale * 1.2);
		} else if (event.key === '-') {
			event.preventDefault();
			applyScale(scale / 1.2);
		} else if (event.key === '0') {
			event.preventDefault();
			resetView();
		}
	});

	let dragStart: { x: number; y: number; left: number; top: number } | undefined;

	viewport.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'touch' || event.button !== 0) return;
		dragStart = {
			x: event.clientX,
			y: event.clientY,
			left: viewport.scrollLeft,
			top: viewport.scrollTop,
		};
		viewport.classList.add('is-dragging');
		viewport.setPointerCapture(event.pointerId);
		event.preventDefault();
	});

	viewport.addEventListener('pointermove', (event) => {
		if (!dragStart) return;
		viewport.scrollLeft = dragStart.left - (event.clientX - dragStart.x);
		viewport.scrollTop = dragStart.top - (event.clientY - dragStart.y);
	});

	const stopDragging = (event: PointerEvent) => {
		if (!dragStart) return;
		dragStart = undefined;
		viewport.classList.remove('is-dragging');
		if (viewport.hasPointerCapture(event.pointerId)) {
			viewport.releasePointerCapture(event.pointerId);
		}
	};

	viewport.addEventListener('pointerup', stopDragging);
	viewport.addEventListener('pointercancel', stopDragging);
	window.addEventListener('resize', resetView);

	resetView();
};

if (codeBlocks.length > 0) {
	const { default: mermaid } = await import('mermaid');

	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: 'base',
		themeVariables: {
			background: '#ffffff',
			primaryColor: '#eef2ff',
			primaryBorderColor: '#6366f1',
			primaryTextColor: '#0f172a',
			secondaryColor: '#f8fafc',
			secondaryBorderColor: '#94a3b8',
			secondaryTextColor: '#0f172a',
			tertiaryColor: '#fef3c7',
			tertiaryBorderColor: '#d97706',
			tertiaryTextColor: '#0f172a',
			lineColor: '#64748b',
			textColor: '#0f172a',
			fontFamily: 'Kalam, system-ui, sans-serif',
		},
		flowchart: {
			curve: 'basis',
			htmlLabels: false,
			useMaxWidth: true,
		},
		sequence: {
			useMaxWidth: true,
			wrap: true,
		},
	});

	await document.fonts.ready;

	for (const [index, codeBlock] of codeBlocks.entries()) {
		const source = codeBlock.textContent ?? '';
		const pre = codeBlock.parentElement;

		try {
			await mermaid.parse(source);
		} catch (error) {
			pre?.classList.add('mermaid-source-error');
			console.error(`Unable to parse Mermaid diagram: ${describeError(error)}`);
			continue;
		}

		const view = createDiagramView();

		try {
			const { svg, bindFunctions } = await mermaid.render(`mermaid-diagram-${index}`, source);
			view.diagram.innerHTML = svg;
			pre?.replaceWith(view.shell);
			bindFunctions?.(view.diagram);
			enableDiagramNavigation(view);
		} catch (error) {
			pre?.classList.add('mermaid-source-error');
			console.error(`Unable to render Mermaid diagram: ${describeError(error)}`);
		}
	}
}

export {};

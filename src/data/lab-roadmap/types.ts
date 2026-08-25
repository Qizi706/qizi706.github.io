export type LabStatus = 'done' | 'active' | 'pending' | 'optional';

export interface LabReference {
	label: string;
	href: string;
	focus: string;
}

export interface LabPart {
	id: string;
	title: string;
	status: LabStatus;
	checkoff: string;
	preRead: LabReference[];
}

export interface LabUnit {
	id: string;
	title: string;
	status: LabStatus;
	duration: string;
	dependsOn: string;
	question: string;
	preRead: LabReference[];
	work: string;
	artifact: string;
	acceptance: string;
	unlocks: string;
	href?: string;
	parts?: LabPart[];
}

export interface LabPhase {
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
	units: LabUnit[];
}

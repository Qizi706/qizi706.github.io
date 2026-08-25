export { phase1 } from './phase-1';
export { phase2, phase2Extensions } from './phase-2';
export { phase2Progress } from './progress';
export type { LabPart, LabPhase, LabStatus, LabUnit } from './types';

import { phase1 } from './phase-1';
import { phase2 } from './phase-2';

export const learningPhases = [phase1, phase2];

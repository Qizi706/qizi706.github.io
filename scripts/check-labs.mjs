import { discoverLabs, validateLab } from '../src/utils/lab-artifacts.mjs';

const labs = await discoverLabs();
if (labs.length === 0) throw new Error('No Lab manifests were found in labs/.');

for (const labName of labs) {
	const { artifacts } = await validateLab(labName);
	console.log(`Checked ${labName}: ${artifacts.length} publishable files`);
}

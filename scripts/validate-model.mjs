import { readFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';

const bytes = await readFile(new URL('../public/models/molar.glb', import.meta.url));
const report = await validateBytes(new Uint8Array(bytes), {
  uri: 'molar.glb',
  maxIssues: 50,
});
console.log(JSON.stringify({
  bytes: bytes.byteLength,
  errors: report.issues.numErrors,
  warnings: report.issues.numWarnings,
  messages: report.issues.messages,
  info: report.info,
}, null, 2));
if (report.issues.numErrors > 0) process.exitCode = 1;

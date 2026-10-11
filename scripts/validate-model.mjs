import { readFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';

for (const filename of ['molar.glb', 'molar-mobile.glb']) {
  const bytes = await readFile(new URL(`../public/models/${filename}`, import.meta.url));
  const report = await validateBytes(new Uint8Array(bytes), {
    uri: filename,
    maxIssues: 50,
  });
  console.log(JSON.stringify({
    file: filename,
    bytes: bytes.byteLength,
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    messages: report.issues.messages,
    info: report.info,
  }, null, 2));
  if (report.issues.numErrors > 0 || report.issues.numWarnings > 0) process.exitCode = 1;
}

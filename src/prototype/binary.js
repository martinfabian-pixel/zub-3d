/** Abortable same-origin asset download; allocations happen only while loading. */
export async function loadBinary(url, signal, onProgress) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${new URL(url).pathname}`);
  if (!response.body || !onProgress) return response.arrayBuffer();
  const total = Number(response.headers.get('content-length'));
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(total > 0 ? Math.min(100, Math.round(received / total * 100)) : null);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

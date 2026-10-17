// Request body reading shared by the public and owner Workers: a streamed size cap, then strict
// UTF-8 decoding. Moved unchanged from worker/public/intake.ts at checkpoint 2.

/** Reads at most `max` bytes of UTF-8 while streaming; null when larger or not valid UTF-8. */
export async function readBody(request: Request, max: number): Promise<{ text: string } | { tooLarge: boolean }> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > max) return { tooLarge: true };
  if (!request.body) return { text: '' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    // ignoreBOM: a leading BOM stays in the text, so the strict parsers refuse it rather than it being stripped.
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { tooLarge: false };
  }
}

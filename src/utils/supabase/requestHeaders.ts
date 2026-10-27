/**
 * Headers for every request the website's Supabase client sends.
 *
 * `Accept` is always JSON. `Content-Type` defaults to JSON only when the body is not a file upload. A storage upload sends a
 * FormData (or a Blob) and deliberately sets NO Content-Type, because the browser must write `multipart/form-data; boundary=…`
 * itself. The client used to add `Content-Type: application/json` to any request that had none, so every upload reached storage
 * labelled as JSON: a bucket with allowed file types refused it ("mime type application/json is not supported", which broke every
 * logo, background and portrait upload in the Guardian portal) and a bucket without them stored the image with the type
 * `application/json`, which no browser draws.
 */
export function withDefaultHeaders(headers: HeadersInit | undefined, body: unknown): Headers {
  // new Headers() takes plain objects, tuples and Headers instances alike (supabase-js passes a Headers instance).
  const merged = new Headers(headers);
  merged.set('Accept', 'application/json');

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const isBinary =
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body as ArrayBufferView) ||
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);

  // The browser's own multipart type, with its boundary, is the only one that can be right for a FormData.
  if (isForm) merged.delete('Content-Type');
  else if (!isBinary && !merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
  return merged;
}

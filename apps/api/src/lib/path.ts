/** Strip the query string from a request URL for path-based skip checks. */
export function reqPath(url: string): string {
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(0, q) : url;
}

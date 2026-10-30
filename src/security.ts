/** One encoding and URL-policy implementation for every backend/feature. */
export function escapeHTML(value: string): string {
  return value.replace(/[&<>"'\u0000]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\0': '\ufffd' })[c]!);
}
export function safeURL(value: string, image = false): string | undefined {
  const url = value.trim();
  // Backslashes and controls can be normalized differently by URL consumers.
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(url)) return;
  // Network-path references make resource ownership ambiguous.
  if (url.startsWith('//')) return;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme && !(['http', 'https', ...(image ? [] : ['mailto', 'tel'])].includes(scheme))) return;
  const wellFormed = url.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');
  return encodeURI(wellFormed).replace(/%25([\da-f]{2})/gi, '%$1');
}
const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
export function decodeEntities(source: string): string {
  return source.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (all, body: string) => {
    if (body[0] !== '#') return entities[body] ?? all;
    let code = body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) code = 0xfffd;
    if (code >= 128 && code <= 159) return '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ'[code - 128]!;
    return String.fromCodePoint(code);
  });
}
export function unescape(source: string): string {
  return decodeEntities(source.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1'));
}

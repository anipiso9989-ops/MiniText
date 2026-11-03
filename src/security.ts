/** One encoding and URL-policy implementation for every backend/feature. */
const htmlEscapes: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\0': '\ufffd' };
const htmlEscape = (character: string): string => htmlEscapes[character]!;
export function escapeHTML(value: string): string {
  if (!/[&<>"'\u0000]/.test(value)) return value;
  // Avoid a native-to-JS replacement callback for each entity in short values.
  // Long values keep the native scan so sparse escapes do not cause a JS scan.
  if (value.length > 256) return value.replace(/[&<>"'\u0000]/g, htmlEscape);
  let output = '', start = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 38 || code === 60 || code === 62 || code === 34 || code === 39 || code === 0) {
      output += value.slice(start, i) + htmlEscapes[value[i]!]!;
      start = i + 1;
    }
  }
  return output + value.slice(start);
}
export function safeURL(value: string, image = false): string | undefined {
  const url = value.trim();
  // Backslashes and controls can be normalized differently by URL consumers.
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(url)) return;
  // Network-path references make resource ownership ambiguous.
  if (url.startsWith('//')) return;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https' && (image || (scheme !== 'mailto' && scheme !== 'tel'))) return;
  // encodeURI leaves these ASCII characters unchanged. Valid existing escapes
  // also survive the encoding-and-undoubling path below.
  if (/^[\w;/?:@&=+$,#.!~*'()%-]*$/.test(url) && !/%(?![\da-f]{2})/i.test(url)) return url;
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
  if (!/[\\&]/.test(source)) return source;
  return decodeEntities(source.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1'));
}

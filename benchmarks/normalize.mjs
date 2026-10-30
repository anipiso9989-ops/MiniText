export const normalizeHTML = html => html.replace(/\s*\/>/g, '>').replace(/ loading="lazy"/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/>\n</g, '><').trim();

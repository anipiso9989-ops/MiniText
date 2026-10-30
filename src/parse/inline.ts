import type { Inline, Extension, Link } from '../model/types.ts';
import { Budget } from '../limits.ts';
import { decodeEntities, unescape } from '../security.ts';

interface Cell {
  node: Inline;
  prev?: Cell | undefined;
  next?: Cell | undefined;
  mark?: string;
  count?: number;
  open?: boolean;
  close?: boolean;
  active?: boolean;
}
const punctuation = /[\p{P}\p{S}]/u;
const space = /\s/u;
const escapable = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/;

export function parseInline(source: string, budget: Budget, extensions: readonly Extension[], depth: number, links = true): Inline[] {
  budget.check(depth);
  let head: Cell | undefined, tail: Cell | undefined;
  const delimiters: Cell[] = [];
  function append(node: Inline): Cell {
    const cell: Cell = { node: budget.node(node), prev: tail };
    if (tail) tail.next = cell; else head = cell;
    tail = cell;
    return cell;
  }
  function text(value: string): void {
    if (!value) return;
    if (tail?.node.type === 'text' && !tail.mark) tail.node = { type: 'text', value: tail.node.value + value };
    else append({ type: 'text', value });
  }
  const recurse = (s: string) => parseInline(s, budget, extensions, depth + 1, links);
  let plain = '';
  function flush(): void { text(decodeEntities(plain)); plain = ''; }
  for (let i = 0; i < source.length;) {
    budget.tick();
    let matched = false;
    for (const extension of extensions) {
      const match = extension.inline?.({ source, index: i, parse: recurse });
      if (!match) continue;
      if (!Number.isInteger(match.length) || match.length < 1 || match.length > source.length - i)
        throw new TypeError(`Extension ${extension.name} returned an invalid inline length`);
      flush(); append(match.node); i += match.length; matched = true; break;
    }
    if (matched) continue;
    const ch = source[i]!;
    if (ch === '\\' && i + 1 < source.length) {
      if (source[i + 1] === '\n') { flush(); append({ type: 'hardBreak' }); i += 2; continue; }
      if (escapable.test(source[i + 1]!)) { flush(); text(source[i + 1]!); i += 2; continue; }
    }
    if (ch === '\n') {
      const hard = / {2,}$/.test(plain);
      plain = plain.replace(/[ \t]+$/, ''); flush();
      append({ type: hard ? 'hardBreak' : 'softBreak' });
      i++; while (source[i] === ' ' || source[i] === '\t') i++;
      continue;
    }
    if (ch === '`') {
      let endRun = i + 1;
      while (source[endRun] === '`') endRun++;
      const marker = source.slice(i, endRun);
      let close = endRun;
      for (;;) {
        const found = source.indexOf(marker, close);
        budget.tick((found < 0 ? source.length : found) - close + 1);
        if (found < 0) { close = -1; break; }
        let after = found + marker.length;
        while (source[after] === '`') after++;
        if (after === found + marker.length && source[found - 1] !== '`') { close = found; break; }
        close = after;
      }
      if (close >= 0) {
        let value = source.slice(endRun, close).replace(/\n/g, ' ');
        if (value.startsWith(' ') && value.endsWith(' ') && /[^ ]/.test(value)) value = value.slice(1, -1);
        flush(); append({ type: 'code', value }); i = close + marker.length; continue;
      }
      plain += marker; i = endRun; continue;
    }
    const image = ch === '!' && source[i + 1] === '[';
    if ((ch === '[' && links) || image) {
      const start = i + (image ? 2 : 1);
      let nesting = 1, close = start;
      for (; close < source.length; close++) {
        budget.tick();
        if (source[close] === '\\') { close++; continue; }
        if (source[close] === '[') nesting++;
        if (source[close] === ']') { nesting--; if (!nesting) break; }
      }
      if (close < source.length && source[close + 1] === '(') {
        const destination = parseDestination(source, close + 2, budget);
        if (destination) {
          const label = source.slice(start, close);
          flush();
          if (image) append({ type: 'image', url: destination.url, alt: inlineText(parseInline(label, budget, extensions, depth + 1, false)), ...(destination.title === undefined ? {} : { title: destination.title }) });
          else {
            const node: Link = { type: 'link', url: destination.url, children: parseInline(label, budget, extensions, depth + 1, false), ...(destination.title === undefined ? {} : { title: destination.title }) };
            append(node);
          }
          i = destination.end; continue;
        }
      }
    }
    if (ch === '<') {
      const end = source.indexOf('>', i + 1);
      if (end >= 0) {
        budget.tick(end - i);
        const value = source.slice(i + 1, end);
        const uri = /^[a-z][a-z\d+.-]{1,31}:[^<>\s]*$/i.test(value);
        const email = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*$/i.test(value);
        if ((uri || email) && links) {
          flush(); append({ type: 'link', url: email ? `mailto:${value}` : value, children: [budget.node({ type: 'text', value })] });
          i = end + 1; continue;
        }
      }
    }
    if (ch === '*' || ch === '_') {
      flush(); let end = i + 1;
      while (source[end] === ch) end++;
      const before = i ? String.fromCodePoint(source.codePointAt(i - 1)!) : '\n';
      const after = end < source.length ? String.fromCodePoint(source.codePointAt(end)!) : '\n';
      const left = !space.test(after) && (!punctuation.test(after) || space.test(before) || punctuation.test(before));
      const right = !space.test(before) && (!punctuation.test(before) || space.test(after) || punctuation.test(after));
      const cell = append({ type: 'text', value: source.slice(i, end) });
      Object.assign(cell, { mark: ch, count: end - i, open: ch === '*' ? left : left && (!right || punctuation.test(before)), close: ch === '*' ? right : right && (!left || punctuation.test(after)), active: true });
      delimiters.push(cell); i = end; continue;
    }
    plain += ch; i++;
  }
  flush();
  function unlink(cell: Cell): void {
    if (cell.prev) cell.prev.next = cell.next; else head = cell.next;
    if (cell.next) cell.next.prev = cell.prev; else tail = cell.prev;
    cell.active = false;
  }
  for (let c = 0; c < delimiters.length; c++) {
    const closer = delimiters[c]!;
    if (!closer.active || !closer.close) continue;
    while (closer.active && closer.count) {
      let opener: Cell | undefined;
      for (let p = c - 1; p >= 0; p--) {
        budget.tick(); const candidate = delimiters[p]!;
        if (!candidate.active || !candidate.open || candidate.mark !== closer.mark) continue;
        if ((candidate.close || closer.open) && (candidate.count! + closer.count) % 3 === 0 && (candidate.count! % 3 !== 0 || closer.count % 3 !== 0)) continue;
        opener = candidate; break;
      }
      if (!opener) break;
      const children: Inline[] = [];
      for (let cell = opener.next; cell && cell !== closer; cell = cell.next) { budget.tick(); children.push(cell.node); cell.active = false; }
      const count = opener.count! >= 2 && closer.count >= 2 ? 2 : 1;
      const wrapper: Cell = { node: budget.node({ type: count === 2 ? 'strong' : 'emphasis', children }), prev: opener, next: closer };
      opener.next = wrapper; closer.prev = wrapper;
      opener.count! -= count; closer.count -= count;
      opener.node = { type: 'text', value: opener.mark!.repeat(opener.count!) };
      closer.node = { type: 'text', value: closer.mark!.repeat(closer.count) };
      if (!opener.count) unlink(opener);
      if (!closer.count) unlink(closer);
    }
  }
  const result: Inline[] = [];
  for (let cell = head; cell; cell = cell.next) result.push(cell.node);
  return result;
}

function parseDestination(source: string, start: number, budget: Budget): { url: string; title?: string; end: number } | undefined {
  let i = start;
  while (/[ \t\n]/.test(source[i] ?? '') && i < source.length) i++;
  const begin = i;
  let raw: string;
  if (source[i] === '<') {
    i++;
    while (i < source.length && source[i] !== '>') {
      budget.tick(); if (source[i] === '\n' || source[i] === '<') return;
      if (source[i] === '\\') i++; i++;
    }
    if (source[i] !== '>') return;
    raw = source.slice(begin + 1, i++);
  } else {
    let depth = 0;
    while (i < source.length) {
      budget.tick(); const ch = source[i]!;
      if (ch === '\\' && i + 1 < source.length) { i += 2; continue; }
      if (ch === '(') { if (++depth > 32) return; }
      else if (ch === ')') { if (!depth) break; depth--; }
      if (/\s/.test(ch)) break;
      if (ch === '<' || /[\u0000-\u001f]/.test(ch)) return;
      i++;
    }
    if (depth) return;
    raw = source.slice(begin, i);
  }
  const beforeSpace = i;
  while (i < source.length && /[ \t\n]/.test(source[i]!)) i++;
  let title: string | undefined;
  if (i > beforeSpace && (source[i] === '"' || source[i] === "'" || source[i] === '(')) {
    const close = source[i] === '(' ? ')' : source[i]!;
    const titleStart = ++i;
    while (i < source.length && source[i] !== close) { budget.tick(); if (source[i] === '\\') i++; i++; }
    if (source[i] !== close) return;
    title = unescape(source.slice(titleStart, i++));
    while (i < source.length && /[ \t\n]/.test(source[i]!)) i++;
  }
  if (source[i] !== ')') return;
  return { url: unescape(raw), end: i + 1, ...(title === undefined ? {} : { title }) };
}

export function inlineText(nodes: readonly Inline[]): string {
  return nodes.map(node => {
    switch (node.type) {
      case 'text': case 'code': return node.value;
      case 'image': return node.alt;
      case 'hardBreak': case 'softBreak': return '\n';
      case 'extension': return node.fallback;
      default: return inlineText(node.children);
    }
  }).join('');
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: 'warning' | 'error';
  readonly message: string;
}
export type Result<T> =
  | { readonly ok: true; readonly artifact: T; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export interface Limits {
  readonly maxInputBytes: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxOutputBytes: number;
  /** Bounds parser scans, including failed lookahead. */
  readonly maxWork: number;
}
export interface Document { readonly type: 'document'; readonly children: readonly Block[] }
export interface Text { readonly type: 'text'; readonly value: string }
export interface Code { readonly type: 'code'; readonly value: string }
export interface Break { readonly type: 'softBreak' | 'hardBreak' }
export interface Emphasis { readonly type: 'emphasis' | 'strong'; readonly children: readonly Inline[] }
export interface Link { readonly type: 'link'; readonly url: string; readonly title?: string; readonly children: readonly Inline[] }
export interface Image { readonly type: 'image'; readonly url: string; readonly title?: string; readonly alt: string }
export interface Paragraph { readonly type: 'paragraph'; readonly children: readonly Inline[] }
export interface Heading { readonly type: 'heading'; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly children: readonly Inline[] }
export interface CodeBlock { readonly type: 'codeBlock'; readonly value: string; readonly language?: string }
export interface Blockquote { readonly type: 'blockquote'; readonly children: readonly Block[] }
export interface ListItem { readonly type: 'listItem'; readonly children: readonly Block[] }
export interface List { readonly type: 'list'; readonly ordered: boolean; readonly start: number; readonly tight: boolean; readonly children: readonly ListItem[] }
export interface ThematicBreak { readonly type: 'thematicBreak' }
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export interface ExtensionNode {
  readonly type: 'extension';
  readonly kind: 'block' | 'inline';
  readonly name: string;
  readonly data: Json;
  readonly fallback: string;
  readonly children: readonly (Block | Inline)[];
}
export type Inline = Text | Code | Break | Emphasis | Link | Image | ExtensionNode;
export type Block = Paragraph | Heading | CodeBlock | Blockquote | List | ThematicBreak | ExtensionNode;
export type Node = Document | Block | Inline | ListItem;

/** Strings in this tree are text, never raw markup. */
export type Output = string | {
  readonly tag: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
  readonly children?: readonly Output[];
};
export interface InlineContext {
  readonly source: string;
  readonly index: number;
  parse(source: string): Inline[];
}
export interface BlockContext {
  readonly lines: readonly string[];
  readonly index: number;
  inline(source: string): Inline[];
  blocks(lines: readonly string[]): Block[];
}
export interface Extension {
  readonly name: string;
  readonly inline?: (context: InlineContext) => { readonly length: number; readonly node: Inline } | undefined;
  readonly block?: (context: BlockContext) => { readonly lines: number; readonly node: Block } | undefined;
  readonly transform?: (document: Document) => Document;
  readonly render?: (node: ExtensionNode, children: readonly Output[]) => Output;
}
export interface Options {
  readonly limits?: Partial<Limits>;
  readonly signal?: AbortSignal;
  readonly extensions?: readonly Extension[];
  /** Images are external resource requests. Disabled unless explicitly enabled. */
  readonly images?: boolean;
}
export interface HtmlArtifact { readonly html: string; readonly document: Document }

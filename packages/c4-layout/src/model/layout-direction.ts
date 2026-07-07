/**
 * Layout flow direction. Defaults to `'LR'` everywhere in this package
 * (Enterprise's behaviour for every `c4-*` diagram type — see the
 * conformance survey's "Enterprise auto-layout" section); `'TB'` is
 * available for callers that want it, but this package never chooses it
 * automatically based on diagram type — that decision stays with the
 * caller.
 */
export type LayoutDirection = 'LR' | 'TB';

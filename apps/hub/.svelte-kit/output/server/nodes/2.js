import * as universal from '../entries/pages/_page.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.C0Oxnrxs.js","_app/immutable/chunks/BpUr5NOx.js","_app/immutable/chunks/C6M8wlf6.js","_app/immutable/chunks/BaH0bhBs.js","_app/immutable/chunks/0IfavMJz.js","_app/immutable/chunks/C9T96AC2.js","_app/immutable/chunks/ncXHou-P.js","_app/immutable/chunks/CsGHj3GC.js"];
export const stylesheets = [];
export const fonts = [];

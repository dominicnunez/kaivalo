function _layout($$renderer, $$props) {
  let { children } = $$props;
  $$renderer.push(`<div class="min-h-screen bg-white text-gray-900"><main>`);
  children($$renderer);
  $$renderer.push(`<!----></main></div>`);
}

export { _layout as default };
//# sourceMappingURL=_layout.svelte-Blal_44M.js.map

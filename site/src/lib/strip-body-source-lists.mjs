export default {
  name: "strip-body-source-lists",
  list(node, ctx) {
    if (node.ordered) return;
    const parent = ctx.parent(node);
    if (!parent) return;
    const index = ctx.indexOf(node);
    if (index == null || index === 0) return;
    const prev = parent.children[index - 1];
    if (!prev || prev.type !== "paragraph") return;
    const txt = ctx.textContent(prev).trim();
    if (!/^সূত্র:?$/u.test(txt)) return;
    ctx.removeNode(prev);
    ctx.removeNode(node);
  },
};
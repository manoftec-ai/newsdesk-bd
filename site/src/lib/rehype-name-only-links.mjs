export default {
  name: "rehype-name-only-links",
  element: [
    {
      filter: ["a"],
      visit(node, ctx) {
        const href = node.properties?.href;
        if (typeof href !== "string" || !/^https?:\/\//.test(href)) return;
        const text = ctx.textContent(node).trim();
        if (!/^https?:\/\//.test(text)) return;

        let label = null;
        const parent = ctx.parent(node);
        const index = ctx.indexOf(node);
        if (parent && index != null) {
          const prev = parent.children[index - 1];
          if (prev && prev.type === "text") {
            const m = prev.value.match(/^(.*?)\s*—\s*$/u);
            if (m) label = m[1].trim();
          }
        }
        if (!label) {
          try {
            label = new URL(text).hostname.replace(/^www\./, "");
          } catch {
            label = text;
          }
        }
        if (parent && index != null && parent.children[index - 1]?.type === "text") {
          ctx.removeNode(parent.children[index - 1]);
        }
        ctx.replaceNode(node, {
          ...node,
          children: [{ type: "text", value: label }],
        });
      },
    },
  ],
};
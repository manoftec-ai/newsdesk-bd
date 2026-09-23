export default function rehypeNameOnlyLinks() {
  return (tree) => {
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (!Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child && child.type === "element" && child.tagName === "li") {
          convertLi(child);
        } else if (child && child.type === "element") {
          walk(child);
        }
      }
    };

    const convertLi = (li) => {
      const children = li.children
        .filter((c) => c && (c.type === "text" || c.type === "element"));
      for (let i = 0; i < children.length; i++) {
        const anchor = children[i];
        if (anchor.type !== "element" || anchor.tagName !== "a") continue;
        const anchorText = anchor.children
          .filter((c) => c && c.type === "text")
          .map((c) => c.value)
          .join("");
        if (!/^https?:\/\//.test(anchorText.trim())) continue;

        let label = null;
        const prev = children[i - 1];
        if (prev && prev.type === "text") {
          const m = prev.value.match(/^(.*?)\s*—\s*$/u);
          if (m) label = m[1].trim();
        }
        if (!label) {
          try {
            label = new URL(anchorText.trim()).hostname.replace(/^www\./, "");
          } catch {
            label = anchorText.trim();
          }
        }
        const newAnchor = {
          type: "element",
          tagName: "a",
          properties: {
            ...anchor.properties,
            class: "underline decoration-dotted underline-offset-2 hover:text-primary",
          },
          children: [{ type: "text", value: label }],
        };
        if (prev && prev.type === "text" && /—\s*$/u.test(prev.value)) {
          children.splice(i - 1, 2, newAnchor);
          i--;
        } else {
          children[i] = newAnchor;
        }
      }
      li.children = children;
    };

    walk(tree);
    return tree;
  };
}
import type { TopicTreeNode } from "@syraa/context";

export function normalizeTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function resolveResourceIdByName(
  materials: { resourceId: string; name: string }[],
  query: string,
): string | null {
  const q = normalizeTitle(query);
  const exact = materials.find((material) => normalizeTitle(material.name) === q);
  if (exact) return exact.resourceId;

  const partial = materials.find((material) => {
    const name = normalizeTitle(material.name);
    return name.includes(q) || q.includes(name);
  });
  return partial?.resourceId ?? null;
}

export function collectTextUnderNode(node: TopicTreeNode): string[] {
  const parts: string[] = [];
  if (node.kind === "chunk" && node.text?.trim()) {
    parts.push(node.text.trim());
  }
  for (const child of node.children) {
    parts.push(...collectTextUnderNode(child));
  }
  return parts;
}

export function findSectionContent(
  tree: TopicTreeNode[],
  sectionQuery: string,
): { matchedTitle: string; texts: string[] } | null {
  const q = normalizeTitle(sectionQuery);

  function walk(nodes: TopicTreeNode[]): { matchedTitle: string; texts: string[] } | null {
    for (const node of nodes) {
      if (node.kind === "topic") {
        const titleNorm = normalizeTitle(node.title);
        if (titleNorm === q || titleNorm.includes(q) || q.includes(titleNorm)) {
          const texts = collectTextUnderNode(node);
          if (texts.length > 0) {
            return { matchedTitle: node.title, texts };
          }
        }
      }
      const nested = walk(node.children);
      if (nested) return nested;
    }
    return null;
  }

  return walk(tree);
}

export function findAllDocumentText(tree: TopicTreeNode[]): string[] {
  const texts: string[] = [];
  for (const node of tree) {
    texts.push(...collectTextUnderNode(node));
  }
  return texts;
}

export function joinTextsWithLimit(
  texts: string[],
  maxChars: number,
): { text: string; truncated: boolean } {
  let out = "";
  let truncated = false;
  for (const chunk of texts) {
    const separator = out ? "\n\n" : "";
    if (out.length + separator.length + chunk.length > maxChars) {
      truncated = true;
      const remaining = maxChars - out.length - separator.length;
      if (remaining > 0) {
        out += `${separator}${chunk.slice(0, remaining)}`;
      }
      break;
    }
    out += `${separator}${chunk}`;
  }
  return { text: out, truncated };
}

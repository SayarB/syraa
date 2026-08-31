import { useState } from "react";
import type { TopicTreeNode } from "../lib/types";

type Props = {
  node: TopicTreeNode;
  depth?: number;
};

export function TopicTreeItem({ node, depth = 0 }: Props) {
  const [open, setOpen] = useState(depth < 2);
  const [showText, setShowText] = useState(false);
  const isFolder = node.kind === "topic";
  const hasChildren = node.children.length > 0;

  if (isFolder) {
    return (
      <div className="tree-node" style={{ paddingLeft: depth === 0 ? 0 : "0.85rem" }}>
        <button
          type="button"
          className="tree-row folder"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="tree-twist" aria-hidden="true">
            {hasChildren ? (open ? "▾" : "▸") : "·"}
          </span>
          <span
            className={`tree-icon folder-ico${open && hasChildren ? " is-open" : ""}`}
            aria-hidden="true"
          />
          <span className="tree-title">{node.title}</span>
          <span className="tree-meta">{node.children.length}</span>
        </button>
        {open
          ? node.children.map((child) => (
              <TopicTreeItem key={child.id} node={child} depth={depth + 1} />
            ))
          : null}
      </div>
    );
  }

  return (
    <div className="tree-node" style={{ paddingLeft: "0.85rem" }}>
      <button
        type="button"
        className={`tree-row file${showText ? " is-open" : ""}`}
        onClick={() => setShowText((value) => !value)}
        aria-expanded={showText}
      >
        <span className="tree-twist" aria-hidden="true">
          {showText ? "▾" : "▸"}
        </span>
        <span className="tree-icon file-ico" aria-hidden="true" />
        <span className="tree-title">{node.title}</span>
        {node.role ? <span className="tree-meta">{node.role}</span> : null}
      </button>
      {showText && node.text ? <pre className="tree-file-body">{node.text}</pre> : null}
    </div>
  );
}

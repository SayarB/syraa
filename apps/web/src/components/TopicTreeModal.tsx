import type { ResourceTopicTree } from "../lib/types";
import { TopicTreeItem } from "./TopicTreeItem";

type Props = {
  data: ResourceTopicTree | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export function TopicTreeModal({ data, loading, error, onClose }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Document topic tree"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{data?.resource.name ?? "Topic tree"}</h2>
            <p>
              {loading
                ? "Loading…"
                : error
                  ? error
                  : data
                    ? `${data.topicCount} topics · ${data.chunkCount} chunks · ${data.resource.status}`
                    : "—"}
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          {loading ? <p className="memory-empty">Loading topic tree…</p> : null}
          {!loading && error ? <p className="memory-empty">{error}</p> : null}
          {!loading && !error && data && data.tree.length === 0 ? (
            <p className="memory-empty">
              No topics yet — ingest may still be running, or the PDF had no extractable outline.
            </p>
          ) : null}
          {!loading && !error && data
            ? data.tree.map((node) => <TopicTreeItem key={node.id} node={node} />)
            : null}
        </div>
      </div>
    </div>
  );
}

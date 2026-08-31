import type { MemoryItem } from "../lib/types";

type Props = {
  open: boolean;
  items: MemoryItem[];
  meta: string;
  onClose: () => void;
  onRefresh: () => void;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function MemoryDropdown({
  open,
  items,
  meta,
  onClose,
  onRefresh,
  onConfirm,
  onDismiss,
}: Props) {
  if (!open) return null;

  return (
    <div className="memory-dropdown" role="dialog" aria-label="Memory">
      <div className="memory-dropdown-head">
        <div>
          <h2>Memory</h2>
          <span>{meta}</span>
        </div>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button type="button" className="ghost-btn" onClick={onRefresh}>
            Refresh
          </button>
          <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close memory">
            Close
          </button>
        </div>
      </div>

      <div className="memory-list">
        {items.length === 0 ? (
          <p className="memory-empty">
            Nothing saved yet. Chat naturally — durable facts show up here as they land.
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className={`memory-item-row${item.status === "pending" ? " pending" : ""}`}
            >
              <div className="memory-item-top">
                <span className={`pill${item.status === "pending" ? " pending" : ""}`}>
                  {item.type}
                  {item.status === "pending" ? " · pending" : ""}
                </span>
                {item.status !== "pending" ? (
                  <button
                    type="button"
                    className="mini-btn dismiss"
                    onClick={() => onDismiss(item.id)}
                  >
                    dismiss
                  </button>
                ) : null}
              </div>
              <p>{item.text}</p>
              {item.why ? <p className="why">{item.why}</p> : null}
              <time>
                {formatTime(item.createdAt)} · {item.source}
              </time>
              {item.status === "pending" ? (
                <div className="memory-actions">
                  <button
                    type="button"
                    className="mini-btn confirm"
                    onClick={() => onConfirm(item.id)}
                  >
                    Remember
                  </button>
                  <button
                    type="button"
                    className="mini-btn dismiss"
                    onClick={() => onDismiss(item.id)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

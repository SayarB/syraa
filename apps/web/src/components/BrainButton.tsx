type Props = {
  open: boolean;
  pendingCount: number;
  onToggle: () => void;
  variant?: "icon" | "inline";
};

export function BrainButton({ open, pendingCount, onToggle, variant = "icon" }: Props) {
  if (variant === "inline") {
    return (
      <svg className="brain-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9.5 4.5c-1.6.2-2.9 1.5-3.2 3.1C4.6 8 3.5 9.5 3.5 11.3c0 1.5.8 2.8 2 3.5v1.7c0 1.5 1.2 2.7 2.7 2.7h.6M14.5 4.5c1.6.2 2.9 1.5 3.2 3.1 1.7.4 2.8 1.9 2.8 3.7 0 1.5-.8 2.8-2 3.5v1.7c0 1.5-1.2 2.7-2.7 2.7h-.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 3.8v16.4M9.2 8.2h2.4M12.4 11h2.4M9.2 13.8h2.4M12.4 16.6h2.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Open memory"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9.5 4.5c-1.6.2-2.9 1.5-3.2 3.1C4.6 8 3.5 9.5 3.5 11.3c0 1.5.8 2.8 2 3.5v1.7c0 1.5 1.2 2.7 2.7 2.7h.6M14.5 4.5c1.6.2 2.9 1.5 3.2 3.1 1.7.4 2.8 1.9 2.8 3.7 0 1.5-.8 2.8-2 3.5v1.7c0 1.5-1.2 2.7-2.7 2.7h-.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 3.8v16.4M9.2 8.2h2.4M12.4 11h2.4M9.2 13.8h2.4M12.4 16.6h2.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      {pendingCount > 0 ? <span className="badge-dot">{pendingCount}</span> : null}
    </button>
  );
}

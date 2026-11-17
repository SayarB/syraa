import type { ReactNode } from "react";

/** A titled, bordered group of settings. `action` sits beside the title (e.g. a refresh button). */
export function SettingsSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </h3>
        {action}
      </div>
      <div className="grid gap-4 rounded-xl border p-4">{children}</div>
    </section>
  );
}

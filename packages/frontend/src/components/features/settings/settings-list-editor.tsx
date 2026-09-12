import { CircleAlert, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type SettingsListItem = { id: string; label: string; errorTitle?: string | undefined };

export function SettingsListEditor({
  title,
  description,
  items,
  selectedId,
  disabled,
  addLabel,
  onSelect,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  items: SettingsListItem[];
  selectedId: string | null;
  disabled: boolean;
  addLabel: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex h-full min-h-0 flex-col gap-3 border-r border-border bg-muted/50 p-3">
        <div className="flex shrink-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={item.id === selectedId ? "accent" : "ghost"}
              className="w-full shrink-0 justify-between"
              disabled={disabled}
              onClick={() => onSelect(item.id)}
              title={item.errorTitle}
            >
              <span className="min-w-0 truncate text-left">{item.label}</span>
              {item.errorTitle ? (
                <CircleAlert className="ml-2 shrink-0 text-destructive-muted" aria-hidden="true" />
              ) : null}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full shrink-0"
          disabled={disabled}
          onClick={onAdd}
        >
          {addLabel}
        </Button>
      </aside>
      <div className="min-h-0 min-w-0 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

export function SettingsListEditorCard({
  title,
  description,
  disabled,
  onDelete,
  children,
}: {
  title: string;
  description: ReactNode;
  disabled: boolean;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </div>
      {children}
    </div>
  );
}

export function SettingsListEditorEmptyState({
  title,
  children,
  addLabel,
  disabled,
  onAdd,
}: {
  title: string;
  children: ReactNode;
  addLabel: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-border bg-card p-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-4">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {children}
        <Button type="button" disabled={disabled} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

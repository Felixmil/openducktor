import { ArrowUpRightFromSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OpenTaskDetailsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto shrink-0 gap-1 rounded-md border border-transparent px-1.5 py-0 text-[11px] font-normal text-muted-foreground transition hover:border-border hover:bg-muted hover:text-muted-foreground"
      title="Open task details"
      aria-label="Open task details"
      onClick={onClick}
    >
      <ArrowUpRightFromSquare className="size-3" />
      Open
    </Button>
  );
}

import type { ComponentProps, ReactNode, Ref } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { studioTabLabelClassName } from "./studio-tab-styles";

export function StudioTabTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        studioTabLabelClassName,
        "data-[state=active]:bg-transparent data-[state=active]:text-inherit data-[state=active]:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function StudioTabsList(props: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      {...props}
      className="h-auto min-h-8 w-max justify-start gap-1 rounded-none bg-transparent p-0"
    />
  );
}

export function StudioTabStrip({
  children,
  createAction,
  actions,
  scrollRef,
}: {
  children: ReactNode;
  createAction: ReactNode;
  actions?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="agent-studio-titlebar-safe-area electron-titlebar-safe-area shrink-0 bg-studio-chrome px-2 pb-0">
      <div className="flex min-w-0 items-center gap-1 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <div ref={scrollRef} className="hide-scrollbar min-w-0 max-w-full overflow-x-auto pt-0.5">
            <div className="inline-flex h-8 min-w-max items-center gap-1 pl-1">{children}</div>
          </div>
          {createAction}
        </div>
        {actions}
      </div>
    </div>
  );
}

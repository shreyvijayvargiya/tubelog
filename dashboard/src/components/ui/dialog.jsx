import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, X } from "lucide-react";
import { cn } from "../../lib/utils.js";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[min(90vh,760px)] w-[min(100%-1.5rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn("mb-4 space-y-1 pr-6", className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export const Sheet = DialogPrimitive.Root;

export function SheetContent({ className, side = "right", children, ...props }) {
  const position =
    side === "left"
      ? "bottom-2 left-2 top-2 w-72 rounded-2xl border"
      : "bottom-2 right-2 top-2 w-[min(100%-1rem,48rem)] rounded-2xl border sm:w-[min(48vw,48rem)]";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn("fixed z-50 flex flex-col overflow-hidden bg-background text-foreground shadow-lg", position, className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const Checkbox = function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3 w-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
};

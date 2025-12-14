// Frontend/src/components/ui/unified-modal.tsx
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const modalSizes: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-7xl",
  full: "max-w-[95vw] h-[95vh]",
};

interface UnifiedModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
}

export const UnifiedModal = ({
  isOpen,
  onOpenChange,
  children,
  className,
  size = "md",
}: UnifiedModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          modalSizes[size],
          className
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
};

export { DialogHeader, DialogTitle, DialogDescription, DialogFooter };
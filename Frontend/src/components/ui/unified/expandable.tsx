// Complete fixed solution with all components

// Frontend/src/components/ui/unified-expandable.tsx
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnifiedExpandableProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

export const UnifiedExpandable = ({
  trigger,
  children,
  className,
  defaultOpen = false,
}: UnifiedExpandableProps) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("border-b overflow-visible", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left font-semibold"
      >
        {trigger}
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 transition-transform duration-300",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{ overflowY: "visible", overflowX: "visible" }}
          >
            <div className="pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
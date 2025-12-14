import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UnifiedBackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Standardized back button for all pages
 * Always positioned top-left with consistent icon + label
 */
export const UnifiedBackButton: React.FC<UnifiedBackButtonProps> = ({
  onClick,
  label = 'Back',
  className,
  disabled = false,
}) => {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "gap-2 font-medium",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
};

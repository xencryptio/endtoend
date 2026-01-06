import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  show: boolean;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmModalProps> = ({
  show,
  title,
  message,
  type = 'info',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  const typeColors: Record<string, string> = {
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
    info: 'bg-primary text-primary-foreground hover:bg-primary/90',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    danger: <AlertTriangle className="w-6 h-6 text-destructive" />,
    warning: <AlertCircle className="w-6 h-6 text-warning" />,
    info: <AlertCircle className="w-6 h-6 text-primary" />,
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-background border rounded-lg shadow-2xl max-w-md w-full p-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0">{typeIcons[type]}</div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
            <Button className={typeColors[type]} onClick={() => { onConfirm(); onCancel(); }}>{confirmLabel}</Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConfirmationModal;

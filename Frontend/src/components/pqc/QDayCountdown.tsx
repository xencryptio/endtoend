import { motion } from "framer-motion";
import { Calendar, AlertTriangle } from "lucide-react";

interface QDayCountdownProps {
  estimatedDate?: Date;
}

export default function QDayCountdown({ estimatedDate }: QDayCountdownProps) {
  // Estimated Q-Day: ~2029-2035 (using 2030 as mid-estimate)
  const qDay = estimatedDate || new Date('2030-01-01');
  const today = new Date();
  const diffTime = Math.abs(qDay.getTime() - today.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);

  // Urgency level based on time remaining
  const urgency = diffDays < 730 ? 'critical' : diffDays < 1825 ? 'high' : 'moderate';
  const urgencyColors = {
    critical: 'from-red-500 to-orange-500',
    high: 'from-orange-500 to-amber-500',
    moderate: 'from-amber-500 to-yellow-500'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-card/80 p-6 shadow-lg"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }} />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${urgencyColors[urgency]}`}>
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Q-Day Countdown</h3>
              <p className="text-xs text-muted-foreground">Estimated Quantum Threat</p>
            </div>
          </div>
          {urgency === 'critical' && (
            <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
          )}
        </div>

        {/* Countdown Display */}
        <div className="flex items-end gap-3 mb-3">
          <div className="text-5xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            {diffDays.toLocaleString()}
          </div>
          <div className="mb-2 text-muted-foreground font-medium">
            days
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="font-semibold text-foreground">{years}</span>
            <span className="text-muted-foreground ml-1">years</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div>
            <span className="font-semibold text-foreground">{months}</span>
            <span className="text-muted-foreground ml-1">months</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Migration Timeline</span>
            <span className="font-medium text-foreground">
              {urgency === 'critical' ? 'Urgent' : urgency === 'high' ? 'High Priority' : 'Plan Ahead'}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, ((5 * 365 - diffDays) / (5 * 365)) * 100)}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={`h-full bg-gradient-to-r ${urgencyColors[urgency]}`}
            />
          </div>
        </div>

        {/* Info Text */}
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          Estimated time until quantum computers can break current encryption. 
          NIST recommends migration by 2030.
        </p>
      </div>
    </motion.div>
  );
}

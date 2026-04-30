import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface MigrationPath {
  from: string;
  to: string;
  progress: number;
  completed: number;
  total: number;
  status: 'completed' | 'in-progress' | 'planned' | 'not-started';
}

interface AlgorithmMigrationBoardProps {
  migrations?: MigrationPath[];
}

export default function AlgorithmMigrationBoard({ migrations }: AlgorithmMigrationBoardProps) {
  const defaultMigrations: MigrationPath[] = [
    { from: 'RSA-2048/3072', to: 'ML-KEM-768/1024', progress: 75, completed: 6, total: 8, status: 'in-progress' },
    { from: 'ECDSA P-256', to: 'ML-DSA-65/87', progress: 40, completed: 4, total: 10, status: 'in-progress' },
    { from: 'ECDH P-256', to: 'X25519MLKEM768', progress: 85, completed: 11, total: 13, status: 'in-progress' },
    { from: 'SHA-256', to: 'SHA-3-256', progress: 100, completed: 15, total: 15, status: 'completed' }
  ];

  const paths = migrations || defaultMigrations;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'in-progress': return <Clock className="w-4 h-4 text-amber-500 animate-pulse" />;
      case 'planned': return <AlertCircle className="w-4 h-4 text-blue-500" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'from-emerald-500 to-emerald-600';
      case 'in-progress': return 'from-amber-500 to-amber-600';
      case 'planned': return 'from-blue-500 to-blue-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-border bg-card p-6 shadow-lg"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Algorithm Migration Status</h3>
        <p className="text-sm text-muted-foreground mt-1">Classical → Post-Quantum transition progress</p>
      </div>

      {/* Migration Paths */}
      <div className="space-y-4">
        {paths.map((path, idx) => (
          <motion.div
            key={`${path.from}-${path.to}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + idx * 0.1 }}
            className="group"
          >
            {/* Path Header */}
            <div className="flex items-center gap-3 mb-2">
              {getStatusIcon(path.status)}
              <div className="flex items-center gap-2 flex-1">
                <span className="px-3 py-1 text-sm font-mono bg-red-500/10 text-red-700 dark:text-red-300 rounded border border-red-500/20">
                  {path.from}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <span className="px-3 py-1 text-sm font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-500/20">
                  {path.to}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-foreground">{path.completed}/{path.total}</div>
                <div className="text-xs text-muted-foreground">apps</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative">
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${path.progress}%` }}
                  transition={{ duration: 1, delay: 0.5 + idx * 0.1, ease: "easeOut" }}
                  className={`h-full bg-gradient-to-r ${getStatusColor(path.status)} relative`}
                >
                  {/* Shimmer Effect */}
                  {path.status === 'in-progress' && (
                    <div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                      style={{
                        animation: 'shimmer 2s infinite',
                        backgroundSize: '200% 100%'
                      }}
                    />
                  )}
                </motion.div>
              </div>
              
              {/* Progress Label */}
              <div className="absolute -top-6 right-0 text-xs font-medium text-foreground">
                {path.progress}%
              </div>
            </div>

            {/* Status Label */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground capitalize">{path.status.replace('-', ' ')}</span>
              {path.status === 'completed' && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Complete</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {paths.filter(p => p.status === 'completed').length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Completed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {paths.filter(p => p.status === 'in-progress').length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">In Progress</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-muted-foreground">
              {paths.reduce((sum, p) => sum + p.completed, 0)}/{paths.reduce((sum, p) => sum + p.total, 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total Apps</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </motion.div>
  );
}

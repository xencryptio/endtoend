import { motion } from "framer-motion";
import { Shield, TrendingUp } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface HybridCryptoGaugeProps {
  adoptionPercent: number;
  totalApps: number;
  hybridApps: number;
}

export default function HybridCryptoGauge({ 
  adoptionPercent, 
  totalApps, 
  hybridApps 
}: HybridCryptoGaugeProps) {
  const percentage = Math.round(adoptionPercent);
  const remaining = 100 - percentage;

  // Color based on adoption level
  const getColor = (pct: number) => {
    if (pct >= 80) return { from: '#10b981', to: '#059669', label: 'Excellent' };
    if (pct >= 60) return { from: '#f59e0b', to: '#d97706', label: 'Good' };
    if (pct >= 40) return { from: '#f97316', to: '#ea580c', label: 'Fair' };
    return { from: '#ef4444', to: '#dc2626', label: 'Poor' };
  };

  const colorScheme = getColor(percentage);
  
  const data = [
    { name: 'Hybrid', value: percentage },
    { name: 'Classical', value: remaining }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-lg"
    >
      {/* Background Gradient */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          background: `linear-gradient(135deg, ${colorScheme.from} 0%, ${colorScheme.to} 100%)`
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div 
              className="p-2 rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${colorScheme.from}, ${colorScheme.to})`
              }}
            >
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Hybrid Crypto Adoption</h3>
              <p className="text-xs text-muted-foreground">ML-KEM/Kyber Support</p>
            </div>
          </div>
          {percentage >= 60 && (
            <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
              <span>{colorScheme.label}</span>
            </div>
          )}
        </div>

        {/* Gauge Chart */}
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                >
                  <Cell fill={colorScheme.from} />
                  <Cell fill="hsl(var(--muted))" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold text-foreground">{percentage}%</div>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            {/* Stats */}
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Hybrid Ready</span>
              <span className="text-sm font-semibold text-foreground">{hybridApps} apps</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Classical Only</span>
              <span className="text-sm font-semibold text-foreground">{totalApps - hybridApps} apps</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-semibold text-foreground">{totalApps} apps</span>
            </div>
          </div>
        </div>

        {/* Algorithm Details */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <h4 className="text-xs font-medium text-foreground mb-2">Supported Algorithms</h4>
          <div className="flex flex-wrap gap-2">
            {['X25519MLKEM768', 'X25519Kyber768', 'SecP256r1MLKEM768'].map((alg) => (
              <span 
                key={alg}
                className="px-2 py-1 text-xs font-mono bg-background border border-border rounded text-foreground"
              >
                {alg}
              </span>
            ))}
          </div>
        </div>

        {/* Info */}
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          Hybrid cryptography combines classical and post-quantum algorithms for immediate quantum resistance.
        </p>
      </div>
    </motion.div>
  );
}

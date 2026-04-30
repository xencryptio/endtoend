import { motion } from "framer-motion";
import { Building2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SubOrgRisk {
  id: string;
  name: string;
  appsCount: number;
  avgPqcScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Very High';
  vulnerabilities: number;
}

interface QuantumThreatHeatmapProps {
  subOrgs: SubOrgRisk[];
}

export default function QuantumThreatHeatmap({ subOrgs }: QuantumThreatHeatmapProps) {
  const navigate = useNavigate();

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return { bg: 'from-emerald-500 to-emerald-600', text: 'text-emerald-700 dark:text-emerald-300', icon: '🟢' };
      case 'Medium': return { bg: 'from-amber-500 to-amber-600', text: 'text-amber-700 dark:text-amber-300', icon: '🟡' };
      case 'High': return { bg: 'from-orange-500 to-orange-600', text: 'text-orange-700 dark:text-orange-300', icon: '🟠' };
      case 'Very High': return { bg: 'from-red-500 to-red-600', text: 'text-red-700 dark:text-red-300', icon: '🔴' };
      default: return { bg: 'from-gray-500 to-gray-600', text: 'text-gray-700 dark:text-gray-300', icon: '⚪' };
    }
  };

  const getRiskIntensity = (score: number) => {
    if (score >= 80) return 0.2;
    if (score >= 60) return 0.4;
    if (score >= 40) return 0.6;
    return 0.8;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl border border-border bg-card p-6 shadow-lg"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Quantum Threat Heatmap</h3>
        <p className="text-sm text-muted-foreground mt-1">Risk distribution across sub-organizations</p>
      </div>

      {/* Heatmap Grid */}
      <div className="space-y-3">
        {subOrgs.map((suborg, idx) => {
          const colors = getRiskColor(suborg.riskLevel);
          const intensity = getRiskIntensity(suborg.avgPqcScore);

          return (
            <motion.div
              key={suborg.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + idx * 0.1 }}
              onClick={() => navigate(`/suborg/${suborg.id}`)}
              className="group relative overflow-hidden rounded-xl border border-border bg-card hover:bg-accent transition-all cursor-pointer"
            >
              {/* Background Heat Effect */}
              <div 
                className={`absolute inset-0 bg-gradient-to-r ${colors.bg}`}
                style={{ opacity: intensity }}
              />

              {/* Content */}
              <div className="relative p-4 flex items-center gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 p-3 rounded-lg bg-background/80 backdrop-blur-sm">
                  <Building2 className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {suborg.name}
                    </h4>
                    <span className="text-lg">{colors.icon}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{suborg.appsCount} apps</span>
                    <span>•</span>
                    <span>{suborg.vulnerabilities} vulnerabilities</span>
                  </div>
                </div>

                {/* Score & Risk */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${colors.text}`}>
                      {Math.round(suborg.avgPqcScore)}
                    </div>
                    <div className="text-xs text-muted-foreground">PQC Score</div>
                  </div>
                  
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${colors.text} bg-background/80 backdrop-blur-sm border border-border`}>
                    {suborg.riskLevel}
                  </div>

                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                </div>
              </div>

              {/* Bottom Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${suborg.avgPqcScore}%` }}
                  transition={{ duration: 1, delay: 0.6 + idx * 0.1 }}
                  className={`h-full bg-gradient-to-r ${colors.bg}`}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h4 className="text-xs font-medium text-foreground mb-3">Risk Levels</h4>
        <div className="grid grid-cols-4 gap-3">
          {[
            { level: 'Low', range: '80-100', icon: '🟢' },
            { level: 'Medium', range: '60-79', icon: '🟡' },
            { level: 'High', range: '40-59', icon: '🟠' },
            { level: 'Very High', range: '0-39', icon: '🔴' }
          ].map((item) => (
            <div key={item.level} className="text-center">
              <div className="text-lg mb-1">{item.icon}</div>
              <div className="text-xs font-medium text-foreground">{item.level}</div>
              <div className="text-xs text-muted-foreground">{item.range}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

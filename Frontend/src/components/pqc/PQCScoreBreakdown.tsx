import { motion } from "framer-motion";
import { Key, FileSignature, Lock, Hash } from "lucide-react";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";

interface ComponentScore {
  component: string;
  score: number;
  weight: number;
  icon: React.ElementType;
}

interface PQCScoreBreakdownProps {
  kexScore: number;
  signatureScore: number;
  symmetricScore: number;
  hashScore: number;
  overallScore: number;
}

export default function PQCScoreBreakdown({
  kexScore = 75,
  signatureScore = 65,
  symmetricScore = 85,
  hashScore = 90,
  overallScore = 78
}: PQCScoreBreakdownProps) {
  const components: ComponentScore[] = [
    { component: 'KEX', score: kexScore, weight: 40, icon: Key },
    { component: 'Signature', score: signatureScore, weight: 20, icon: FileSignature },
    { component: 'Symmetric', score: symmetricScore, weight: 25, icon: Lock },
    { component: 'Hash', score: hashScore, weight: 15, icon: Hash }
  ];

  const radarData = components.map(c => ({
    component: c.component,
    score: c.score,
    fullMark: 100
  }));

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'from-emerald-500/20 to-emerald-500/10';
    if (score >= 60) return 'from-amber-500/20 to-amber-500/10';
    if (score >= 40) return 'from-orange-500/20 to-orange-500/10';
    return 'from-red-500/20 to-red-500/10';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-lg"
    >
      <div className="relative">
        {/* Header */}
        <div className="mb-4">
          <h3 className="font-semibold text-foreground">PQC Score Breakdown</h3>
          <p className="text-xs text-muted-foreground">Component-level analysis</p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Overall Score */}
          <div className="col-span-2 flex items-center justify-center">
            <div className={`relative w-32 h-32 rounded-full bg-gradient-to-br ${getScoreBg(overallScore)} flex items-center justify-center`}>
              <div className="text-center">
                <div className={`text-4xl font-bold ${getScoreColor(overallScore)}`}>
                  {Math.round(overallScore)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Overall</div>
              </div>
            </div>
          </div>

          {/* Radar Chart */}
          <div className="col-span-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis 
                  dataKey="component" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                />
                <Radar 
                  name="Score" 
                  dataKey="score" 
                  stroke="#8b5cf6" 
                  fill="#8b5cf6" 
                  fillOpacity={0.6} 
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Component Details */}
          <div className="col-span-2 space-y-3">
            {components.map((comp, idx) => (
              <motion.div
                key={comp.component}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-lg bg-background">
                  <comp.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{comp.component}</span>
                    <span className={`text-sm font-semibold ${getScoreColor(comp.score)}`}>
                      {Math.round(comp.score)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${comp.score}%` }}
                        transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                        className={`h-full bg-gradient-to-r ${comp.score >= 80 ? 'from-emerald-500 to-emerald-600' : comp.score >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{comp.weight}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Weights:</strong> KEX (40%), Symmetric (25%), Signature (20%), Hash (15%). 
            Higher weights indicate greater impact on quantum vulnerability.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

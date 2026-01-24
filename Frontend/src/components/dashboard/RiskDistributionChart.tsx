import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { motion } from "framer-motion";

interface RiskDistributionChartProps {
  data: {
    Low: number;
    Medium: number;
    High: number;
    "Very High": number;
  };
}

const COLORS = {
  Low: "#10b981",      // green-500
  Medium: "#f59e0b",   // amber-500
  High: "#f97316",     // orange-500
  "Very High": "#ef4444" // red-500
};

export function RiskDistributionChart({ data }: RiskDistributionChartProps) {
  const chartData = [
    { name: "Low", value: data.Low, color: COLORS.Low },
    { name: "Medium", value: data.Medium, color: COLORS.Medium },
    { name: "High", value: data.High, color: COLORS.High },
    { name: "Very High", value: data["Very High"], color: COLORS["Very High"] }
  ].filter(item => item.value > 0); // Only show non-zero values

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No risk data available
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full h-64"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

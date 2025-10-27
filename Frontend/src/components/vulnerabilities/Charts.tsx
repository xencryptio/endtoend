import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { AlgorithmData, TypeDistribution } from "./types";

const COLORS = ['#2563eb', '#dc2626', '#ea580c', '#16a34a', '#7c3aed', '#0891b2'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border rounded p-2 shadow text-sm">
        <p className="font-medium">{payload[0].payload.name}</p>
        <p className="text-muted-foreground">Usage: {payload[0].value}</p>
      </div>
    );
  }
  return null;
};

interface ChartsProps {
  typeDistribution: TypeDistribution[];
  algorithmsData: AlgorithmData[];
}

export function Charts({ typeDistribution, algorithmsData }: ChartsProps) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
      <Card className="w-full">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Algorithm Type Distribution</CardTitle>
          <CardDescription className="text-sm">Distribution of algorithm types from backend</CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <div className="w-full h-[250px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={typeof window !== 'undefined' && window.innerWidth < 640 ? 60 : 80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {typeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full border-primary/20 hover:shadow-lg transition-all duration-300">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Algorithm Usage</CardTitle>
          <CardDescription className="text-sm">Usage instances from backend data</CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <div className="w-full h-[250px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={algorithmsData} margin={{ bottom: 60, left: 10, right: 10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  fontSize={10}
                  interval={0}
                />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {algorithmsData.map((entry, index) => {
                    const isHovered = hoveredBar === index;
                    const fillColor = isHovered ? "#1e40af" : "#2563eb"; // Hover vs normal blue
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={fillColor}
                        onMouseEnter={() => setHoveredBar(index)}
                        onMouseLeave={() => setHoveredBar(null)}
                        style={{
                          transform: isHovered ? "scaleY(1.1)" : "scaleY(1)",
                          transformOrigin: "bottom",
                          transition: "transform 0.2s ease-in-out",
                        }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
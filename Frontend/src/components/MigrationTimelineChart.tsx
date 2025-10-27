import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

interface CSVData {
  current_date: string;
  total_algorithms: number;
  total_certificates: number;
  total_pqc_vulnerable_certificates: number;
  total_pqc_vulnerable_algorithms: number;
  cert_changes: number;
  alg_changes: number;
}

interface Props {
  data: CSVData[];
}

type ChartPoint = {
  name: string;
  migrationProgress: number;
  assetsCompleted: number;
};

export const MigrationTimelineChart: React.FC<Props> = ({ data }) => {
  const chartData: ChartPoint[] = useMemo(() => {
    const monthlyData: { [key: string]: ChartPoint } = {};

    data.forEach(app => {
      const [day, month, year] = app.current_date.split("-");
      const key = `${new Date(`${year}-${month}-01`).toLocaleString("default", {
        month: "short"
      })} ${year}`;

      const migrationProgress =
        app.total_pqc_vulnerable_certificates +
        app.total_pqc_vulnerable_algorithms -
        app.cert_changes -
        app.alg_changes;

      const assetsCompleted = app.total_algorithms + app.total_certificates;

      if (!monthlyData[key]) {
        monthlyData[key] = {
          name: key,
          migrationProgress: 0,
          assetsCompleted: 0
        };
      }

      monthlyData[key].migrationProgress += Math.max(0, migrationProgress);
      monthlyData[key].assetsCompleted += assetsCompleted;
    });

    return Object.values(monthlyData).sort(
      (a, b) => new Date(a.name).getTime() - new Date(b.name).getTime()
    );
  }, [data]);

  return (
    <div className="p-4 rounded-xl shadow-lg border bg-white">
      <h2 className="text-lg font-semibold mb-1">Migration Timeline</h2>
      <p className="text-sm text-muted-foreground mb-2">
        Overall progress over time
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, 600]} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="migrationProgress"
            stroke="#3b82f6"
            strokeWidth={2}
            name="Migration Progress"
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="assetsCompleted"
            stroke="#34d399"
            strokeWidth={2}
            name="Assets Completed"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

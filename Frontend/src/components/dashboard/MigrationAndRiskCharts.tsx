// components/Charts/MigrationAndRiskCharts.tsx

import React from "react";
import ReactECharts from "echarts-for-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { TrendingUp as TrendingUpIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

interface MigrationAndRiskChartsProps {
  vulnerabilityByQuarter: { name: string; algorithms: number; certificates: number }[];
  riskChartData: { name: string; count: number }[];
  assetDistributionData: { name: string; value: number; fill: string }[];
  applicationsByQuarter?: { name: string; count: number }[];
}

const MigrationAndRiskCharts: React.FC<MigrationAndRiskChartsProps> = ({
  vulnerabilityByQuarter,
  riskChartData,
  assetDistributionData = [],
  applicationsByQuarter = [],
}) => {
  const { theme } = useTheme();
  const axisLabelColor = theme === "dark" ? "#ddd" : "#333";

  const colorMap: Record<string, string> = {
    Low: "#2cbe7eff",
    Medium: "#FFD700",
    High: "#FF8C00",
    "Very High": "#d41919e9",
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.1 } },
      }}
    >
      {/* Migration Timeline Chart - Fixed */}
      <motion.div variants={cardVariants}>
        <Card className="shadow-sm rounded-xl border bg-card text-card-foreground h-full">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Vulnerabilities by Migration Quarter
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <ReactECharts
              option={{
                tooltip: {
                  trigger: "axis",
                  axisPointer: { type: "shadow" },
                },
                legend: {
                  data: ["Algorithms", "Certificates"],
                  top: 0,
                  textStyle: {
                    color: axisLabelColor, // use the same color adapting to theme
                  },
                },
                grid: {
                  left: "3%",
                  right: "4%",
                  bottom: "3%",
                  containLabel: true,
                },
                xAxis: {
                  type: "category",
                  data: vulnerabilityByQuarter.map((item) => item.name),
                  axisLabel: {
                    color: axisLabelColor,
                  },
                },
                yAxis: {
                  type: "value",
                  axisLabel: {
                    color: axisLabelColor,
                  },
                },
                series: [
                  {
                    name: "Algorithms",
                    type: "bar",
                    data: vulnerabilityByQuarter.map((item) => item.algorithms),
                  },
                  {
                    name: "Certificates",
                    type: "bar",
                    data: vulnerabilityByQuarter.map((item) => item.certificates),
                  },
                ],
              }}
              style={{ height: "350px", width: "100%" }}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Risk Level Distribution Chart */}
      <motion.div variants={cardVariants}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <TrendingUpIcon className="h-5 w-5" />
              Risk Level Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <ReactECharts
              option={{
                tooltip: {
                  trigger: "axis",
                  axisPointer: { type: "shadow" },
                },
                legend: {
                  data: Object.keys(colorMap),
                  top: 0,
                  textStyle: { color: axisLabelColor },
                },
                grid: {
                  left: "3%",
                  right: "4%",
                  bottom: "3%",
                  containLabel: true,
                },
                xAxis: {
                  type: "category",
                  data: riskChartData.map((item) => item.name),
                  axisLabel: { color: axisLabelColor },
                },
                yAxis: {
                  type: "value",
                  axisLabel: { color: axisLabelColor },
                },
                series: [
                  {
                    name: "Count",
                    type: "bar",
                    data: riskChartData.map((item) => ({
                      value: item.count,
                      itemStyle: {
                        color: colorMap[item.name],
                      },
                    })),
                    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
                  },
                ],
              }}
              style={{ height: "350px", width: "100%" }}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Asset Distribution Radial Chart */}
      <motion.div variants={cardVariants}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Asset Type Distribution
            </CardTitle>
            <CardDescription>Breakdown of assets by type</CardDescription>
          </CardHeader>
          <CardContent className="py-6">
            <ReactECharts
              option={{
                tooltip: {
                  trigger: "item",
                  formatter: (params: { name: string; value: number; percent: number }) =>
                    `Asset Type<br/>${params.name}: ${params.value} (${params.percent}%)`,
                },
                legend: {
                  orient: "vertical",
                  left: 10,
                  data: assetDistributionData.map((item) => item.name),
                  textStyle: { color: axisLabelColor },
                },
                series: [
                  {
                    name: "Asset Type",
                    type: "pie",
                    radius: ["50%", "70%"],
                    avoidLabelOverlap: false,
                    label: { show: false, position: "center" },
                    emphasis: {
                      label: { show: true, fontSize: "24", fontWeight: "bold" },
                    },
                    labelLine: { show: false },
                    data: assetDistributionData.map(item => ({
                      ...item,
                      itemStyle: { color: item.fill }
                    })),
                  },
                ],
              }}
              style={{ height: "350px", width: "100%" }}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Applications by Quarter Chart - Fixed */}
      <motion.div variants={cardVariants}>
        <Card className="shadow-sm rounded-xl border bg-card text-card-foreground h-full">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Migration Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <ReactECharts
              option={{
                tooltip: {
                  trigger: "axis",
                },
                xAxis: {
                  type: "category",
                  data: applicationsByQuarter.map((d) => d.name),
                  axisLabel: {
                    color: axisLabelColor,
                  },
                },
                yAxis: {
                  type: "value",
                  name: "Applications",
                  axisLabel: {
                    color: axisLabelColor,
                  },
                },
                series: [
                  {
                    name: "Applications",
                    type: "line",
                    smooth: false,
                    data: applicationsByQuarter.map((d) => d.count),
                  },
                ],
              }}
              style={{ height: "350px", width: "100%" }}
            />
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default MigrationAndRiskCharts;
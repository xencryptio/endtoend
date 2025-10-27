// frontend/src/components/OrganizationalRiskChart.tsx

import React from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface AppData {
  application: string;
  risk_level: "Low" | "Medium" | "High" | "Very High";
  "Sub Org": string;
}

interface Props {
  data: AppData[];
}

const centerColor = "#E2DFF0";  // Slightly dark glassy gray center

const subOrgColorMap = [
  "#A5D6A7",  // Soft Green-Grey — complements Low
  "#FFF176",  // Pale Yellow — pairs smoothly with Medium
  "#FFCC80",  // Light Orange — echoes High tone
  "#EF9A9A"   // Muted Red — aligns with Very High
];

const riskColors: Record<string, string> = {
  Low: "#81C784",        // Soft Green — safe & calming
  Medium: "#FFEB3B",     // Rich Yellow — caution but not alarming
  High: "#F57C00",       // Amber Orange — alert, getting risky
  "Very High": "#E53935" // Deep Red — critical, clearly dangerous
};







;

const OrganizationalRiskChart: React.FC<Props> = ({ data }) => {
  const subOrgMap: Record<string, { color: string; apps: { name: string; value: number; risk: string }[] }> = {};

  data.forEach((app, index) => {
    const subOrg = app["Sub Org"];
    if (!subOrgMap[subOrg]) {
      subOrgMap[subOrg] = {
        color: subOrgColorMap[index % subOrgColorMap.length],
        apps: []
      };
    }
    subOrgMap[subOrg].apps.push({
      name: app.application,
      value: 1,
      risk: app.risk_level
    });
  });

  const chartData = [
    {
      name: "Amazon",
      itemStyle: { color: centerColor },
      children: Object.entries(subOrgMap).map(([subOrgName, info]) => ({
        name: subOrgName,
        itemStyle: { color: info.color },
        children: info.apps.map(app => ({
          name: app.name,
          value: app.value,
          itemStyle: { color: riskColors[app.risk] }
        }))
      }))
    }
  ];

  const chartOptions = {
  series: {
    type: "sunburst",
    center: ["50%", "50%"],  // Always center the chart
    radius: [0, "90%"],      // Limit to 90% to avoid overflow
    sort: null,
    highlightPolicy: "ancestor",
    nodeClick: "rootToNode", // Ensures drill-down and reset work well
    animation: "auto",
    animationDurationUpdate: 500,
    emphasis: {
      focus: "ancestor",
      itemStyle: {
        borderColor: "#000",
        borderWidth: 2
      }
    },
    data: chartData,
    levels: [
      {
        itemStyle: {
          borderWidth: 0,
          gapWidth: 0
        }
      },
      {
        r0: "0%",
        r: "25%",
        label: {
          rotate: 0,
          color: "#000",
          fontWeight: "bold",
          fontSize: 14,
          overflow: "truncate"
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: "#fff"
        }
      },
      {
        r0: "25%",
        r: "60%",
        label: {
          rotate: "radial",
          color: "#000",
          fontSize: 12,
          overflow: "truncate"
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: "#fff"
        }
      },
      {
        r0: "60%",
        r: "90%",
        label: {
          rotate: "tangential",
          fontSize: 11,
          color: "#000",
          overflow: "truncate"
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: "#fff",
          shadowBlur: 6,
          shadowColor: "rgba(0, 0, 0, 0.2)"
        }
      }
    ],
    label: {
      show: true,
      formatter: "{b}",
      overflow: "truncate"
    },
    tooltip: {
      formatter: function (info: any) {
        const path = info.treePathInfo.map((x: any) => x.name).join(" → ");
        return `<strong>${path}</strong><br/>Value: ${info.value || 0}`;
      }
    }
  }
};


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">
          Organizational Risk Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[650px]">
          <ReactECharts option={chartOptions} style={{ height: "100%" }} />
        </div>
      </CardContent>
    </Card>
  );
};

export default OrganizationalRiskChart;

//import OrganizationalRiskChart from "@/components/OrganizationalRiskChart";
//{/* Sunburst Chart */}
  //    <OrganizationalRiskChart data={data} />
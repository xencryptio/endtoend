// utils/dashboardUtils.ts
import { CSVData, GroupedData } from "../types/dashboardTypes";

export function generateTimelineChart(apps: CSVData[]) {
  const quarterMap: Record<string, { certs: number; algos: number }> = {};

  apps.forEach((app) => {
    const qtr = app.status;
    if (!quarterMap[qtr]) {
      quarterMap[qtr] = { certs: 0, algos: 0 };
    }
    quarterMap[qtr].certs += app.total_pqc_vulnerable_certificates;
    quarterMap[qtr].algos += app.total_pqc_vulnerable_algorithms;
  });

  const sortedQuarters = Object.keys(quarterMap).sort((a, b) => {
    const [qA, yA] = a.split(" ");
    const [qB, yB] = b.split(" ");
    const quarterOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    return +yA === +yB ? quarterOrder[qA] - quarterOrder[qB] : +yA - +yB;
  });

  const certData = sortedQuarters.map((q) => quarterMap[q].certs);
  const algoData = sortedQuarters.map((q) => quarterMap[q].algos);

  return {
    title: {
      text: "Migration Timeline",
      subtext: "Remaining vulnerable items over time",
      left: "left",
      textStyle: {
        color: "var(--card-foreground)",
        fontWeight: "600",
        fontSize: 16,
      },
      subtextStyle: {
        color: "var(--muted-foreground)",
        fontSize: 12,
      },
    },
    tooltip: { trigger: "axis" },
    legend: {
      data: ["Remaining Vulnerable Certificates", "Remaining Vulnerable Algorithms"],
      bottom: 0,
      textStyle: { color: "var(--card-foreground)" },
    },
    grid: { top: 60, left: 50, right: 30, bottom: 50 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: sortedQuarters,
      axisLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--foreground)" },
      splitLine: {
        show: true,
        lineStyle: {
          type: "dotted",
          width: 1,
          color: "rgba(80, 80, 80, 0.4)",
        },
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--foreground)" },
      splitLine: {
        show: true,
        lineStyle: {
          type: "dotted",
          width: 1,
          color: "rgba(80, 80, 80, 0.4)",
        },
      },
    },
    series: [
      {
        name: "Remaining Vulnerable Certificates",
        type: "line",
        data: certData,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "#2563eb" },
        lineStyle: { width: 2, color: "#2563eb" },
        smooth: true,
      },
      {
        name: "Remaining Vulnerable Algorithms",
        type: "line",
        data: algoData,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "#10b981" },
        lineStyle: { width: 2, color: "#10b981" },
        smooth: true,
      },
    ],
  };
}

export function groupDataBySubOrg(data: CSVData[]): GroupedData[] {
  return Object.values(
    data.reduce((acc: Record<string, GroupedData>, app) => {
      const subOrg = app["Sub Org"];
      const vulnerabilityCount =
        (app.total_pqc_vulnerable_certificates || 0) +
        (app.total_pqc_vulnerable_algorithms || 0) -
        (app.cert_changes || 0) -
        (app.alg_changes || 0);

      if (!acc[subOrg]) {
        acc[subOrg] = {
          subOrg,
          avgPqcReady: 0,
          avgVulnerabilities: 0,
          mostCommonStatus: "",
          riskDistribution: {},
          apps: [],
        };
      }

      acc[subOrg].apps.push({ ...app, vulnerabilities: vulnerabilityCount });
      return acc;
    }, {})
  ).map((group) => {
    const totalApps = group.apps.length;
    const statusCount: Record<string, number> = {};
    const riskCount: Record<string, number> = {};

    group.avgPqcReady = group.apps.reduce((sum, a) => sum + a.pqc_ready, 0) / totalApps;
    group.avgVulnerabilities = group.apps.reduce((sum, a) => sum + a.vulnerabilities, 0) / totalApps;

    group.apps.forEach((app) => {
      statusCount[app.status] = (statusCount[app.status] || 0) + 1;
      riskCount[app.risk_level] = (riskCount[app.risk_level] || 0) + 1;
    });

    group.mostCommonStatus = Object.entries(statusCount).sort((a, b) => b[1] - a[1])[0][0];
    group.riskDistribution = riskCount;

    return group;
  });
}

export function getRiskChartData(data: CSVData[]) {
  return ["Low", "Medium", "High", "Very High"].map((risk) => ({
    name: risk, // ✅ no " Risk" suffix
    count: data.filter((a) => a.risk_level === risk).length,
  }));
}

export function getAssetDistributionData(data: CSVData[]) {
  const categoryCount: Record<string, number> = {};

  data.forEach((entry) => {
    const cat = entry["App Category"] || "Unknown";
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const colors = ["#66ccff", "#ffcc66", "#99cc33", "#cc66cc", "#ff6666"];

  return Object.entries(categoryCount).map(([name, value], index) => ({
    name,
    value,
    fill: colors[index % colors.length],
  }));
}

export function calculateMetrics(data: CSVData[]) {
  const totalApps = data.length;
  const avgPQC = totalApps ? data.reduce((sum, a) => sum + a.pqc_ready, 0) / totalApps : 0;
  const totalVulns = data.reduce(
    (sum, a) =>
      sum +
      (a.total_pqc_vulnerable_certificates +
        a.total_pqc_vulnerable_algorithms -
        a.cert_changes -
        a.alg_changes),
    0
  );
  const secureApps = data.filter((a) => a.pqc_ready >= 80).length;
  const totalAlgChanges = data.reduce((sum, a) => sum + a.alg_changes, 0);
  const totalCertChanges = data.reduce((sum, a) => sum + a.cert_changes, 0);
  const avgAlgPerApp = totalApps ? (totalAlgChanges / totalApps).toFixed(1) : "0.0";
  const avgCertPerApp = totalApps ? (totalCertChanges / totalApps).toFixed(1) : "0.0";

  return {
    totalApps,
    avgPQC,
    totalVulns,
    secureApps,
    totalAlgChanges,
    totalCertChanges,
    avgAlgPerApp,
    avgCertPerApp,
  };
}

export function calculateAvgMigration(applications: CSVData[]): number {
  if (!applications.length) return 0;

  let totalItems = 0; // total certs + algos across all apps
  let totalReadyItems = 0; // total PQC-ready certs + algos

  for (const app of applications) {
    const totalAppItems =
      app.total_pqc_vulnerable_certificates +
      app.total_pqc_vulnerable_algorithms;

    const readyAppItems =
      app.cert_changes + // upgraded certs
      app.alg_changes;   // upgraded algorithms

    totalItems += totalAppItems;
    totalReadyItems += readyAppItems;
  }

  // If there are no PQC-relevant items in the org, it's fully ready
  if (totalItems === 0) return 100;

  // Return readiness percentage (rounded to 1 decimal place)
  return Math.round((totalReadyItems / totalItems) * 1000) / 10;
}

export function calculateSubOrgReadiness(applications: CSVData[]): Record<string, number> {
  const subOrgMap: Record<string, { total: number; ready: number }> = {};

  for (const app of applications) {
    const subOrg = app["Sub Org"];
    const total =
      app.total_pqc_vulnerable_certificates +
      app.total_pqc_vulnerable_algorithms;
    const ready = app.cert_changes + app.alg_changes;

    if (!subOrgMap[subOrg]) {
      subOrgMap[subOrg] = { total: 0, ready: 0 };
    }

    subOrgMap[subOrg].total += total;
    subOrgMap[subOrg].ready += ready;
  }

  // Calculate percentage readiness per Sub Org
  const result: Record<string, number> = {};
  for (const subOrg in subOrgMap) {
    const { total, ready } = subOrgMap[subOrg];
    result[subOrg] = total === 0 ? 100 : Math.round((ready / total) * 1000) / 10;
  }

  return result;
}

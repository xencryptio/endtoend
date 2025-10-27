import { useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { transformApiDataToUnifiedFormat } from "@/components/vulnerabilities/utils";
import {
  RawApiData, UnifiedData, Vulnerability, AlgorithmData,
  SeverityCounts, PQCStats, TypeDistribution
} from "@/components/vulnerabilities/types";
import { LoadingSpinner, ErrorDisplay, EmptyState } from "@/components/vulnerabilities/StateDisplays";
import { PageHeader } from "@/components/vulnerabilities/PageHeader";
import { Charts } from "@/components/vulnerabilities/Charts";
import { AlgorithmsTable } from "@/components/vulnerabilities/AlgorithmsTable";
import { VulnerabilityCategoryTable } from "@/components/vulnerabilities/VulnerabilityCategoryTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Cpu,
  ShieldOff
} from "lucide-react";

const fetchVulnerabilities = async (): Promise<RawApiData[]> => {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/apps2`);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  const apiData = await response.json();
  if (!Array.isArray(apiData)) {
    throw new Error('API response is not an array');
  }
  return apiData;
};

export default function VulnerabilitiesPage() {
  const { data: rawData = [], error, isLoading, isFetching, refetch } = useQuery<RawApiData[], Error>({
    queryKey: ["vulnerabilities"],
    queryFn: fetchVulnerabilities,
  });

  // Transform raw API data to unified format
  const unifiedData: UnifiedData[] = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    return transformApiDataToUnifiedFormat(rawData);
  }, [rawData]);

  // Generate vulnerabilities from the unified data
  const vulnerabilities: Vulnerability[] = useMemo(() => {
    return unifiedData.map(item => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      description: item.description,
      affectedSystems: item.affectedSystems,
      status: item.status,
      discoveredDate: item.discoveredDate
    }));
  }, [unifiedData]);

  // Use the same data for algorithms table and charts
  const algorithmsData: AlgorithmData[] = useMemo(() => {
    return unifiedData.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      strength: item.strength,
      nistStatus: item.nistStatus,
      isPqc: item.isPqc,
      usage: item.usage,
      implementationComplexity: item.implementationComplexity,
      description: item.description,
      quantumVulnerability: item.quantumVulnerability,
      recommendedReplacement: item.recommendedReplacement,
      performanceImpact: item.performanceImpact,
      adoptionRate: item.adoptionRate
    }));
  }, [unifiedData]);

  // Calculate metrics from real data
  const severityCounts: SeverityCounts = useMemo(() => ({
    Critical: vulnerabilities.filter(v => v.severity === "Critical").length,
    High: vulnerabilities.filter(v => v.severity === "High").length,
    Medium: vulnerabilities.filter(v => v.severity === "Medium").length,
    Low: vulnerabilities.filter(v => v.severity === "Low").length,
  }), [vulnerabilities]);

  const pqcStats: PQCStats = useMemo(() => {
    const total = algorithmsData.length;
    const pqcCount = algorithmsData.filter(a => a.isPqc).length;
    const legacyCount = total - pqcCount;
    return {
      total,
      pqc: pqcCount,
      legacy: legacyCount,
      pqcPercentage: total > 0 ? ((pqcCount / total) * 100).toFixed(1) : 0
    };
  }, [algorithmsData]);

  const typeDistribution: TypeDistribution[] = useMemo(() => {
    const types = algorithmsData.reduce((acc: Record<string, number>, alg) => {
      acc[alg.type] = (acc[alg.type] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(types).map(([type, count]) => ({ type, count: count as number }));
  }, [algorithmsData]);

  const legacyPercentage = useMemo(() => {
    if (pqcStats.total === 0) return '0.0';
    return ((pqcStats.legacy / pqcStats.total) * 100).toFixed(1);
  }, [pqcStats]);

  if (isLoading) {
    return (
      <div className="min-h-dvh w-full overflow-hidden">
        <div className="space-y-8 p-4 sm:p-6 max-w-full">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Vulnerabilities</h2>
            </div>
            <LoadingSpinner />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh w-full overflow-hidden">
        <div className="space-y-8 p-4 sm:p-6 max-w-full">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Vulnerabilities</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Failed to connect to backend</p>
            </div>
            <ErrorDisplay error={error.message} onRetry={refetch} />
          </div>
        </div>
      </div>
    );
  }

  if (algorithmsData.length === 0) {
    return (
      <div className="min-h-dvh w-full overflow-hidden">
        <div className="space-y-8 p-4 sm:p-6 max-w-full">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Vulnerabilities</h2>
            </div>
            <EmptyState onRefresh={refetch} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader onRefresh={refetch} loading={isFetching} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Critical"
          value={severityCounts.Critical}
          icon={ShieldAlert}
          iconClassName="text-red-500"
          gradient
        />
        <MetricCard
          title="High"
          value={severityCounts.High}
          icon={ShieldAlert}
          iconClassName="text-orange-500"
          gradient
        />
        <MetricCard
          title="Medium"
          value={severityCounts.Medium}
          icon={Shield}
          iconClassName="text-yellow-500"
        />
        <MetricCard
          title="Low"
          value={severityCounts.Low}
          icon={ShieldCheck}
          iconClassName="text-green-500"
        />
        <MetricCard
          title="Total Algorithms"
          value={pqcStats.total}
          icon={Cpu}
        />
        <MetricCard
          title="Post-Quantum Ready"
          value={pqcStats.pqc}
          change={`${pqcStats.pqcPercentage}% of total`}
          icon={ShieldCheck}
          iconClassName="text-green-500"
        />
        <MetricCard
          title="Legacy Algorithms"
          value={pqcStats.legacy}
          change={`${legacyPercentage}% of total`}
          icon={ShieldOff}
          iconClassName="text-red-500"
        />
      </div>
      <Charts typeDistribution={typeDistribution} algorithmsData={algorithmsData} />
      <AlgorithmsTable algorithmsData={algorithmsData} />
      <VulnerabilityCategoryTable />
    </motion.div>
  );
}
"use client";

import { useReducer, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { filterApplicationsByMultipleCategories } from "@/components/applications/utils";
import { SubOrgsView } from "@/components/applications/SubOrgsView";
import { ApplicationsView } from "@/components/applications/ApplicationsView";
import { ViewSwitcher } from "@/components/applications/ViewSwitcher";
import { CSVData, SubOrg } from "@/components/applications/types";

// Type definitions
interface ApplicationApiResponse {
  "Sub Org": string;
  application: string;
  risk_level: string;
  time_complexity: string;
  time_quarter?: string;
  status?: string;
  pqc_ready: number;
  vulnerabilities: number;
  algorithms_used: string[] | string;
  current_date?: string;
  last_scan?: string;
}

interface TransformedData {
  applications: CSVData[];
  subOrgs: SubOrg[];
}

// Reducer for filters
const initialFilterState = {
  searchTerm: "",
  selectedRiskFilters: [],
  selectedTimeComplexityFilters: [],
  selectedQuarterFilters: [],
  quarterFromMode: false,
  selectedValueBasedFilters: [],
  currentView: 'suborgs',
  selectedSubOrg: '',
};

function applicationsFilterReducer(state: any, action: any) {
  switch (action.type) {
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload };
    case 'TOGGLE_RISK_FILTER':
      return {
        ...state,
        selectedRiskFilters: state.selectedRiskFilters.includes(action.payload)
          ? state.selectedRiskFilters.filter((r: string) => r !== action.payload)
          : [...state.selectedRiskFilters, action.payload],
      };
    case 'TOGGLE_TIME_COMPLEXITY_FILTER':
      return {
        ...state,
        selectedTimeComplexityFilters: state.selectedTimeComplexityFilters.includes(action.payload)
          ? state.selectedTimeComplexityFilters.filter((c: string) => c !== action.payload)
          : [...state.selectedTimeComplexityFilters, action.payload],
      };
    case 'TOGGLE_QUARTER_FILTER':
      if (state.quarterFromMode) {
        return { ...state, selectedQuarterFilters: action.payload ? [action.payload] : [] };
      } else {
        return {
          ...state,
          selectedQuarterFilters: state.selectedQuarterFilters.includes(action.payload)
            ? state.selectedQuarterFilters.filter((q: string) => q !== action.payload)
            : [...state.selectedQuarterFilters, action.payload],
        };
      }
    case 'SET_QUARTER_FROM_MODE':
      return { ...state, quarterFromMode: action.payload, selectedQuarterFilters: [] };
    case 'TOGGLE_VALUE_BASED_FILTER':
      return {
        ...state,
        selectedValueBasedFilters: state.selectedValueBasedFilters.includes(action.payload)
          ? state.selectedValueBasedFilters.filter((t: string) => t !== action.payload)
          : [...state.selectedValueBasedFilters, action.payload],
      };
    case 'SET_VIEW':
      return { ...initialFilterState, currentView: action.payload };
    case 'SET_SUB_ORG':
      return { ...initialFilterState, currentView: 'suborgapps', selectedSubOrg: action.payload };
    case 'BACK_TO_SUB_ORGS':
        return { ...initialFilterState, currentView: 'suborgs' };
    default:
      return state;
  }
}

// API fetching and transformation
const fetchApplications = async (): Promise<ApplicationApiResponse[]> => {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/apps`);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

const transformData = (rawData: ApplicationApiResponse[]): TransformedData => {
  const applications: CSVData[] = [];
  const subOrgMap: Record<string, { total: number; high: number; medium: number; low: number; pqcSum: number }> = {};

  rawData.forEach((item) => {
    const subOrg = item["Sub Org"];
    const risk = item.risk_level;
    const pqc = item.pqc_ready;

    applications.push({
      application: item.application,
      sub_org: subOrg,
      risk_level: risk,
      time_complexity: item.time_complexity,
      time_quarter: item.time_quarter || item.status || "N/A",
      pqc_ready: pqc,
      vulnerabilities: item.vulnerabilities,
      algorithms_used: Array.isArray(item.algorithms_used)
        ? item.algorithms_used.join(", ")
        : item.algorithms_used,
      last_scan: item.last_scan ? item.last_scan : "N/A",
    });

    if (!subOrgMap[subOrg]) {
      subOrgMap[subOrg] = { total: 0, high: 0, medium: 0, low: 0, pqcSum: 0 };
    }

    subOrgMap[subOrg].total += 1;
    subOrgMap[subOrg].pqcSum += pqc;
    if (risk === "High") subOrgMap[subOrg].high += 1;
    else if (risk === "Medium") subOrgMap[subOrg].medium += 1;
    else subOrgMap[subOrg].low += 1;
  });

  const subOrgs: SubOrg[] = Object.entries(subOrgMap).map(([name, stats]) => ({
    name,
    total_apps: stats.total,
    pqc_ready_percentage: stats.total > 0 ? Math.round(stats.pqcSum / stats.total) : 0,
    high_risk_count: stats.high,
    medium_risk_count: stats.medium,
    low_risk_count: stats.low,
    pqc_status: stats.high > 3 ? "Critical" : stats.medium > 5 ? "Warning" : "Good",
  }));

  return { applications, subOrgs };
};

export default function Applications() {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(applicationsFilterReducer, initialFilterState);

  const { data, error, isLoading, isRefetching, refetch } = useQuery<TransformedData, Error>({
    queryKey: ["applications"],
    queryFn: async () => {
        const rawData = await fetchApplications();
        return transformData(rawData);
    }
  });

  const filteredApplications = useMemo(() => {
    if (!data) return [];
    let filtered = data.applications;
    if (state.currentView === 'suborgapps' && state.selectedSubOrg) {
      filtered = filtered.filter(app => app.sub_org === state.selectedSubOrg);
    }
    return filterApplicationsByMultipleCategories(filtered, {
      searchTerm: state.searchTerm,
      selectedRiskFilters: state.selectedRiskFilters,
      selectedTimeComplexityFilters: state.selectedTimeComplexityFilters,
      selectedQuarterFilters: state.selectedQuarterFilters,
      quarterFromMode: state.quarterFromMode,
      selectedValueBasedFilters: state.selectedValueBasedFilters,
    });
  }, [data, state.searchTerm, state.selectedRiskFilters, state.selectedTimeComplexityFilters, state.selectedQuarterFilters, state.quarterFromMode, state.selectedValueBasedFilters, state.currentView, state.selectedSubOrg]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  if (isLoading) return (
    <div className="min-h-dvh bg-background p-6 flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-lg">Loading...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-dvh bg-background p-6 flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg text-red-500 mb-4">{error.message}</p>
        <Button variant="outline" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    </div>
  );

  const filterProps = {
    searchTerm: state.searchTerm,
    setSearchTerm: (payload: string) => dispatch({ type: 'SET_SEARCH_TERM', payload }),
    selectedRiskFilters: state.selectedRiskFilters,
    toggleRiskFilter: (payload: string) => dispatch({ type: 'TOGGLE_RISK_FILTER', payload }),
    selectedTimeComplexityFilters: state.selectedTimeComplexityFilters,
    toggleTimeComplexityFilter: (payload: string) => dispatch({ type: 'TOGGLE_TIME_COMPLEXITY_FILTER', payload }),
    selectedQuarterFilters: state.selectedQuarterFilters,
    toggleQuarterFilter: (payload: string) => dispatch({ type: 'TOGGLE_QUARTER_FILTER', payload }),
    quarterFromMode: state.quarterFromMode,
    setQuarterFromMode: (payload: boolean) => dispatch({ type: 'SET_QUARTER_FROM_MODE', payload }),
    selectedValueBasedFilters: state.selectedValueBasedFilters,
    toggleValueBasedFilter: (payload: string) => dispatch({ type: 'TOGGLE_VALUE_BASED_FILTER', payload }),
  };

  return (
    <motion.div
      className="min-h-dvh bg-background p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Applications</h1>
          </div>
        </div>

        {state.currentView !== 'suborgapps' && (
          <ViewSwitcher 
            currentView={state.currentView as 'suborgs' | 'allapps'} 
            onViewSwitch={(view) => dispatch({ type: 'SET_VIEW', payload: view })} 
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={state.currentView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="transition-all duration-300 ease-in-out"
          >
            {state.currentView === 'suborgs' && data && (
              <SubOrgsView
                subOrgs={data.subOrgs}
                onSubOrgClick={(subOrgName) => dispatch({ type: 'SET_SUB_ORG', payload: subOrgName })}
                onRefresh={handleRefresh}
                isRefreshing={isRefetching}
              />
            )}
            {(state.currentView === 'allapps' || state.currentView === 'suborgapps') && (
              <ApplicationsView
                currentView={state.currentView}
                selectedSubOrg={state.selectedSubOrg}
                onBack={() => dispatch({ type: 'BACK_TO_SUB_ORGS' })}
                onRefresh={handleRefresh}
                isRefreshing={isRefetching}
                filteredApplications={filteredApplications}
                {...filterProps}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
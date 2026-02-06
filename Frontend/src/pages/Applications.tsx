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
  console.log('🔄 [REDUCER] Action dispatched:', {
    type: action.type,
    payload: action.payload,
    currentState: state
  });

  let newState;
  
  switch (action.type) {
    case 'SET_SEARCH_TERM':
      newState = { ...state, searchTerm: action.payload };
      break;
    case 'TOGGLE_RISK_FILTER':
      newState = {
        ...state,
        selectedRiskFilters: state.selectedRiskFilters.includes(action.payload)
          ? state.selectedRiskFilters.filter((r: string) => r !== action.payload)
          : [...state.selectedRiskFilters, action.payload],
      };
      break;
    case 'TOGGLE_TIME_COMPLEXITY_FILTER':
      newState = {
        ...state,
        selectedTimeComplexityFilters: state.selectedTimeComplexityFilters.includes(action.payload)
          ? state.selectedTimeComplexityFilters.filter((c: string) => c !== action.payload)
          : [...state.selectedTimeComplexityFilters, action.payload],
      };
      break;
    case 'TOGGLE_QUARTER_FILTER':
      if (state.quarterFromMode) {
        newState = { ...state, selectedQuarterFilters: action.payload ? [action.payload] : [] };
      } else {
        newState = {
          ...state,
          selectedQuarterFilters: state.selectedQuarterFilters.includes(action.payload)
            ? state.selectedQuarterFilters.filter((q: string) => q !== action.payload)
            : [...state.selectedQuarterFilters, action.payload],
        };
      }
      break;
    case 'SET_QUARTER_FROM_MODE':
      newState = { ...state, quarterFromMode: action.payload, selectedQuarterFilters: [] };
      break;
    case 'TOGGLE_VALUE_BASED_FILTER':
      newState = {
        ...state,
        selectedValueBasedFilters: state.selectedValueBasedFilters.includes(action.payload)
          ? state.selectedValueBasedFilters.filter((t: string) => t !== action.payload)
          : [...state.selectedValueBasedFilters, action.payload],
      };
      break;
    case 'SET_VIEW':
      newState = { ...initialFilterState, currentView: action.payload };
      break;
    case 'SET_SUB_ORG':
      newState = { ...initialFilterState, currentView: 'suborgapps', selectedSubOrg: action.payload };
      break;
    case 'BACK_TO_SUB_ORGS':
      newState = { ...initialFilterState, currentView: 'suborgs' };
      break;
    default:
      console.warn('⚠️ [REDUCER] Unknown action type:', action.type);
      newState = state;
  }

  console.log('✅ [REDUCER] New state:', newState);
  return newState;
}

// API fetching and transformation
const fetchApplications = async (): Promise<ApplicationApiResponse[]> => {
  const apiUrl = 'https://backend-ed29.onrender.com/api';
  const endpoint = `${apiUrl}/apps`;

  console.log('🌐 [API] Fetching applications from:', endpoint);

  try {
    const response = await fetch(endpoint);
    
    console.log('📡 [API] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [API] Error response body:', errorText);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('❌ [API] Response is not JSON. Content-Type:', contentType);
      const responseText = await response.text();
      console.error('❌ [API] Response preview:', responseText.substring(0, 200));
      throw new Error(`Expected JSON response but got ${contentType}. The API endpoint might be incorrect.`);
    }

    const data = await response.json();
    console.log('✅ [API] Successfully fetched data');
    console.log('📊 [API] Data summary:', {
      totalRecords: data.length,
      firstRecord: data[0],
      recordKeys: data[0] ? Object.keys(data[0]) : []
    });

    return data;
  } catch (error) {
    console.error('❌ [API] Fetch error:', error);
    if (error instanceof Error) {
      console.error('❌ [API] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
    throw error;
  }
};

const transformData = (rawData: ApplicationApiResponse[]): TransformedData => {
  console.log('🔄 [TRANSFORM] Starting data transformation');
  console.log('🔄 [TRANSFORM] Input data length:', rawData.length);

  try {
    const applications: CSVData[] = [];
    const subOrgMap: Record<string, { total: number; high: number; medium: number; low: number; pqcSum: number }> = {};

    rawData.forEach((item, index) => {
      try {
        const subOrg = item["Sub Org"];
        const risk = item.risk_level;
        const pqc = item.pqc_ready;

        if (!subOrg) {
          console.warn(`⚠️ [TRANSFORM] Missing Sub Org at index ${index}:`, item);
        }

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
      } catch (itemError) {
        console.error(`❌ [TRANSFORM] Error processing item at index ${index}:`, itemError, item);
      }
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

    console.log('✅ [TRANSFORM] Transformation complete');
    console.log('📊 [TRANSFORM] Results:', {
      totalApplications: applications.length,
      totalSubOrgs: subOrgs.length,
      subOrgNames: subOrgs.map(s => s.name),
      sampleApplication: applications[0]
    });

    return { applications, subOrgs };
  } catch (error) {
    console.error('❌ [TRANSFORM] Fatal transformation error:', error);
    throw error;
  }
};

export default function Applications() {
  console.log('🚀 [COMPONENT] Applications component rendering');

  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(applicationsFilterReducer, initialFilterState);

  console.log('📌 [COMPONENT] Current state:', state);

  const { data, error, isLoading, isRefetching, refetch } = useQuery<TransformedData, Error>({
    queryKey: ["applications"],
    queryFn: async () => {
      console.log('🔄 [QUERY] Query function executing');
      try {
        const rawData = await fetchApplications();
        const transformed = transformData(rawData);
        console.log('✅ [QUERY] Query successful');
        return transformed;
      } catch (error) {
        console.error('❌ [QUERY] Query failed:', error);
        throw error;
      }
    },
    retry: 1, // Only retry once to avoid spamming
    retryDelay: 1000,
  });

  console.log('📊 [COMPONENT] Query state:', {
    hasData: !!data,
    isLoading,
    isRefetching,
    hasError: !!error,
    errorMessage: error?.message
  });

  const filteredApplications = useMemo(() => {
    console.log('🔍 [FILTER] Computing filtered applications');
    
    if (!data) {
      console.log('⚠️ [FILTER] No data available');
      return [];
    }

    let filtered = data.applications;
    console.log('📊 [FILTER] Starting with applications:', filtered.length);

    if (state.currentView === 'suborgapps' && state.selectedSubOrg) {
      console.log('🏢 [FILTER] Filtering by SubOrg:', state.selectedSubOrg);
      filtered = filtered.filter(app => app.sub_org === state.selectedSubOrg);
      console.log('📊 [FILTER] After SubOrg filter:', filtered.length);
    }

    const filterConfig = {
      searchTerm: state.searchTerm,
      selectedRiskFilters: state.selectedRiskFilters,
      selectedTimeComplexityFilters: state.selectedTimeComplexityFilters,
      selectedQuarterFilters: state.selectedQuarterFilters,
      quarterFromMode: state.quarterFromMode,
      selectedValueBasedFilters: state.selectedValueBasedFilters,
    };

    console.log('🔧 [FILTER] Filter configuration:', filterConfig);

    try {
      const result = filterApplicationsByMultipleCategories(filtered, filterConfig);
      console.log('✅ [FILTER] Final filtered count:', result.length);
      return result;
    } catch (filterError) {
      console.error('❌ [FILTER] Error during filtering:', filterError);
      return filtered;
    }
  }, [data, state.searchTerm, state.selectedRiskFilters, state.selectedTimeComplexityFilters, state.selectedQuarterFilters, state.quarterFromMode, state.selectedValueBasedFilters, state.currentView, state.selectedSubOrg]);

  const handleRefresh = () => {
    console.log('🔄 [REFRESH] Manual refresh triggered');
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  if (isLoading) {
    console.log('⏳ [COMPONENT] Rendering loading state');
    return (
      <div className="min-h-dvh bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">Loading applications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.log('❌ [COMPONENT] Rendering error state:', error);
    return (
      <div className="min-h-dvh bg-background p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-lg font-semibold text-destructive mb-2">Failed to Load Applications</p>
          <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
          {!import.meta.env.VITE_API_URL && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-left">
              <p className="text-sm font-medium text-yellow-800 mb-1">Configuration Issue:</p>
              <p className="text-xs text-yellow-700">
                VITE_API_URL environment variable is not set. Please create a <code className="bg-yellow-100 px-1 rounded">.env</code> file with:
              </p>
              <code className="block mt-2 text-xs bg-yellow-100 p-2 rounded">
                VITE_API_URL=http://your-api-url
              </code>
            </div>
          )}
          <Button variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

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

  console.log('✅ [COMPONENT] Rendering main view:', state.currentView);

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
            onViewSwitch={(view) => {
              console.log('🔀 [VIEW] Switching view to:', view);
              dispatch({ type: 'SET_VIEW', payload: view });
            }} 
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
                onSubOrgClick={(subOrgName) => {
                  console.log('🏢 [SUBORG] SubOrg clicked:', subOrgName);
                  dispatch({ type: 'SET_SUB_ORG', payload: subOrgName });
                }}
                onRefresh={handleRefresh}
                isRefreshing={isRefetching}
              />
            )}
            {(state.currentView === 'allapps' || state.currentView === 'suborgapps') && (
              <ApplicationsView
                currentView={state.currentView}
                selectedSubOrg={state.selectedSubOrg}
                onBack={() => {
                  console.log('⬅️ [NAVIGATION] Going back to SubOrgs');
                  dispatch({ type: 'BACK_TO_SUB_ORGS' });
                }}
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
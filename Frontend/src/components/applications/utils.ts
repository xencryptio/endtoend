import { CSVData } from "./types";
import { VALUE_BASED_MATRIX } from "./constants";

export function getValueBasedTag(risk: string, timeComplexity: string) {
  if (VALUE_BASED_MATRIX[risk] && VALUE_BASED_MATRIX[risk][timeComplexity]) {
    return VALUE_BASED_MATRIX[risk][timeComplexity].tag;
  }
  return "";
}

export function isQuarterInRange(appQuarter: string, selectedQuarters: string[], fromMode: boolean) {
  let currentDateStr = "2025-08-08"; // fallback
  if (typeof window !== "undefined") {
    // @ts-ignore
    if (window["__CURRENT_DATE__"]) {
      // @ts-ignore
      currentDateStr = window["__CURRENT_DATE__"];
    }
    // @ts-ignore
    if (window["__APP_DATA__"] && window["__APP_DATA__"].applications && window["__APP_DATA__"].applications.length > 0) {
      // @ts-ignore
      const firstApp = window["__APP_DATA__"].applications[0];
      if (firstApp.last_scan) currentDateStr = firstApp.last_scan;
      if (firstApp.current_date) currentDateStr = firstApp.current_date;
    }
  }
  let currentYear = 2025;
  let currentMonth = 7;
  if (currentDateStr) {
    const parts = currentDateStr.split("-");
    if (parts.length >= 2) {
      currentYear = parseInt(parts[0], 10);
      currentMonth = parseInt(parts[1], 10) - 1;
    }
  }
  const monthToQuarter = (month: number) => {
    if (month >= 0 && month <= 2) return "Q1";
    if (month >= 3 && month <= 5) return "Q2";
    if (month >= 6 && month <= 8) return "Q3";
    if (month >= 9 && month <= 11) return "Q4";
    return "Q1";
  };
  const currentQuarter = monthToQuarter(currentMonth);
  function parseQuarterYear(qstr: string) {
    const match = qstr.match(/(Q[1-6])\s*(\d{4})?/);
    if (!match) return { quarter: qstr, year: currentYear };
    return {
      quarter: match[1],
      year: match[2] ? parseInt(match[2], 10) : currentYear
    };
  }
  function getQuarterIndex(q: string, year: number) {
    const qNum = parseInt(q.replace("Q", ""), 10);
    return (year * 4) + (qNum - 1);
  }
  const currentQuarterIdx = getQuarterIndex(currentQuarter, currentYear);
  if (fromMode) {
    return selectedQuarters.some(selectedQ => {
      const selQ = parseQuarterYear(selectedQ);
      const appQ = parseQuarterYear(appQuarter);
      const selIdx = getQuarterIndex(selQ.quarter, selQ.year);
      const appIdx = getQuarterIndex(appQ.quarter, appQ.year);
      return appIdx >= selIdx && appIdx <= currentQuarterIdx;
    });
  } else {
    return selectedQuarters.some(selectedQ => {
      const appQ = parseQuarterYear(appQuarter);
      const appIdx = getQuarterIndex(appQ.quarter, appQ.year);
      const selectedQNum = parseInt(selectedQ.replace("Q", ""), 10);
      const currQNum = parseInt(currentQuarter.replace("Q", ""), 10);
      let targetYear = currentYear;
      let targetQNum = selectedQNum;
      if (selectedQNum <= currQNum) {
        targetYear = currentYear + 1;
      }
      const targetIdx = getQuarterIndex(`Q${targetQNum}`, targetYear);
      return appIdx === targetIdx;
    });
  }
}

export function filterApplicationsByMultipleCategories(applications: CSVData[], {
  selectedRiskFilters,
  selectedTimeComplexityFilters,
  selectedQuarterFilters,
  quarterFromMode,
  selectedValueBasedFilters,
  searchTerm,
}: {
  selectedRiskFilters: string[];
  selectedTimeComplexityFilters: string[];
  selectedQuarterFilters: string[];
  quarterFromMode: boolean;
  selectedValueBasedFilters: string[];
  searchTerm: string;
}) {
  return applications.filter(app => {
    const riskMatch = selectedRiskFilters.length === 0 || selectedRiskFilters.includes(app.risk_level);
    const timeComplexityMatch = selectedTimeComplexityFilters.length === 0 || selectedTimeComplexityFilters.includes(app.time_complexity);
    const appQuarter = app.time_quarter.split(" ")[0];
    const quarterMatch = selectedQuarterFilters.length === 0 || isQuarterInRange(appQuarter, selectedQuarterFilters, quarterFromMode);
    const appTag = getValueBasedTag(app.risk_level, app.time_complexity);
    const valueTagMatch = selectedValueBasedFilters.length === 0 || selectedValueBasedFilters.includes(appTag);
    const searchMatch = !searchTerm || (
      app.application.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.algorithms_used.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.sub_org.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return riskMatch && timeComplexityMatch && quarterMatch && valueTagMatch && searchMatch;
  });
}
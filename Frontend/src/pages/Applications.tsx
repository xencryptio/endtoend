"use client";

import { useReducer, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from "recharts";
import {
  RefreshCw, Search, Shield, AlertTriangle, CheckCircle,
  Building2, ChevronRight, ArrowLeft, Filter, X, LayoutGrid, LayoutList,
  AlertOctagon, Code2, Clock, Zap
} from "lucide-react";

import { CSVData, SubOrg } from "@/components/applications/types";
import { filterApplicationsByMultipleCategories } from "@/components/applications/utils";
import { DUMMY_DATA } from "@/components/applications/constants";

// ── types ─────────────────────────────────────────────────────────────────────
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

interface TransformedData { applications: CSVData[]; subOrgs: SubOrg[]; }

// ── helpers ───────────────────────────────────────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  Low: "#10b981", Medium: "#f59e0b", High: "#f97316", "Very High": "#ef4444",
};

const riskBg: Record<string, string> = {
  Low: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  Medium: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  High: "bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  "Very High": "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const scoreColor = (s: number) =>
  s >= 80 ? "text-emerald-600" : s >= 60 ? "text-amber-500" : s >= 40 ? "text-orange-500" : "text-red-500";

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "12px",
  },
};

// ── reducer ───────────────────────────────────────────────────────────────────
const init = {
  searchTerm: "", selectedRiskFilters: [], selectedTimeComplexityFilters: [],
  selectedQuarterFilters: [], quarterFromMode: false, selectedValueBasedFilters: [],
  currentView: "suborgs", selectedSubOrg: "",
};

function reducer(state: any, action: any) {
  switch (action.type) {
    case "SET_SEARCH": return { ...state, searchTerm: action.payload };
    case "TOGGLE_RISK": return { ...state, selectedRiskFilters: state.selectedRiskFilters.includes(action.payload) ? state.selectedRiskFilters.filter((r: string) => r !== action.payload) : [...state.selectedRiskFilters, action.payload] };
    case "TOGGLE_TC": return { ...state, selectedTimeComplexityFilters: state.selectedTimeComplexityFilters.includes(action.payload) ? state.selectedTimeComplexityFilters.filter((c: string) => c !== action.payload) : [...state.selectedTimeComplexityFilters, action.payload] };
    case "TOGGLE_QUARTER": return state.quarterFromMode
      ? { ...state, selectedQuarterFilters: action.payload ? [action.payload] : [] }
      : { ...state, selectedQuarterFilters: state.selectedQuarterFilters.includes(action.payload) ? state.selectedQuarterFilters.filter((q: string) => q !== action.payload) : [...state.selectedQuarterFilters, action.payload] };
    case "SET_QUARTER_MODE": return { ...state, quarterFromMode: action.payload, selectedQuarterFilters: [] };
    case "TOGGLE_VBF": return { ...state, selectedValueBasedFilters: state.selectedValueBasedFilters.includes(action.payload) ? state.selectedValueBasedFilters.filter((t: string) => t !== action.payload) : [...state.selectedValueBasedFilters, action.payload] };
    case "SET_VIEW": return { ...init, currentView: action.payload };
    case "SET_SUBORG": return { ...init, currentView: "suborgapps", selectedSubOrg: action.payload };
    case "BACK": return { ...init, currentView: "suborgs" };
    default: return state;
  }
}

// ── API ── Uses the SAME dashboard endpoint as Dashboard page for consistent data
const fetchApplications = async (): Promise<ApplicationApiResponse[]> => {
  const res = await fetch("http://localhost:8001/api/dashboard");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  // Dashboard returns org object or array of orgs — extract applications from first org
  const org = Array.isArray(data) ? data[0] : data;
  return (org?.applications ?? []) as ApplicationApiResponse[];
};

const transformData = (raw: ApplicationApiResponse[]): TransformedData => {
  const applications: CSVData[] = [];
  const subMap: Record<string, { total: number; high: number; medium: number; low: number; pqcSum: number }> = {};
  raw.forEach(item => {
    const so = item["Sub Org"] || "Unknown";
    applications.push({
      application: item.application, sub_org: so, risk_level: item.risk_level,
      time_complexity: item.time_complexity || "N/A", time_quarter: item.status || item.time_quarter || "N/A",
      pqc_ready: Math.round(item.pqc_ready * 10) / 10, vulnerabilities: item.vulnerabilities,
      algorithms_used: Array.isArray(item.algorithms_used) ? item.algorithms_used.join(", ") : (item.algorithms_used || ""),
      last_scan: item.last_scan || item.current_date || "N/A",
    });
    if (!subMap[so]) subMap[so] = { total: 0, high: 0, medium: 0, low: 0, pqcSum: 0 };
    subMap[so].total++;
    subMap[so].pqcSum += item.pqc_ready;
    if (item.risk_level === "High" || item.risk_level === "Very High") subMap[so].high++;
    else if (item.risk_level === "Medium") subMap[so].medium++;
    else subMap[so].low++;
  });
  const subOrgs: SubOrg[] = Object.entries(subMap).map(([name, s]) => ({
    name, total_apps: s.total,
    pqc_ready_percentage: s.total > 0 ? Math.round(s.pqcSum / s.total) : 0,
    high_risk_count: s.high, medium_risk_count: s.medium, low_risk_count: s.low,
    pqc_status: s.high > 3 ? "Critical" : s.medium > 5 ? "Warning" : "Good",
  }));
  return { applications, subOrgs };
};

// ── mini components ───────────────────────────────────────────────────────────
function PQCBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, background: value >= 80 ? "#10b981" : value >= 60 ? "#f59e0b" : "#ef4444" }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${scoreColor(value)}`}>{value}%</span>
    </div>
  );
}

function ActiveFilters({ state, dispatch }: { state: any; dispatch: any }) {
  const chips: { label: string; action: any }[] = [
    ...state.selectedRiskFilters.map((r: string) => ({ label: `Risk: ${r}`, action: { type: "TOGGLE_RISK", payload: r } })),
    ...state.selectedTimeComplexityFilters.map((tc: string) => ({ label: `TC: ${tc}`, action: { type: "TOGGLE_TC", payload: tc } })),
    ...state.selectedQuarterFilters.map((q: string) => ({ label: state.quarterFromMode ? `From ${q}` : q, action: { type: "TOGGLE_QUARTER", payload: q } })),
    ...state.selectedValueBasedFilters.map((t: string) => ({ label: t, action: { type: "TOGGLE_VBF", payload: t } })),
  ];
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <button key={i} onClick={() => dispatch(c.action)}
          className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
          {c.label} <X className="w-3 h-3" />
        </button>
      ))}
    </div>
  );
}

// ── SubOrgs view ──────────────────────────────────────────────────────────────
function SubOrgsSection({ subOrgs, apps, dispatch, onRefresh, isRefreshing }: {
  subOrgs: SubOrg[]; apps: CSVData[]; dispatch: any; onRefresh: () => void; isRefreshing: boolean;
}) {
  // top risks bar chart data
  const barData = subOrgs.slice(0, 8).map(s => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
    High: s.high_risk_count, Medium: s.medium_risk_count, Low: s.low_risk_count,
  }));

  // overall stats
  const totalHigh = subOrgs.reduce((s, o) => s + o.high_risk_count, 0);
  const totalMed = subOrgs.reduce((s, o) => s + o.medium_risk_count, 0);
  const avgPQC = subOrgs.length ? Math.round(subOrgs.reduce((s, o) => s + o.pqc_ready_percentage, 0) / subOrgs.length) : 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sub-Organizations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">PQC readiness by department — {subOrgs.length} teams</p>
        </div>
        <button onClick={onRefresh} disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Departments", value: subOrgs.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950/30" },
          { label: "Avg PQC", value: `${avgPQC}%`, icon: Shield, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950/30" },
          { label: "High Risk Apps", value: totalHigh, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-100 dark:bg-red-950/30" },
          { label: "Medium Risk", value: totalMed, icon: AlertOctagon, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-950/30" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 shadow-sm flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
            <div><p className="text-xl font-bold text-foreground">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* stacked bar */}
      {barData.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-1">Risk Breakdown by Department</p>
          <p className="text-xs text-muted-foreground mb-4">High / Medium / Low risk application counts</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip {...tooltipStyle} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="High" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Medium" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Low" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subOrgs.map((org, i) => {
          const statusColor = org.pqc_status === "Critical" ? "text-red-500 bg-red-100 dark:bg-red-950/30"
            : org.pqc_status === "Warning" ? "text-amber-500 bg-amber-100 dark:bg-amber-950/30"
            : "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30";
          return (
            <motion.button key={org.name}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => dispatch({ type: "SET_SUBORG", payload: org.name })}
              className="w-full text-left bg-card hover:bg-muted/40 rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950/30 rounded-lg">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-semibold text-foreground text-sm line-clamp-1">{org.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{org.pqc_status}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Applications</span><span className="font-semibold">{org.total_apps}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">High Risk</span><span className={`font-semibold ${org.high_risk_count > 0 ? "text-red-500" : "text-muted-foreground"}`}>{org.high_risk_count}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Medium Risk</span><span className={`font-semibold ${org.medium_risk_count > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{org.medium_risk_count}</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">PQC Readiness</span>
                  <span className={`text-xs font-bold ${scoreColor(org.pqc_ready_percentage)}`}>{org.pqc_ready_percentage}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${org.pqc_ready_percentage}%`, background: org.pqc_ready_percentage >= 80 ? "#10b981" : org.pqc_ready_percentage >= 60 ? "#f59e0b" : "#ef4444" }} />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Applications list view ────────────────────────────────────────────────────
function AppsSection({ apps, filtered, state, dispatch, subOrgName, onBack, onRefresh, isRefreshing }: {
  apps: CSVData[]; filtered: CSVData[]; state: any; dispatch: any;
  subOrgName?: string; onBack?: () => void; onRefresh: () => void; isRefreshing: boolean;
}) {
  const navigate = useNavigate();
  const [gridMode, setGridMode] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // stats for the top bar
  const totalVulns = filtered.reduce((s, a) => s + a.vulnerabilities, 0);
  const avgPQC = filtered.length ? Math.round(filtered.reduce((s, a) => s + a.pqc_ready, 0) / filtered.length) : 0;
  const highRisk = filtered.filter(a => a.risk_level === "High" || a.risk_level === "Very High").length;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group -ml-1">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground">{subOrgName || "All Applications"}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} of {apps.length} applications</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setGridMode(v => !v)}
            className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
            {gridMode ? <LayoutList className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <button onClick={onRefresh} disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* stat pills */}
      <div className="flex flex-wrap gap-3">
        {[
          { icon: Code2, label: "Total", value: filtered.length, color: "text-blue-600 bg-blue-100 dark:bg-blue-950/30" },
          { icon: AlertTriangle, label: "Vulns", value: totalVulns, color: "text-red-500 bg-red-100 dark:bg-red-950/30" },
          { icon: Shield, label: "Avg PQC", value: `${avgPQC}%`, color: "text-purple-600 bg-purple-100 dark:bg-purple-950/30" },
          { icon: AlertOctagon, label: "High Risk", value: highRisk, color: "text-orange-500 bg-orange-100 dark:bg-orange-950/30" },
        ].map(p => (
          <div key={p.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${p.color.split(" ").slice(1).join(" ")} border border-transparent`}>
            <p.icon className={`w-3.5 h-3.5 ${p.color.split(" ")[0]}`} />
            <span className="text-xs text-muted-foreground">{p.label}:</span>
            <span className={`text-xs font-bold ${p.color.split(" ")[0]}`}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* search + filter bar */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={state.searchTerm}
              onChange={e => dispatch({ type: "SET_SEARCH", payload: e.target.value })}
              placeholder="Search applications, algorithms..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button onClick={() => setFilterOpen(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${filterOpen ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground"}`}>
            <Filter className="w-4 h-4" /> Filters
          </button>
        </div>

        {/* filter panels */}
        <AnimatePresence>
          {filterOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {/* risk */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Risk Level</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Low", "Medium", "High", "Very High"].map(r => (
                      <button key={r} onClick={() => dispatch({ type: "TOGGLE_RISK", payload: r })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${state.selectedRiskFilters.includes(r) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                {/* time complexity */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Time Complexity</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DUMMY_DATA.filterOptions.timeComplexity.map(o => (
                      <button key={o.value} onClick={() => dispatch({ type: "TOGGLE_TC", payload: o.value })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${state.selectedTimeComplexityFilters.includes(o.value) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* quarter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Quarter</p>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={state.quarterFromMode}
                        onChange={e => dispatch({ type: "SET_QUARTER_MODE", payload: e.target.checked })}
                        className="w-3 h-3" /> From
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DUMMY_DATA.filterOptions.quarter.map(o => (
                      <button key={o.value} onClick={() => dispatch({ type: "TOGGLE_QUARTER", payload: o.value })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${state.selectedQuarterFilters.includes(o.value) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* value tags */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DUMMY_DATA.filterOptions.valueBasedTags.slice(0, 6).map(o => (
                      <button key={o.tag} onClick={() => dispatch({ type: "TOGGLE_VBF", payload: o.tag })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${state.selectedValueBasedFilters.includes(o.tag) ? "border-purple-500 bg-purple-100 dark:bg-purple-950/30 text-purple-600" : "border-border text-muted-foreground hover:border-foreground"}`}>
                        {o.tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ActiveFilters state={state} dispatch={dispatch} />
      </div>

      {/* grid or table */}
      <AnimatePresence mode="wait">
        {gridMode ? (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((app, i) => (
              <motion.div key={app.application + i}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/applications`)}
                className="bg-card rounded-2xl border border-border p-5 shadow-sm hover:shadow-md cursor-pointer transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950/30 rounded-lg"><Code2 className="w-4 h-4 text-blue-600" /></div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${riskBg[app.risk_level] || "bg-muted text-muted-foreground border-border"}`}>{app.risk_level}</span>
                </div>
                <p className="font-semibold text-foreground text-sm mb-1 line-clamp-1">{app.application}</p>
                <p className="text-xs text-muted-foreground mb-3">{app.sub_org}</p>
                <PQCBar value={app.pqc_ready} />
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
                  <span className={`${app.vulnerabilities > 0 ? "text-red-500" : "text-emerald-500"} font-semibold`}>{app.vulnerabilities} vulns</span>
                  <span className="text-muted-foreground">{app.time_complexity}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 text-center"><Filter className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No applications match the current filters</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {["Application", "Sub-Org", "PQC Score", "Vulnerabilities", "Risk", "Complexity", "Quarter"].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((app, i) => (
                      <motion.tr key={app.application + i}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        onClick={() => navigate(`/applications`)}
                        className="cursor-pointer hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-foreground whitespace-nowrap">{app.application}</td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap text-xs">{app.sub_org}</td>
                        <td className="px-5 py-3.5"><PQCBar value={app.pqc_ready} /></td>
                        <td className="px-5 py-3.5"><span className={`font-bold ${app.vulnerabilities > 0 ? "text-red-500" : "text-emerald-500"}`}>{app.vulnerabilities}</span></td>
                        <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${riskBg[app.risk_level] || "bg-muted border-border text-muted-foreground"}`}>{app.risk_level}</span></td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">{app.time_complexity}</td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">{app.time_quarter}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function Applications() {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, init);

  const { data, error, isLoading, isRefetching, refetch } = useQuery<TransformedData, Error>({
    queryKey: ["applications"],
    queryFn: async () => transformData(await fetchApplications()),
    retry: 1, retryDelay: 1000,
  });

  const filteredApplications = useMemo(() => {
    if (!data) return [];
    let base = data.applications;
    if (state.currentView === "suborgapps" && state.selectedSubOrg)
      base = base.filter(a => a.sub_org === state.selectedSubOrg);
    return filterApplicationsByMultipleCategories(base, {
      searchTerm: state.searchTerm,
      selectedRiskFilters: state.selectedRiskFilters,
      selectedTimeComplexityFilters: state.selectedTimeComplexityFilters,
      selectedQuarterFilters: state.selectedQuarterFilters,
      quarterFromMode: state.quarterFromMode,
      selectedValueBasedFilters: state.selectedValueBasedFilters,
    });
  }, [data, state]);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" /><p className="text-muted-foreground">Loading applications…</p></div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <AlertOctagon className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="font-semibold text-red-500">Failed to load applications</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">{error.message}</p>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium mx-auto">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    </div>
  );

  return (
    <motion.div
      className="min-h-dvh bg-background p-4 sm:p-6"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Applications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Post-quantum cryptography readiness across your portfolio</p>
          </div>
          {/* view tabs — only when not inside a sub-org */}
          {state.currentView !== "suborgapps" && (
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {[{ key: "suborgs", label: "By Team" }, { key: "allapps", label: "All Apps" }].map(v => (
                <button key={v.key} onClick={() => dispatch({ type: "SET_VIEW", payload: v.key })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${state.currentView === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={state.currentView}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
            {state.currentView === "suborgs" && data && (
              <SubOrgsSection subOrgs={data.subOrgs} apps={data.applications} dispatch={dispatch}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ["applications"] })}
                isRefreshing={isRefetching} />
            )}
            {(state.currentView === "allapps" || state.currentView === "suborgapps") && data && (
              <AppsSection
                apps={data.applications} filtered={filteredApplications}
                state={state} dispatch={dispatch}
                subOrgName={state.currentView === "suborgapps" ? state.selectedSubOrg : undefined}
                onBack={state.currentView === "suborgapps" ? () => dispatch({ type: "BACK" }) : undefined}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ["applications"] })}
                isRefreshing={isRefetching} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}


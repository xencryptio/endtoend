import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Shield, Clock, ChevronDown, ArrowLeft, RefreshCw } from "lucide-react";
import { CSVData } from "./types";
import { DUMMY_DATA } from "./constants";

const getRiskBadgeVariant = (risk: string) => {
  switch (risk) {
    case "Low": return "default";
    case "Medium": return "secondary";
    case "High": return "destructive";
    default: return "outline";
  }
};

const getProgressBarColor = (percentage: number) => {
  if (percentage >= 80) return "bg-green-600";
  if (percentage >= 60) return "bg-yellow-600";
  return "bg-red-600";
};

interface ApplicationsFilterProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedRiskFilters: string[];
  toggleRiskFilter: (risk: string) => void;
  selectedTimeComplexityFilters: string[];
  toggleTimeComplexityFilter: (complexity: string) => void;
  selectedQuarterFilters: string[];
  toggleQuarterFilter: (quarter: string) => void;
  quarterFromMode: boolean;
  setQuarterFromMode: (mode: boolean) => void;
  selectedValueBasedFilters: string[];
  toggleValueBasedFilter: (tag: string) => void;
}

function ApplicationsFilter({
  searchTerm,
  setSearchTerm,
  selectedRiskFilters,
  toggleRiskFilter,
  selectedTimeComplexityFilters,
  toggleTimeComplexityFilter,
  selectedQuarterFilters,
  toggleQuarterFilter,
  quarterFromMode,
  setQuarterFromMode,
  selectedValueBasedFilters,
  toggleValueBasedFilter,
}: ApplicationsFilterProps) {
  const [isRiskDropdownOpen, setIsRiskDropdownOpen] = useState(false);
  const [isTimeComplexityDropdownOpen, setIsTimeComplexityDropdownOpen] = useState(false);
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false);
  const [isValueBasedDropdownOpen, setIsValueBasedDropdownOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applications, algorithms, or sub-organizations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              aria-label="Search applications"
            />
          </div>
          <div className="flex flex-row flex-wrap gap-4">
            <div className="relative">
              <Button variant="outline" className="gap-2" onClick={() => setIsRiskDropdownOpen(v => !v)} aria-label="Risk Level Filter">
                <Shield className="h-4 w-4 text-red-600" />
                Risk Level
                <ChevronDown className={`h-4 w-4 transition-transform ${isRiskDropdownOpen ? 'rotate-180' : ''}`} />
              </Button>
              {isRiskDropdownOpen && (
                <div className="absolute z-50 mt-2 left-0 w-48 bg-background border rounded-md shadow-lg">
                  <div className="p-2">
                    {DUMMY_DATA.filterOptions.risk.map(opt => (
                      <div key={opt.value} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/50 ${selectedRiskFilters.includes(opt.value) ? 'bg-primary/10' : ''}`} onClick={() => toggleRiskFilter(opt.value)} tabIndex={0} role="checkbox" aria-checked={selectedRiskFilters.includes(opt.value) ? "true" : "false"}>
                        <div className={`w-3 h-3 rounded border ${selectedRiskFilters.includes(opt.value) ? 'bg-red-600 border-red-600' : 'border-muted-foreground'}`} />
                        <span className="text-sm">{opt.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Button variant="outline" className="gap-2" onClick={() => setIsTimeComplexityDropdownOpen(v => !v)} aria-label="Time Complexity Filter">
                <Clock className="h-4 w-4 text-yellow-600" />
                Time Complexity
                <ChevronDown className={`h-4 w-4 transition-transform ${isTimeComplexityDropdownOpen ? 'rotate-180' : ''}`} />
              </Button>
              {isTimeComplexityDropdownOpen && (
                <div className="absolute z-50 mt-2 left-0 w-56 bg-background border rounded-md shadow-lg">
                  <div className="p-2">
                    {DUMMY_DATA.filterOptions.timeComplexity.map(opt => (
                      <div key={opt.value} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/50 ${selectedTimeComplexityFilters.includes(opt.value) ? 'bg-primary/10' : ''}`} onClick={() => toggleTimeComplexityFilter(opt.value)} tabIndex={0} role="checkbox" aria-checked={selectedTimeComplexityFilters.includes(opt.value) ? "true" : "false"}>
                        <div className={`w-3 h-3 rounded border ${selectedTimeComplexityFilters.includes(opt.value) ? 'bg-yellow-600 border-yellow-600' : 'border-muted-foreground'}`} />
                        <span className="text-sm">{opt.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Button variant="outline" className="gap-2" onClick={() => setIsQuarterDropdownOpen(v => !v)} aria-label="Quarter Filter">
                <Filter className="h-4 w-4 text-blue-600" />
                Quarter
                <ChevronDown className={`h-4 w-4 transition-transform ${isQuarterDropdownOpen ? 'rotate-180' : ''}`} />
              </Button>
              {isQuarterDropdownOpen && (
                <div className="absolute z-50 mt-2 left-0 w-56 bg-background border rounded-md shadow-lg">
                  <div className="p-2">
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={quarterFromMode} onChange={e => setQuarterFromMode(e.target.checked)} id="quarter-from-mode" />
                      <label htmlFor="quarter-from-mode" className="text-xs">From Quarter Mode</label>
                    </div>
                    {DUMMY_DATA.filterOptions.quarter.map(opt => (
                      <div key={opt.value} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/50 ${selectedQuarterFilters.includes(opt.value) ? 'bg-primary/10' : ''}`} onClick={() => toggleQuarterFilter(opt.value)} tabIndex={0} role="checkbox" aria-checked={selectedQuarterFilters.includes(opt.value) ? "true" : "false"}>
                        <div className={`w-3 h-3 rounded border ${selectedQuarterFilters.includes(opt.value) ? 'bg-blue-600 border-blue-600' : 'border-muted-foreground'}`} />
                        <span className="text-sm">{opt.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Button variant="outline" className="gap-2" onClick={() => setIsValueBasedDropdownOpen(v => !v)} aria-label="Value-Based Tag Filter">
                <Badge className="bg-purple-600 text-white">Tags</Badge>
                Value-Based
                <ChevronDown className={`h-4 w-4 transition-transform ${isValueBasedDropdownOpen ? 'rotate-180' : ''}`} />
              </Button>
              {isValueBasedDropdownOpen && (
                <div className="absolute z-50 mt-2 left-0 w-72 bg-background border rounded-md shadow-lg">
                  <div className="p-2">
                    {DUMMY_DATA.filterOptions.valueBasedTags.map(opt => (
                      <div key={opt.tag} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/50 ${selectedValueBasedFilters.includes(opt.tag) ? 'bg-primary/10' : ''}`} onClick={() => toggleValueBasedFilter(opt.tag)} tabIndex={0} role="checkbox" aria-checked={selectedValueBasedFilters.includes(opt.tag) ? "true" : "false"}>
                        <div className={`w-3 h-3 rounded border ${selectedValueBasedFilters.includes(opt.tag) ? 'bg-purple-600 border-purple-600' : 'border-muted-foreground'}`} />
                        <span className="text-sm font-semibold">{opt.tag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {selectedRiskFilters.map((risk) => (<Badge key={"risk-"+risk} variant="destructive" className="gap-1 cursor-pointer" onClick={() => toggleRiskFilter(risk)}>{risk} <span className="text-xs">×</span></Badge>))}
            {selectedTimeComplexityFilters.map((tc) => (<Badge key={"tc-"+tc} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleTimeComplexityFilter(tc)}>{tc} <span className="text-xs">×</span></Badge>))}
            {selectedQuarterFilters.map((q) => (<Badge key={"q-"+q} variant="outline" className="gap-1 cursor-pointer" onClick={() => toggleQuarterFilter(q)}>{quarterFromMode ? `From ${q}` : q} <span className="text-xs">×</span></Badge>))}
            {selectedValueBasedFilters.map((tag) => (<Badge key={"tag-"+tag} className="bg-purple-600 text-white gap-1 cursor-pointer" onClick={() => toggleValueBasedFilter(tag)}>{tag} <span className="text-xs">×</span></Badge>))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ApplicationsTableProps {
  applications: CSVData[];
  view: 'allapps' | 'suborgapps';
}

function ApplicationsTable({ applications, view }: ApplicationsTableProps) {
  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No applications found</h3>
          <p className="text-muted-foreground">Try adjusting your search terms or filters</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b"><tr className="bg-muted/50">
              <th className="text-left p-4 font-medium">Application</th>
              {view === 'allapps' && <th className="text-left p-4 font-medium">Sub-Organization</th>}
              <th className="text-left p-4 font-medium">Risk Level</th>
              <th className="text-left p-4 font-medium">Time Complexity</th>
              <th className="text-left p-4 font-medium">Time</th>
              <th className="text-left p-4 font-medium">PQC Ready</th>
              <th className="text-left p-4 font-medium">Vulnerabilities</th>
              <th className="text-left p-4 font-medium">Algorithms</th>
              <th className="text-left p-4 font-medium">Last Scan</th>
            </tr></thead>
            <tbody>
              {applications.map((app, index) => (
                <tr key={index} className="border-b hover:bg-muted/25 transition-colors">
                  <td className="p-4 font-medium">{app.application}</td>
                  {view === 'allapps' && (<td className="p-4 text-sm text-muted-foreground">{app.sub_org}</td>)}
                  <td className="p-4"><Badge variant={getRiskBadgeVariant(app.risk_level)}>{app.risk_level}</Badge></td>
                  <td className="p-4"><Badge variant="outline">{app.time_complexity}</Badge></td>
                  <td className="p-4"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{app.time_quarter}</Badge></td>
                  <td className="p-4"><div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-2"><div className={`h-2 rounded-full ${getProgressBarColor(app.pqc_ready)}`} style={{ width: `${app.pqc_ready}%` }} /></div>
                      <span className="text-sm text-muted-foreground">{app.pqc_ready}%</span>
                  </div></td>
                  <td className="p-4"><span className={`font-semibold ${app.vulnerabilities > 20 ? 'text-red-600' : app.vulnerabilities > 10 ? 'text-yellow-600' : 'text-green-600'}`}>{app.vulnerabilities}</span></td>
                  <td className="p-4 text-sm text-muted-foreground max-w-xs truncate">{app.algorithms_used}</td>
                  <td className="p-4 text-sm text-muted-foreground">{app.last_scan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ApplicationsViewProps extends ApplicationsFilterProps {
  currentView: 'allapps' | 'suborgapps';
  selectedSubOrg: string;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  filteredApplications: CSVData[];
}

export function ApplicationsView({
  currentView,
  selectedSubOrg,
  onBack,
  onRefresh,
  isRefreshing,
  filteredApplications,
  ...filterProps
}: ApplicationsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {currentView === 'suborgapps' && (
            <Button variant="outline" onClick={onBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div>
            <h2 className="text-3xl font-bold text-foreground">
              {currentView === 'suborgapps' ? `${selectedSubOrg} - Applications` : 'All Applications'}
            </h2>
            <p className="text-muted-foreground">
              {currentView === 'suborgapps' 
                ? `Applications in ${selectedSubOrg}`
                : 'All applications across the organization'
              }
            </p>
          </div>
        </div>
        <Button onClick={onRefresh} variant="outline" disabled={isRefreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? "Refreshing..." : "Refresh Data"}
        </Button>
      </div>

      <ApplicationsFilter {...filterProps} />

      <ApplicationsTable
        applications={filteredApplications}
        view={currentView}
      />
    </div>
  );
}
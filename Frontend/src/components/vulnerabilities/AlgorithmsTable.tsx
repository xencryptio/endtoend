import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { AlgorithmData } from "./types";

interface AlgorithmsTableProps {
  algorithmsData: AlgorithmData[];
}

export function AlgorithmsTable({ algorithmsData }: AlgorithmsTableProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Live Cryptographic Algorithms Data</CardTitle>
          <CardDescription className="text-sm">
            Real-time data from backend API with {algorithmsData.length} algorithms
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Horizontal scroll container */}
          <div className="overflow-x-auto w-full">
            <table className="min-w-full table-auto text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-medium min-w-[120px] sticky left-0 bg-muted/50 z-10">Algorithm</th>
                  <th className="text-left p-3 font-medium min-w-[100px]">Type</th>
                  <th className="text-left p-3 font-medium min-w-[80px]">Strength</th>
                  <th className="text-left p-3 font-medium min-w-[100px]">NIST Status</th>
                  <th className="text-left p-3 font-medium min-w-[80px]">PQC</th>
                  <th className="text-left p-3 font-medium min-w-[80px]">Usage</th>
                  <th className="text-left p-3 font-medium min-w-[120px]">Implementation</th>
                  <th className="text-left p-3 font-medium min-w-[200px]">Description</th>
                  <th className="text-left p-3 font-medium min-w-[120px]">Quantum Risk</th>
                  <th className="text-left p-3 font-medium min-w-[150px]">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {algorithmsData.map((alg) => (
                  <tr
                    key={alg.id}
                    className={`border-b border-border/50 hover:bg-muted/30 transition-all duration-200 ${
                      hoveredRow === alg.id ? 'shadow-md' : ''
                    }`}
                    onMouseEnter={() => setHoveredRow(alg.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td className="p-3 font-medium text-primary min-w-[120px] sticky left-0 bg-background hover:bg-muted/30 z-10 border-r border-border/20">
                      <div className="truncate" title={alg.name}>
                        {alg.name}
                      </div>
                    </td>
                    <td className="p-3 min-w-[100px]">
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {alg.type}
                      </Badge>
                    </td>
                    <td className="p-3 min-w-[80px]">
                      <span className="text-sm">
                        {alg.strength ? `${alg.strength}-bit` : 'N/A'}
                      </span>
                    </td>
                    <td className="p-3 min-w-[100px]">
                      <Badge
                        variant={
                          alg.nistStatus === 'Standardized' ? 'default' :
                          alg.nistStatus === 'Deprecated' ? 'destructive' : 'secondary'
                        }
                        className="text-xs whitespace-nowrap"
                      >
                        {alg.nistStatus}
                      </Badge>
                    </td>
                    <td className="p-3 min-w-[80px]">
                      {alg.isPqc ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <span className="text-green-600 text-xs">Yes</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                          <span className="text-destructive text-xs">No</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 min-w-[80px]">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{alg.usage}</span>
                        <span className="text-xs text-muted-foreground">instances</span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <Badge
                        variant={
                          alg.implementationComplexity === 'Low' ? 'default' :
                          alg.implementationComplexity === 'Medium' ? 'secondary' : 'destructive'
                        }
                        className="text-xs whitespace-nowrap"
                      >
                        {alg.implementationComplexity}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground min-w-[200px]">
                      <div className="truncate max-w-[200px]" title={alg.description}>
                        {alg.description}
                      </div>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <div
                        className={`text-sm truncate max-w-[120px] ${
                          alg.quantumVulnerability.includes('resistant') ? 'text-green-600' : 'text-destructive'
                        }`}
                        title={alg.quantumVulnerability}
                      >
                        {alg.quantumVulnerability}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-primary min-w-[150px]">
                      <div className="truncate max-w-[150px]" title={alg.recommendedReplacement}>
                        {alg.recommendedReplacement}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
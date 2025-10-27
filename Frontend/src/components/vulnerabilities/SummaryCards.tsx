import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Shield, CheckCircle } from "lucide-react";
import { SeverityCounts, PQCStats } from "./types";

interface SummaryCardsProps {
  severityCounts: SeverityCounts;
  pqcStats: PQCStats;
}

export function SummaryCards({ severityCounts, pqcStats }: SummaryCardsProps) {
  return (
    <>
      {/* Vulnerability Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-5 w-5 text-destructive mb-2" />
            <p className="text-base sm:text-lg text-muted-foreground">Critical</p>
            <p className="text-2xl sm:text-3xl font-bold text-destructive">{severityCounts.Critical}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-5 w-5 text-orange-500 mb-2" />
            <p className="text-sm sm:text-base text-muted-foreground">High</p>
            <p className="text-2xl sm:text-3xl font-bold text-orange-500">{severityCounts.High}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <Shield className="h-5 w-5 text-primary mb-2" />
            <p className="text-sm sm:text-base text-muted-foreground">Medium</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary">{severityCounts.Medium}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <CheckCircle className="h-5 w-5 text-green-500 mb-2" />
            <p className="text-sm sm:text-base text-muted-foreground">Low</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-500">{severityCounts.Low}</p>
          </CardContent>
        </Card>
      </div>

      {/* PQC Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-sm sm:text-base text-muted-foreground">Total Algorithms</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary">{pqcStats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-sm sm:text-base text-muted-foreground">Post-Quantum Ready</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{pqcStats.pqc}</p>
            <p className="text-sm text-muted-foreground">{pqcStats.pqcPercentage}% of total</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-transparent shadow-none hover:shadow-lg transition-all duration-300">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-sm sm:text-base text-muted-foreground">Legacy Algorithms</p>
            <p className="text-2xl sm:text-3xl font-bold text-orange-600">{pqcStats.legacy}</p>
            <p className="text-sm text-muted-foreground">{(100 - Number(pqcStats.pqcPercentage)).toFixed(1)}% of total</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
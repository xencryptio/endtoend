
import { Server, TrendingUp, CheckCircle, AlertTriangle, Shield } from "lucide-react";
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface DashboardMetricsProps {
  totalApps: number;
  totalAlgChanges: number;
  totalCertChanges: number;
  avgAlgPerApp: string;
  avgCertPerApp: string;
  totalVulns: number;
  secureApps: number;
  avgMigration: number;
  avgPQC: number;
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
  totalApps,
  totalAlgChanges,
  totalCertChanges,
  avgAlgPerApp,
  avgCertPerApp,
  totalVulns,
  secureApps,
  avgMigration,
  avgPQC,
}) => {
  return (
    <div className="space-y-6">
      {/* First Row: Progress Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground">PQC Readiness</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold mb-3">{avgMigration.toFixed(1)}%</div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  avgMigration < 30
                    ? 'bg-destructive'
                    : avgMigration < 50
                    ? 'bg-destructive'
                    : avgMigration < 80
                    ? 'bg-warning'
                    : 'bg-success'

                }`}
                style={{ width: `${avgMigration}%` }}
              />
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-2">
              {avgMigration >= 80
                ? "+on track"
                : avgMigration >= 60
                ? "~moderate"
                : avgMigration >= 30
                ? "~lagging"
                : "-behind schedule"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Migration Progress</CardTitle>
            <Shield className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold mb-3">{Math.round(avgPQC)}%</div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  avgPQC < 30
                    ? 'bg-destructive'
                    : avgPQC < 50
                    ? 'bg-destructive'
                    : avgPQC < 80
                    ? 'bg-warning'
                    : 'bg-success'
                }`}
                style={{ width: `${avgPQC}%` }}
              />
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-2">
              {avgPQC >= 80
                ? "+stable"
                : avgPQC >= 60
                ? "~moderate"
                : avgPQC >= 30
                ? "~needs work"
                : "-critical"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Second Row: 5 Cards, equally spaced */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Applications</CardTitle>
            <Server className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold mb-2">{totalApps}</div>
            <p className="text-sm font-medium text-muted-foreground">+2 this week</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Algorithms Migrated</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold mb-2">{totalAlgChanges}</div>
            <p className="text-sm font-medium text-muted-foreground">{avgAlgPerApp} per app</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Certificates Migrated</CardTitle>
            <CheckCircle className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold mb-2">{totalCertChanges}</div>
            <p className="text-sm font-medium text-muted-foreground">{avgCertPerApp} per app</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Vulnerabilities</CardTitle>
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold text-destructive mb-2">{totalVulns}</div>
            <p className="text-sm font-medium text-muted-foreground">{totalApps - secureApps} fully secure</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
            <CardTitle className="text-base font-semibold text-muted-foreground">Secure Apps</CardTitle>
            <CheckCircle className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="text-3xl font-bold text-success mb-2">{secureApps}</div>
            <p className="text-sm font-medium text-muted-foreground">{((secureApps / totalApps) * 100).toFixed(1)}% of total</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
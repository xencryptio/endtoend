import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Download, FileText, TrendingUp, Calendar, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Report {
  id: string;
  title: string;
  description: string;
  type: "Security" | "Compliance" | "Performance" | "Summary";
  generated: string;
  status: "Ready" | "Generating" | "Failed";
  size: string;
}

const fetchReports = async (): Promise<Report[]> => {
  const reports: Report[] = [
    {
      id: "RPT-001",
      title: "Weekly PQC Security Assessment",
      description: "Comprehensive analysis of post-quantum cryptography implementation across all applications",
      type: "Security",
      generated: "2024-01-15",
      status: "Ready",
      size: "2.3 MB"
    },
    {
      id: "RPT-002", 
      title: "Vulnerability Remediation Report",
      description: "Detailed breakdown of quantum-related vulnerabilities and remediation progress",
      type: "Security",
      generated: "2024-01-14",
      status: "Ready", 
      size: "1.8 MB"
    },
    {
      id: "RPT-003",
      title: "NIST PQC Compliance Report",
      description: "Compliance status against NIST post-quantum cryptography standards",
      type: "Compliance",
      generated: "2024-01-13",
      status: "Ready",
      size: "3.1 MB"
    },
    {
      id: "RPT-004",
      title: "Algorithm Performance Metrics", 
      description: "Performance analysis of implemented PQC algorithms vs classical cryptography",
      type: "Performance",
      generated: "2024-01-12",
      status: "Generating",
      size: "Pending"
    },
    {
      id: "RPT-005",
      title: "Executive Summary - Q1 2024",
      description: "High-level overview of PQC readiness and security posture for executive review",
      type: "Summary",
      generated: "2024-01-10",
      status: "Ready",
      size: "890 KB"
    }
  ];
  return new Promise(resolve => setTimeout(() => resolve(reports), 500));
}

export default function Reports() {
  const { data: reports = [], isLoading, error } = useQuery<Report[], Error>({
    queryKey: ["reports"],
    queryFn: fetchReports,
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Security": return <TrendingUp className="h-4 w-4" />;
      case "Compliance": return <FileText className="h-4 w-4" />;
      case "Performance": return <BarChart3 className="h-4 w-4" />;
      case "Summary": return <Calendar className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

  const getTypeVariant = (type: string): BadgeVariant => {
    switch (type) {
      case "Security": return "destructive";
      case "Compliance": return "default";
      case "Performance": return "secondary";
      case "Summary": return "outline";
      default: return "outline";
    }
  };

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status) {
      case "Ready": return "default";
      case "Generating": return "secondary";
      case "Failed": return "destructive";
      default: return "outline";
    }
  };

  const quickReports = [
    {
      title: "Application Security Summary",
      description: "Current PQC implementation status across all monitored applications"
    },
    {
      title: "Critical Vulnerabilities Report", 
      description: "All critical and high severity quantum-related vulnerabilities"
    },
    {
      title: "Algorithm Usage Analysis",
      description: "Breakdown of cryptographic algorithms in use and their quantum resistance"
    },
    {
      title: "Compliance Gap Analysis",
      description: "Analysis of gaps in NIST PQC standard compliance"
    }
  ];

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Reports</h2>
        </div>
        <Button className="gap-2">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Generate Custom Report</span>
          <span className="sm:hidden">New Report</span>
        </Button>
      </div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.1 } },
        }}
      >
        {/* Quick Reports */}
        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">
                Quick Reports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quickReports.map((report, index) => (
                <div key={index} className="p-3 border border-border rounded-lg hover:bg-accent/20 transition-colors">
                  <h4 className="font-medium text-foreground text-sm">{report.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    Generate
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Reports */}
        <motion.div className="lg:col-span-2" variants={cardVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">
                Recent Reports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="border border-border rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3">
                      {getTypeIcon(report.type)}
                      <div>
                        <h4 className="font-semibold text-foreground">{report.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 self-start sm:self-center">
                      <Badge variant={getTypeVariant(report.type)}>
                        {report.type}
                      </Badge>
                      <Badge variant={getStatusVariant(report.status)}>
                        {report.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm text-muted-foreground gap-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span><strong>ID:</strong> {report.id}</span>
                      <span><strong>Generated:</strong> {report.generated}</span>
                      <span><strong>Size:</strong> {report.size}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      {report.status === "Ready" && (
                        <>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </>
                      )}
                      {report.status === "Generating" && (
                        <Button variant="outline" size="sm" disabled>
                          Generating...
                        </Button>
                      )}
                      {report.status === "Failed" && (
                        <Button variant="outline" size="sm">
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Report Metrics */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
        }}
      >
        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Reports</p>
                  <p className="text-2xl font-bold text-foreground">{reports.length}</p>
                  <p className="text-xs text-success">+3 this week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <Download className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Downloads</p>
                  <p className="text-2xl font-bold text-foreground">234</p>
                  <p className="text-xs text-success">+12 this week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Automated Reports</p>
                  <p className="text-2xl font-bold text-foreground">12</p>
                  <p className="text-xs text-muted-foreground">Scheduled weekly</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
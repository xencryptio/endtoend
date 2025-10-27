import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Bell, Shield, Database, Users, Save } from "lucide-react";

export default function Settings() {
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };
  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground">
          Configure your post-quantum cryptography dashboard preferences and settings
        </p>
      </div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.1 } },
        }}
      >
        {/* General Settings */}
        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                General Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input id="org-name" placeholder="Your Organization" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dashboard-refresh">Dashboard Refresh Interval</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                    <SelectItem value="600">10 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="est">Eastern Time</SelectItem>
                    <SelectItem value="pst">Pacific Time</SelectItem>
                    <SelectItem value="cet">Central European Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="dark-mode">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Enable dark theme</p>
                </div>
                <Switch id="dark-mode" className="sm:ml-auto" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notification Settings */}
        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="email-alerts">Email Alerts</Label>
                  <p className="text-sm text-muted-foreground">Receive email notifications</p>
                </div>
                <Switch id="email-alerts" defaultChecked className="sm:ml-auto" />
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="critical-vulns">Critical Vulnerabilities</Label>
                  <p className="text-sm text-muted-foreground">Immediate alerts for critical issues</p>
                </div>
                <Switch id="critical-vulns" defaultChecked className="sm:ml-auto" />
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="weekly-reports">Weekly Reports</Label>
                  <p className="text-sm text-muted-foreground">Automated weekly summary reports</p>
                </div>
                <Switch id="weekly-reports" defaultChecked className="sm:ml-auto" />
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="compliance-updates">Compliance Updates</Label>
                  <p className="text-sm text-muted-foreground">NIST PQC standard updates</p>
                </div>
                <Switch id="compliance-updates" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notification-email">Notification Email</Label>
                <Input id="notification-email" type="email" placeholder="admin@company.com" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Settings */}
        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scan-frequency">Automatic Scan Frequency</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="manual">Manual Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="auto-remediation">Auto-Remediation</Label>
                  <p className="text-sm text-muted-foreground">Automatically fix low-risk issues</p>
                </div>
                <Switch id="auto-remediation" className="sm:ml-auto" />
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="threat-intel">Threat Intelligence</Label>
                  <p className="text-sm text-muted-foreground">External threat data integration</p>
                </div>
                <Switch id="threat-intel" defaultChecked className="sm:ml-auto" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="risk-threshold">Risk Score Threshold</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select threshold" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (1-3)</SelectItem>
                    <SelectItem value="medium">Medium (4-6)</SelectItem>
                    <SelectItem value="high">High (7-8)</SelectItem>
                    <SelectItem value="critical">Critical (9-10)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Data & Integration */}
        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data & Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="data-retention">Data Retention Period</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">6 months</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="export-enabled">Data Export</Label>
                  <p className="text-sm text-muted-foreground">Allow data export to external systems</p>
                </div>
                <Switch id="export-enabled" defaultChecked className="sm:ml-auto" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-endpoint">API Endpoint</Label>
                <Input id="api-endpoint" placeholder="https://api.yourcompany.com/pqc" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="backup-location">Backup Location</Label>
                <Input id="backup-location" placeholder="s3://your-bucket/backups" />
              </div>

              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label htmlFor="auto-backup">Automatic Backups</Label>
                  <p className="text-sm text-muted-foreground">Daily automated backups</p>
                </div>
                <Switch id="auto-backup" defaultChecked className="sm:ml-auto" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* User Management */}
      <motion.div variants={cardVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
          </CardHeader>
          <CardContent>
              <div className="overflow-x-auto responsive-table-container">
              <table className="w-full text-sm">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">User</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Active</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="block md:table-row border-b border-border/50">
                    <td className="p-4 md:py-3 md:px-4 font-medium text-foreground md:table-cell">
                      <div>
                        <p className="font-medium text-foreground">admin@company.com</p>
                        <p className="text-sm text-muted-foreground">Administrator</p>
                      </div>
                    </td>
                    <td className="p-4 md:py-3 md:px-4 text-muted-foreground md:table-cell" data-label="Role">Admin</td>
                    <td className="p-4 md:py-3 md:px-4 text-muted-foreground md:table-cell" data-label="Last Active">2 minutes ago</td>
                    <td className="p-4 md:py-3 md:px-4 md:table-cell" data-label="Status">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                        Active
                      </span>
                    </td>
                    <td className="p-4 md:py-3 md:px-4 md:table-cell" data-label="Actions">
                      <Button variant="outline" size="sm">Edit</Button>
                    </td>
                  </tr>
                  <tr className="block md:table-row border-b border-border/50">
                    <td className="p-4 md:py-3 md:px-4 font-medium text-foreground md:table-cell">
                      <div>
                        <p className="font-medium text-foreground">security@company.com</p>
                        <p className="text-sm text-muted-foreground">Security Analyst</p>
                      </div>
                    </td>
                    <td className="p-4 md:py-3 md:px-4 text-muted-foreground md:table-cell" data-label="Role">Analyst</td>
                    <td className="p-4 md:py-3 md:px-4 text-muted-foreground md:table-cell" data-label="Last Active">1 hour ago</td>
                    <td className="p-4 md:py-3 md:px-4 md:table-cell" data-label="Status">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                        Active
                      </span>
                    </td>
                    <td className="p-4 md:py-3 md:px-4 md:table-cell" data-label="Actions">
                      <Button variant="outline" size="sm">Edit</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <p className="text-sm text-muted-foreground">2 users total</p>
              <Button variant="outline">Add User</Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button className="gap-2">
          <Save className="h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </motion.div>
  );
}
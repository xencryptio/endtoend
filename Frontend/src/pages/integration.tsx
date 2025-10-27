import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  ArrowLeft, Github, GitBranch, Settings, Wrench, 
  MessageSquare, Code, Play, Zap, FileText,
  Shield, Users, Key, Activity, Trash2,
  RefreshCw, FolderOpen, Edit3, Upload,
  Bug, Workflow, Bell, Brain, Sliders,
  Eye, BarChart3, Clock, CheckCircle
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts'

export default function EnhancedDashboard() {
  const [expandedCard, setExpandedCard] = useState(null)
  const [permissions, setPermissions] = useState({
    read: true,
    write: false,
    manage: false
  })

  const handleCardClick = (id) => {
    setExpandedCard(prev => (prev === id ? null : id))
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      setExpandedCard(null)
    }
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setExpandedCard(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const integrationHistory = [
    { app: 'GitHub', action: 'Pushed Code', user: 'Bottu Teja Sai', timestamp: '2025-08-05 23:45', details: 'Commit fix: auth bug to main' },
    { app: 'Jira', action: 'Created Issue', user: 'System Bot', timestamp: '2025-08-05 23:20', details: 'Bug: "Login fails on Firefox"' },
    { app: 'ServiceNow', action: 'Updated Incident', user: 'AdminUser1', timestamp: '2025-08-05 22:50', details: 'Changed status to "Resolved"' },
    { app: 'OpenAI', action: 'Modified Prompt', user: 'TejaGPT', timestamp: '2025-08-05 22:30', details: 'Prompt used for summarization' },
    { app: 'Bitbucket', action: 'Synced Repo', user: 'DevOps Script', timestamp: '2025-08-05 21:10', details: 'Synced develop branch' },
    { app: 'VSCode', action: 'Edited Config', user: 'Bottu Teja Sai', timestamp: '2025-08-05 20:40', details: '.env updated for API_KEY' }
  ]

  const usageData = [
    { name: 'Mon', requests: 45, tokens: 1200 },
    { name: 'Tue', requests: 52, tokens: 1400 },
    { name: 'Wed', requests: 38, tokens: 950 },
    { name: 'Thu', requests: 61, tokens: 1650 },
    { name: 'Fri', requests: 48, tokens: 1300 },
    { name: 'Sat', requests: 33, tokens: 800 },
    { name: 'Sun', requests: 29, tokens: 720 }
  ]

  const pieData = [
    { name: 'Active', value: 65, color: '#10B981' },
    { name: 'Pending', value: 25, color: '#F59E0B' },
    { name: 'Error', value: 10, color: '#EF4444' }
  ]

  const cards = [
    {
      id: 'github',
      title: 'GitHub',
      description: 'Git repository management and collaboration',
      icon: <Github className="h-6 w-6" />,
      color: 'bg-gray-800',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'bitbucket',
      title: 'Bitbucket',
      description: 'Atlassian Git solution for teams',
      icon: <GitBranch className="h-6 w-6" />,
      color: 'bg-blue-600',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'servicenow',
      title: 'ServiceNow',
      description: 'IT service management platform',
      icon: <Settings className="h-6 w-6" />,
      color: 'bg-green-600',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'jira',
      title: 'Jira', 
      description: 'Issue and project tracking',
      icon: <Bug className="h-6 w-6" />,
      color: 'bg-blue-500',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'claude',
      title: 'Claude',
      description: 'AI assistant for development tasks',
      icon: <MessageSquare className="h-6 w-6" />,
      color: 'bg-orange-500',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'openai',
      title: 'OpenAI',
      description: 'GPT models and AI capabilities',
      icon: <Brain className="h-6 w-6" />,
      color: 'bg-green-500',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'intellij',
      title: 'IntelliJ IDEA',
      description: 'Integrated development environment',
      icon: <Code className="h-6 w-6" />,
      color: 'bg-red-500',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'vscode',
      title: 'VS Code',
      description: 'Lightweight code editor',
      icon: <Edit3 className="h-6 w-6" />,
      color: 'bg-blue-400',
      status: 'Connected',
      statusColor: 'bg-green-500'
    },
    {
      id: 'visualstudio',
      title: 'Visual Studio',
      description: 'Full-featured IDE for .NET development',
      icon: <Wrench className="h-6 w-6" />,
      color: 'bg-purple-600',
      status: 'Connected',
      statusColor: 'bg-green-500'
    }
  ]

  const renderExpandedContent = (cardId) => {
    const commonTabs = (
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Integration Status</span>
              </div>
              <p className="text-sm text-muted-foreground">Active since March 2024</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Last Sync</span>
              </div>
              <p className="text-sm text-muted-foreground">2 minutes ago</p>
            </div>
          </div>
          
          {(cardId === 'openai' || cardId === 'claude') && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Usage Statistics</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="requests" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium">Read Access</label>
                <p className="text-xs text-muted-foreground">View repositories and files</p>
              </div>
              <Switch 
                checked={permissions.read} 
                onCheckedChange={(checked) => setPermissions(prev => ({...prev, read: checked}))}
              />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium">Write Access</label>
                <p className="text-xs text-muted-foreground">Modify files and create commits</p>
              </div>
              <Switch 
                checked={permissions.write} 
                onCheckedChange={(checked) => setPermissions(prev => ({...prev, write: checked}))}
              />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium">Manage Access</label>
                <p className="text-xs text-muted-foreground">Admin controls and settings</p>
              </div>
              <Switch 
                checked={permissions.manage} 
                onCheckedChange={(checked) => setPermissions(prev => ({...prev, manage: checked}))}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          {renderActionButtons(cardId)}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <div className="max-h-64 overflow-y-auto space-y-2">
            {integrationHistory
              .filter(item => item.app.toLowerCase() === cardId.toLowerCase() || 
                       (cardId === 'github' && item.app === 'GitHub') ||
                       (cardId === 'vscode' && item.app === 'VSCode') ||
                       (cardId === 'openai' && item.app === 'OpenAI'))
              .map((item, index) => (
              <div key={index} className="p-3 bg-muted rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.details}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    )

    return (
      <div className="space-y-6">
        {commonTabs}
        
        <div className="border-t pt-4">
          <Button variant="destructive" size="sm" className="w-full">
            <Trash2 className="h-4 w-4 mr-2" />
            Disconnect Integration
          </Button>
        </div>
      </div>
    )
  }

  const renderActionButtons = (cardId) => {
    switch (cardId) {
      case 'github':
      case 'bitbucket':
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Repositories
            </Button>
            <Button variant="outline" size="sm">
              <FolderOpen className="h-4 w-4 mr-2" />
              Open Repository
            </Button>
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-2" />
              Edit File
            </Button>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Push Commit
            </Button>
          </div>
        )
      case 'servicenow':
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Incident Template
            </Button>
            <Button variant="outline" size="sm">
              <Workflow className="h-4 w-4 mr-2" />
              Modify Workflow
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Records
            </Button>
            <Button variant="outline" size="sm">
              <Bell className="h-4 w-4 mr-2" />
              Create Incident
            </Button>
          </div>
        )
      case 'jira':
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm">
              <Bug className="h-4 w-4 mr-2" />
              Create Issue
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Sprints
            </Button>
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-2" />
              Modify Template
            </Button>
            <Button variant="outline" size="sm">
              <Workflow className="h-4 w-4 mr-2" />
              Workflow Builder
            </Button>
          </div>
        )
      case 'claude':
      case 'openai':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm">
                <Edit3 className="h-4 w-4 mr-2" />
                Modify Prompt
              </Button>
              <Button variant="outline" size="sm">
                <Play className="h-4 w-4 mr-2" />
                Test Prompt
              </Button>
              <Button variant="outline" size="sm">
                <Sliders className="h-4 w-4 mr-2" />
                Configure Parameters
              </Button>
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Usage Stats
              </Button>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <label className="text-sm font-medium mb-2 block">Test Prompt</label>
              <textarea 
                className="w-full h-20 p-2 text-sm border rounded resize-none"
                placeholder="Enter your prompt here..."
              />
              <Button size="sm" className="mt-2">
                <Play className="h-4 w-4 mr-2" />
                Test
              </Button>
            </div>
          </div>
        )
      case 'intellij':
      case 'vscode':
      case 'visualstudio':
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm">
              <Zap className="h-4 w-4 mr-2" />
              Manage Extensions
            </Button>
            <Button variant="outline" size="sm">
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse Files
            </Button>
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-2" />
              Live Edit Code
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure Build
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <motion.div
      className="min-h-screen bg-background"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-4 sm:p-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-center mb-8 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Integration Dashboard
        </h1>
        
        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
          {cards.map(card => (
            <Card
              key={card.id}
              onClick={() => handleCardClick(card.id)}
              className="cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border-2 hover:border-primary/50"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-full text-white ${card.color}`}>
                    {card.icon}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${card.statusColor}`}></div>
                    <Badge variant="secondary" className="text-xs">{card.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg mb-2">{card.title}</CardTitle>
                <CardDescription className="text-sm">{card.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Integration History Table */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Integration History</h2>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="hidden bg-muted md:table-header-group">
                  <tr className="border-b">
                    <th className="text-left p-3 px-4 font-medium">Application</th>
                    <th className="text-left p-3 px-4 font-medium">Action Taken</th>
                    <th className="text-left p-3 px-4 font-medium">Modified By</th>
                    <th className="text-left p-3 px-4 font-medium">Timestamp</th>
                    <th className="text-left p-3 px-4 font-medium">Details / Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationHistory.map((item, index) => (
                    <tr key={index} className="block md:table-row border-b hover:bg-muted/50">
                      <td className="p-4 font-medium md:table-cell" data-label="Application">{item.app}</td>
                      <td className="p-4 md:table-cell" data-label="Action Taken">{item.action}</td>
                      <td className="p-4 md:table-cell" data-label="Modified By">{item.user}</td>
                      <td className="p-4 text-sm text-muted-foreground md:table-cell" data-label="Timestamp">{item.timestamp}</td>
                      <td className="p-4 text-sm md:table-cell" data-label="Details / Summary">{item.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Card Modal */}
      <AnimatePresence>
        {expandedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleOverlayClick}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b gap-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedCard(null)}
                    className="hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full text-white ${cards.find(c => c.id === expandedCard)?.color}`}>
                      {cards.find(c => c.id === expandedCard)?.icon}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">
                        {cards.find(c => c.id === expandedCard)?.title}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {cards.find(c => c.id === expandedCard)?.description}
                      </p>
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">Connected</Badge>
              </div>

              {/* Modal Content */}
              <div className="p-4 sm:p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
                {renderExpandedContent(expandedCard)}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
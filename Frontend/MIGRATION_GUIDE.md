# Unified Component Library - Developer Guide

## 📚 Table of Contents
1. [Introduction](#introduction)
2. [Import Statement](#import-statement)
3. [Component Reference](#component-reference)
4. [Migration Checklist](#migration-checklist)
5. [Code Examples](#code-examples)
6. [Strict Rules](#strict-rules)

---

## Introduction

This guide covers the standardized component library that replaces hardcoded styling patterns. All components follow a consistent API design with semantic variants and design tokens.

**Key Benefits:**
- ✅ Centralized design token system
- ✅ Consistent UI/UX across the application
- ✅ Reduced code duplication
- ✅ Easy theming (light/dark mode)
- ✅ Type-safe props with TypeScript

---

## Import Statement

### ✅ CORRECT - Always import from the barrel file:

```typescript
import { 
  UnifiedCard,
  UnifiedBadge,
  UnifiedModal,
  UnifiedBackButton,
  UnifiedMetricCard,
  UnifiedResultCard,
  UnifiedEntryCard,
  UnifiedExpandable,
  UnifiedFileInput,
  UnifiedTable,
  UnifiedPagination,
  UnifiedRefreshButton,
  UnifiedInlineRefresh,
  UnifiedTableRefresh,
  UnifiedActionLoading
} from "@/components/ui/unified";
```

### ❌ WRONG - Do not import directly from component files:

```typescript
// ❌ Never do this
import { UnifiedCard } from "@/components/ui/unified/card";
import { UnifiedBadge } from "@/components/ui/unified/badge";
```

---

## Component Reference

### 1. UnifiedCard

**Use for:** General-purpose card container

**Props:**
```typescript
interface UnifiedCardProps {
  variant?: "default" | "premium" | "bordered" | "metric";
  padding?: "compact" | "default" | "spacious" | "none";
  hoverable?: boolean;
  clickable?: boolean;
  borderAccent?: "primary" | "success" | "warning" | "destructive" | "emerald" | null;
  className?: string;
  children: ReactNode;
}
```

**Example:**
```typescript
<UnifiedCard 
  variant="premium" 
  padding="default"
  hoverable
  borderAccent="primary"
>
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</UnifiedCard>
```

**Variants:**
- `default` - Standard card with subtle shadow
- `premium` - Enhanced card with backdrop blur and border
- `bordered` - Card with 2px primary border
- `metric` - Card optimized for displaying metrics (hover effects)

---

### 2. UnifiedMetricCard

**Use for:** Displaying key metrics and statistics

**Props:**
```typescript
interface UnifiedMetricCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  iconColor?: "primary" | "success" | "warning" | "destructive" | "muted";
  trend?: { value: number; isPositive: boolean };
  className?: string;
  onClick?: () => void;
}
```

**Example:**
```typescript
import { Activity } from "lucide-react";

<UnifiedMetricCard
  label="Total Scans"
  value={1234}
  description="All time"
  icon={<Activity className="h-5 w-5" />}
  iconColor="primary"
  trend={{ value: 12.5, isPositive: true }}
  onClick={() => console.log("Clicked")}
/>
```

---

### 3. UnifiedResultCard

**Use for:** Displaying scan results or any status-based cards

**Props:**
```typescript
interface UnifiedResultCardProps {
  title: string;
  description?: string;
  status?: "success" | "error" | "warning" | "info" | "neutral";
  statusLabel?: string;
  metrics?: Array<{
    label: string;
    value: string | number;
    valueClassName?: string;
  }>;
  icon?: ReactNode;
  actions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive" | "ghost";
    disabled?: boolean;
  }>;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}
```

**Example:**
```typescript
import { Shield } from "lucide-react";

<UnifiedResultCard
  title="PQC Scan - Production Server"
  description="Completed on Dec 17, 2025"
  status="success"
  statusLabel="PASSED"
  icon={<Shield className="h-5 w-5" />}
  metrics={[
    { label: "Safe Algorithms", value: 45, valueClassName: "text-success" },
    { label: "At Risk", value: 3, valueClassName: "text-warning" },
    { label: "Vulnerable", value: 0, valueClassName: "text-destructive" },
    { label: "Total Scanned", value: 48 }
  ]}
  actions={[
    {
      label: "View Details",
      onClick: () => console.log("View details"),
      variant: "default"
    },
    {
      label: "Export Report",
      onClick: () => console.log("Export"),
      variant: "outline"
    }
  ]}
  onClick={() => console.log("Card clicked")}
/>
```

---

### 4. UnifiedEntryCard

**Use for:** Feature navigation cards (onboarding, dashboard)

**Props:**
```typescript
interface UnifiedEntryCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  actionLabel?: string;
  onClick: () => void;
  variant?: "default" | "premium";
  className?: string;
}
```

**Example:**
```typescript
import { GitBranch } from "lucide-react";

<UnifiedEntryCard
  icon={GitBranch}
  title="Git Repository Scan"
  subtitle="Code Analysis"
  description="Scan your repositories for cryptographic vulnerabilities and compliance issues"
  actionLabel="Start Scanning"
  onClick={() => navigate('/git-scan')}
  variant="premium"
/>
```

---

### 5. UnifiedBadge

**Use for:** Status indicators, tags, labels

**Props:**
```typescript
interface UnifiedBadgeProps {
  variant: "success" | "warning" | "error" | "info" | "pqc" | "neutral";
  label: string;
  size?: "sm" | "md" | "lg";
  pill?: boolean; // rounded-full vs rounded-md
  className?: string;
}
```

**Example:**
```typescript
<UnifiedBadge variant="success" label="Active" size="md" pill />
<UnifiedBadge variant="warning" label="Pending" size="sm" />
<UnifiedBadge variant="error" label="Failed" size="lg" pill={false} />
```

---

### 6. UnifiedBackButton

**Use for:** Navigation back buttons

**Props:**
```typescript
interface UnifiedBackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}
```

**Example:**
```typescript
<UnifiedBackButton 
  onClick={() => navigate(-1)} 
  label="Back" // Default is "Back"
/>
```

---

### 7. UnifiedRefreshButton

**Use for:** Manual and auto-refresh actions

**Props:**
```typescript
interface UnifiedRefreshButtonProps {
  onClick: () => void;
  isRefreshing?: boolean;
  autoRefresh?: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
  autoLabel?: string;
}
```

**Example:**
```typescript
<UnifiedRefreshButton
  onClick={handleRefresh}
  isRefreshing={isLoading}
  autoRefresh={autoRefreshEnabled}
  label="Refresh Data"
  autoLabel="Auto-refreshing..."
/>
```

---

### 8. UnifiedModal

**Use for:** Dialog modals

**Props:**
```typescript
interface UnifiedModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}
```

**Example:**
```typescript
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/unified";

<UnifiedModal 
  isOpen={isModalOpen} 
  onOpenChange={setIsModalOpen}
  size="lg"
>
  <DialogHeader>
    <DialogTitle>Scan Results</DialogTitle>
    <DialogDescription>Detailed analysis of your scan</DialogDescription>
  </DialogHeader>
  
  <div className="py-4">
    {/* Modal content */}
  </div>
  
  <DialogFooter>
    <Button onClick={() => setIsModalOpen(false)}>Close</Button>
  </DialogFooter>
</UnifiedModal>
```

---

### 9. UnifiedExpandable

**Use for:** Accordion/collapsible sections

**Props:**
```typescript
interface UnifiedExpandableProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}
```

**Example:**
```typescript
<UnifiedExpandable 
  trigger={<span>Click to expand</span>}
  defaultOpen={false}
>
  <div className="space-y-2">
    <p>Hidden content that expands</p>
  </div>
</UnifiedExpandable>
```

---

### 10. UnifiedFileInput

**Use for:** File upload with drag & drop

**Props:**
```typescript
interface UnifiedFileInputProps {
  label: string;
  accept?: string;
  helperText?: string;
  errorText?: string;
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  selectedFile?: File | null;
  maxSize?: number; // in MB
  dragAndDrop?: boolean;
  disabled?: boolean;
  className?: string;
}
```

**Example:**
```typescript
<UnifiedFileInput
  label="Upload Configuration"
  accept=".json,.yaml,.yml"
  helperText="Supported formats: JSON, YAML (max 10MB)"
  maxSize={10}
  dragAndDrop
  onFileSelect={(file) => console.log("Selected:", file)}
  onFileRemove={() => console.log("Removed")}
  selectedFile={currentFile}
/>
```

---

### 11. UnifiedTable

**Use for:** Data tables with loading/empty states

**Props:**
```typescript
interface UnifiedTableProps<T> {
  data: T[];
  columns: Array<{
    key: keyof T | string;
    header: ReactNode;
    width?: string;
    render?: (row: T) => ReactNode;
    className?: string;
  }>;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  striped?: boolean;
  hoverable?: boolean;
}
```

**Example:**
```typescript
<UnifiedTable
  data={scanResults}
  columns={[
    {
      key: "name",
      header: "Scan Name",
      width: "30%",
      render: (row) => <span className="font-semibold">{row.name}</span>
    },
    {
      key: "status",
      header: "Status",
      width: "20%",
      render: (row) => <UnifiedBadge variant={row.status} label={row.status} />
    },
    {
      key: "date",
      header: "Date",
      width: "25%"
    },
    {
      key: "score",
      header: "Score",
      width: "25%",
      className: "text-right"
    }
  ]}
  isLoading={isLoading}
  emptyMessage="No scans found"
  onRowClick={(row) => console.log("Clicked:", row)}
  striped
  hoverable
/>
```

---

### 12. UnifiedPagination

**Use for:** Table/list pagination

**Props:**
```typescript
interface UnifiedPaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  className?: string;
}
```

**Example:**
```typescript
<UnifiedPagination
  currentPage={currentPage}
  totalPages={totalPages}
  pageSize={pageSize}
  totalItems={totalItems}
  onPageChange={setCurrentPage}
  onPageSizeChange={setPageSize}
  pageSizeOptions={[10, 25, 50, 100]}
  showPageSize
/>
```

---

### 13. Loading Components

#### UnifiedInlineRefresh
**Use for:** Inline loading indicators

```typescript
<UnifiedInlineRefresh 
  isRefreshing={isRefreshing}
  label="Updating..."
  size="sm"
/>
```

#### UnifiedTableRefresh
**Use for:** Table overlay loading

```typescript
<div className="relative">
  <UnifiedTableRefresh 
    isRefreshing={isLoading}
    message="Loading data..."
  />
  {/* Your table content */}
</div>
```

#### UnifiedActionLoading
**Use for:** Button loading states

```typescript
import { Save } from "lucide-react";

<Button onClick={handleSave} disabled={isSaving}>
  <UnifiedActionLoading
    isLoading={isSaving}
    loadingText="Saving..."
    defaultText="Save Changes"
    icon={<Save className="h-4 w-4 mr-2" />}
  />
</Button>
```

---

## Migration Checklist

### Before You Start
- [ ] Read this entire guide
- [ ] Understand design token system in `@/lib/design-tokens.ts`
- [ ] Review `MIGRATION_GUIDE.md` for additional context

### During Migration
- [ ] Replace all `<Card>` with `<UnifiedCard>`
- [ ] Replace all custom badges with `<UnifiedBadge>`
- [ ] Replace manual back buttons with `<UnifiedBackButton>`
- [ ] Replace hardcoded colors with semantic tokens
- [ ] Update imports to use barrel file
- [ ] Remove local color/style constants (e.g., `COLORS` objects)
- [ ] Replace custom expandable sections with `<UnifiedExpandable>`
- [ ] Standardize all file inputs with `<UnifiedFileInput>`
- [ ] Convert data tables to `<UnifiedTable>`

### After Migration
- [ ] Test all interactive elements (hover, click, focus)
- [ ] Verify dark mode compatibility
- [ ] Check mobile responsiveness
- [ ] Run accessibility audit
- [ ] Remove unused imports and CSS

---

## Code Examples

### Example 1: Migrating a Dashboard Card

**❌ BEFORE:**
```typescript
<Card className="p-6 bg-blue-50 border-l-4 border-blue-500 hover:shadow-lg">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-slate-600">Total Scans</p>
      <p className="text-3xl font-bold text-slate-900">1,234</p>
    </div>
    <Activity className="h-8 w-8 text-blue-600" />
  </div>
</Card>
```

**✅ AFTER:**
```typescript
import { UnifiedMetricCard } from "@/components/ui/unified";
import { Activity } from "lucide-react";

<UnifiedMetricCard
  label="Total Scans"
  value="1,234"
  icon={<Activity className="h-5 w-5" />}
  iconColor="primary"
/>
```

---

### Example 2: Migrating a Results List

**❌ BEFORE:**
```typescript
{results.map((result) => (
  <Card key={result.id} className="p-6 hover:shadow-md cursor-pointer">
    <div className="flex justify-between items-start mb-4">
      <h3 className="font-semibold">{result.name}</h3>
      <span className={`px-2 py-1 rounded text-xs ${
        result.status === 'success' ? 'bg-green-100 text-green-800' : 
        result.status === 'error' ? 'bg-red-100 text-red-800' : 
        'bg-yellow-100 text-yellow-800'
      }`}>
        {result.status}
      </span>
    </div>
    
    <div className="grid grid-cols-3 gap-4">
      <div>
        <p className="text-xs text-slate-500">Safe</p>
        <p className="font-bold text-green-600">{result.safe}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Warning</p>
        <p className="font-bold text-yellow-600">{result.warning}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Error</p>
        <p className="font-bold text-red-600">{result.error}</p>
      </div>
    </div>
    
    <Button className="mt-4 w-full" onClick={() => viewDetails(result.id)}>
      View Details
    </Button>
  </Card>
))}
```

**✅ AFTER:**
```typescript
import { UnifiedResultCard } from "@/components/ui/unified";

{results.map((result) => (
  <UnifiedResultCard
    key={result.id}
    title={result.name}
    status={result.status}
    statusLabel={result.status.toUpperCase()}
    metrics={[
      { 
        label: "Safe", 
        value: result.safe,
        valueClassName: "text-success"
      },
      { 
        label: "Warning", 
        value: result.warning,
        valueClassName: "text-warning"
      },
      { 
        label: "Error", 
        value: result.error,
        valueClassName: "text-destructive"
      }
    ]}
    actions={[
      {
        label: "View Details",
        onClick: () => viewDetails(result.id),
        variant: "default"
      }
    ]}
    onClick={() => viewDetails(result.id)}
  />
))}
```

---

### Example 3: Migrating a Back Button

**❌ BEFORE:**
```typescript
<Button variant="outline" onClick={() => navigate(-1)}>
  <ArrowLeft className="h-4 w-4 mr-2" />
  Back to Dashboard
</Button>
```

**✅ AFTER:**
```typescript
import { UnifiedBackButton } from "@/components/ui/unified";

<UnifiedBackButton onClick={() => navigate(-1)} />
```

---

### Example 4: Migrating Status Badges

**❌ BEFORE:**
```typescript
<span className={`px-2 py-1 rounded-full text-xs font-semibold ${
  status === 'active' ? 'bg-green-100 text-green-800 border border-green-200' :
  status === 'pending' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
  'bg-red-100 text-red-800 border border-red-200'
}`}>
  {status}
</span>
```

**✅ AFTER:**
```typescript
import { UnifiedBadge } from "@/components/ui/unified";

<UnifiedBadge 
  variant={status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'error'}
  label={status}
  size="sm"
/>
```

---

### Example 5: Complete Page Migration

**❌ BEFORE:**
```typescript
const ScanPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  
  return (
    <div className="p-6">
      <Button variant="outline" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2" /> Back to Dashboard
      </Button>
      
      <div className="grid grid-cols-3 gap-4 my-6">
        <Card className="p-6 bg-blue-50 border-l-4 border-blue-500">
          <p className="text-sm text-slate-600">Total</p>
          <p className="text-3xl font-bold">150</p>
        </Card>
        {/* More metric cards */}
      </div>
      
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Recent Scans</h2>
          <Button onClick={handleRefresh}>
            <RefreshCw className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        {/* Table content */}
      </Card>
    </div>
  );
};
```

**✅ AFTER:**
```typescript
import {
  UnifiedBackButton,
  UnifiedMetricCard,
  UnifiedCard,
  UnifiedRefreshButton,
  UnifiedTable
} from "@/components/ui/unified";
import { Activity } from "lucide-react";

const ScanPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  
  return (
    <div className="p-6">
      <UnifiedBackButton onClick={() => navigate(-1)} />
      
      <div className="grid grid-cols-3 gap-4 my-6">
        <UnifiedMetricCard
          label="Total Scans"
          value={150}
          icon={<Activity className="h-5 w-5" />}
          iconColor="primary"
        />
        {/* More metric cards */}
      </div>
      
      <UnifiedCard>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Recent Scans</h2>
          <UnifiedRefreshButton
            onClick={handleRefresh}
            isRefreshing={isLoading}
          />
        </div>
        
        <UnifiedTable
          data={scans}
          columns={columns}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </UnifiedCard>
    </div>
  );
};
```

---

## Strict Rules

### ⚠️ FORBIDDEN - NO EXCEPTIONS

#### ❌ DO NOT:
1. **Use hardcoded Tailwind colors**
   ```typescript
   // ❌ NEVER
   className="bg-blue-500 text-green-600 border-red-400"
   ```

2. **Create duplicate custom components**
   ```typescript
   // ❌ NEVER
   const MyCustomCard = () => <div className="p-6 rounded-lg border">...</div>
   ```

3. **Use inline styles**
   ```typescript
   // ❌ NEVER
   <div style={{ backgroundColor: '#3b82f6', padding: '24px' }}>
   ```

4. **Import from component files directly**
   ```typescript
   // ❌ NEVER
   import { UnifiedCard } from "@/components/ui/unified/card";
   ```

5. **Mix old and new patterns**
   ```typescript
   // ❌ NEVER mix Card and UnifiedCard in same file
   <Card>...</Card>
   <UnifiedCard>...</UnifiedCard>
   ```

---

### ✅ REQUIRED - ALWAYS

#### ✅ DO:
1. **Use design tokens for colors**
   ```typescript
   // ✅ CORRECT
   className="bg-primary text-success border-destructive"
   ```

2. **Import from barrel file**
   ```typescript
   // ✅ CORRECT
   import { UnifiedCard, UnifiedBadge } from "@/components/ui/unified";
   ```

3. **Use semantic variants**
   ```typescript
   // ✅ CORRECT
   <UnifiedBadge variant="success" label="Active" />
   <UnifiedCard variant="metric" />
   ```

4. **Leverage component props instead of custom styling**
   ```typescript
   // ✅ CORRECT
   <UnifiedCard 
     variant="premium"
     padding="spacious"
     borderAccent="primary"
     hoverable
   />
   ```

5. **Use unified loading components**
   ```typescript
   // ✅ CORRECT
   <UnifiedInlineRefresh isRefreshing={loading} />
   <UnifiedTableRefresh isRefreshing={loading} />
   ```

---

## Design Token Reference

### Colors
Always use semantic color names from design tokens:

| Token | Usage | Example |
|-------|-------|---------|
| `primary` | Brand color, primary actions | `text-primary`, `bg-primary` |
| `success` | Success states, positive actions | `text-success`, `border-success` |
| `warning` | Warning states, caution | `text-warning`, `bg-warning/10` |
| `destructive` | Error states, dangerous actions | `text-destructive`, `border-destructive` |
| `muted` | Secondary text, backgrounds | `text-muted-foreground`, `bg-muted` |
| `scan-pqc` | PQC-specific elements | `text-scan-pqc`, `bg-scan-pqc/10` |

### Typography
Use typography tokens for text styles:

```typescript
import { typography } from "@/lib/design-tokens";

// Available tokens:
typography.h1  // "text-3xl font-bold tracking-tight"
typography.h2  // "text-2xl font-semibold"
typography.h3  // "text-xl font-semibold"
typography.base // "text-sm leading-relaxed"
typography.label // "text-sm font-medium"
```

---

## Code Review Checklist

Before submitting a PR, verify:

- [ ] All imports use barrel file: `from "@/components/ui/unified"`
- [ ] No hardcoded colors (search for `bg-blue`, `text-green`, etc.)
- [ ] No custom card implementations
- [ ] All badges use `UnifiedBadge`
- [ ] All back buttons use `UnifiedBackButton`
- [ ] All metrics use `UnifiedMetricCard`
- [ ] All scan results use `UnifiedResultCard`
- [ ] All file inputs use `UnifiedFileInput`
- [ ] All tables use `UnifiedTable`
- [ ] All pagination uses `UnifiedPagination`
- [ ] Loading states use unified loading components
- [ ] No inline styles
- [ ] Dark mode tested
- [ ] Mobile responsive
- [ ] Accessibility checked

---

## Quick Reference Card

```typescript
// ==================== IMPORTS ====================
import {
  // Cards
  UnifiedCard,
  UnifiedMetricCard,
  UnifiedResultCard,
  UnifiedEntryCard,
  
  // Buttons
  UnifiedBackButton,
  UnifiedRefreshButton,
  
  // Other
  UnifiedBadge,
  UnifiedModal,
  UnifiedExpandable,
  UnifiedFileInput,
  UnifiedTable,
  UnifiedPagination,
  
  // Loading
  UnifiedInlineRefresh,
  UnifiedTableRefresh,
  UnifiedActionLoading,
} from "@/components/ui/unified";

// ==================== USAGE ====================

// Card
<UnifiedCard variant="premium" padding="default" hoverable>
  Content
</UnifiedCard>

// Metric
<UnifiedMetricCard
  label="Total"
  value={1234}
  icon={<Icon />}
  iconColor="primary"
/>

// Result
<UnifiedResultCard
  title="Scan Name"
  status="success"
  metrics={[{ label: "Safe", value: 45 }]}
  actions={[{ label: "View", onClick: () => {} }]}
/>

// Badge
<UnifiedBadge variant="success" label="Active" />

// Back Button
<UnifiedBackButton onClick={() => navigate(-1)} />

// Refresh Button
<UnifiedRefreshButton onClick={refresh} isRefreshing={loading} />

// Table
<UnifiedTable
  data={data}
  columns={columns}
  isLoading={loading}
/>

// Pagination
<UnifiedPagination
  currentPage={page}
  totalPages={total}
  pageSize={size}
  totalItems={items}
  onPageChange={setPage}
/>
```

---

## Troubleshooting

### Issue: Component not rendering
**Solution:** Verify import path uses barrel file

### Issue: Colors not working
**Solution:** Check if CSS variables are defined in `index.css`

### Issue: Dark mode not working
**Solution:** Ensure using semantic tokens, not hardcoded colors

### Issue: TypeScript errors
**Solution:** Update component props to match interface definitions

### Issue: Styling conflicts
**Solution:** Remove conflicting `className` props, use component variants instead

---

## Additional Resources

- **Design Tokens:** `Frontend/src/lib/design-tokens.ts`
- **Migration Guide:** `Frontend/MIGRATION_GUIDE.md`
- **Component Source:** `Frontend/src/components/ui/unified/`
- **Tailwind Config:** `Frontend/tailwind.config.ts`

---

## Version History

- **v1.0** - Initial unified component library
- **v1.1** - Added loading components
- **v1.2** - Added EntryCard and ResultCard enhancements
- **v2.0** - Current version with full component set

---

**Last Updated:** December 17, 2025  
**Maintained By:** Frontend Team
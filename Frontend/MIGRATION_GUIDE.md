# UI Migration Guide: Old Patterns to New Design System

This document outlines the mapping from old, inconsistent UI patterns to the new, unified design system. Use this as a reference when refactoring components.

## Phase 1: Token Migration

The core of the new system is a set of design tokens for colors, typography, and spacing. These are defined in `src/lib/design-tokens.ts` and consumed through `tailwind.config.ts` and global CSS variables in `src/index.css`.

### Color Mapping

Always prefer using semantic theme colors over specific hex or Tailwind color names.

| Old Pattern (`className`)              | New Pattern (`className` or Component)      | Notes                                    |
| -------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| `text-blue-600`, `bg-blue-700`         | `text-primary`, `bg-primary`                | For primary actions, links, and highlights. |
| `text-green-500`, `bg-emerald-500`     | `text-success`, `bg-success`                | For success messages, valid states.      |
| `text-red-600`, `bg-rose-500`          | `text-destructive`, `bg-destructive`        | For errors, warnings, and delete actions.|
| `text-yellow-500`, `text-amber-500`    | `text-warning`, `bg-warning`                | For non-critical warnings.               |
| `bg-gray-100`, `border-slate-200`      | `bg-muted`, `border`                        | For secondary content and borders.       |
| Hardcoded hex (`#1e3a8a`, `#3b82f6`)   | `text-primary`, `bg-primary`, etc.          | **No hardcoded hex colors allowed.**     |

### Badge Mapping

Replace all custom badge implementations with the `UnifiedBadge` component (to be created).

| Old Pattern (`className` or Component)   | New Component                               | Notes                                 |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------- |
| `<span class="bg-green-100 ...">`        | `<UnifiedBadge variant="success" />`        | Use the appropriate variant.          |
| `<StatusBadge status="active">`            | `<UnifiedBadge variant="success" />`        | Map status to the correct variant.    |
| `bg-emerald-50`, `px-2.5`, `rounded-md`    | `<UnifiedBadge variant="success" />`        | The component handles all styling.    |

### Button Mapping

Replace all custom button styles with the extended Shadcn `Button` component.

| Old Pattern (`className`)                     | New Component                                   | Notes                                  |
| --------------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| `bg-blue-600`, `h-10`, `px-6`, `rounded-lg`    | `<Button size="default">`                       | Use `default` variant for primary CTAs.|
| `bg-gradient-to-r from-blue-600...`           | `<Button>`                                      | Gradient styles should be deprecated.  |
| `hover:bg-gray-100` (ghost button)            | `<Button variant="ghost">`                      | For low-emphasis actions.              |
| `p-2 hover:bg-muted` (icon-only)              | `<Button variant="ghost" size="icon">`          | For icon-only buttons.                 |

## Phase 2: Component Migration

Replace custom-built components with their standardized `Unified*` counterparts from `src/components/ui/`.

### Card Mapping

| Old Pattern (`className`)                  | New Component                                 | Notes                               |
| ------------------------------------------ | --------------------------------------------- | ----------------------------------- |
| `bg-white dark:bg-slate-900 rounded-lg...` | `<UnifiedCard>`                               | Default card style.                 |
| `backdrop-blur-xl bg-white/80...`          | `<UnifiedCard variant="premium">`             | For "premium" highlighted cards.    |
| `bg-gradient-to-br from-card...`           | `<UnifiedCard variant="bordered">`            | Use the bordered variant for emphasis. |

### Modal / Dialog Mapping

All modals must use the standard Shadcn `Dialog` component.

| Old Pattern                        | New Component                               | Notes                                  |
| ---------------------------------- | ------------------------------------------- | -------------------------------------- |
| Custom `Modal` component           | `<Dialog><DialogContent>...`                | Standardizes animations and structure. |
| `framer-motion` full-screen modal  | `<Dialog><DialogContent>...`                | Use `className` to set `max-w-*`.      |

---

## ⚠️ STRICT RULES - NO EXCEPTIONS

### ❌ FORBIDDEN
1. **DO NOT** create custom card/badge/button components
2. **DO NOT** use hardcoded Tailwind colors (blue-*, green-*, etc.)
3. **DO NOT** use inline styles or custom CSS classes for spacing
4. **DO NOT** create duplicate modal implementations
5. **DO NOT** use hardcoded pixel values (h-[73px], mt-[13px])

### ✅ REQUIRED
1. **USE** components from `@/components/ui/unified` ONLY
2. **USE** design tokens from `lib/design-tokens.ts`
3. **USE** Shadcn UI components for base elements
4. **USE** typography tokens (text-h1, text-base, text-label)
5. **USE** spacing tokens (gap-4, space-y-6, p-6)

###  Code Review Checklist
Before submitting PR, verify:
- [ ] No `text-blue-*/bg-green-*` etc. (use semantic tokens)
- [ ] No custom cards (use UnifiedCard or UnifiedResultCard)
- [ ] No duplicate badge logic (use UnifiedBadge)
- [ ] No custom file inputs (use UnifiedFileInput)
- [ ] No hardcoded spacing (use tokens)
- [ ] All modals use Shadcn Dialog or UnifiedModal
- [ ] Back buttons use UnifiedBackButton



Frontend Design System Implementation Guide
Overview
This guide establishes the standard approach for building new pages and migrating existing pages to use our unified design system. Following these guidelines ensures complete visual and functional consistency across the application.

Core Principles
1. Single Source of Truth

All UI components MUST come from @/components/ui/unified
All colors MUST use design tokens from @/lib/design-tokens
Never create duplicate components or one-off implementations

2. Import Strategy
Always use the barrel export for clean, organized imports:
typescript// ✅ CORRECT
import { 
  UnifiedCard, 
  UnifiedBadge, 
  UnifiedBackButton,
  UnifiedResultCard 
} from '@/components/ui/unified';

// ❌ WRONG
import { UnifiedCard } from '@/components/ui/unified/card';
import { UnifiedBadge } from '@/components/ui/unified-badge'; // old path
3. Design Token Usage
typescriptimport { colorTokens, typography, spacing } from '@/lib/design-tokens';

// ✅ CORRECT - Use semantic tokens
<div className="bg-primary text-foreground border-border">
<p className="text-success">Success message</p>
<span className="text-destructive">Error</span>

// ❌ WRONG - Never use hardcoded colors
<div className="bg-blue-500 text-slate-600 border-gray-300">
<p className="text-green-600">Success message</p>

Component Catalog & Usage
UnifiedCard
Purpose: All card-based layouts, containers, and content grouping
Variants:

default - Standard card for general content
premium - Enhanced styling with accent borders
metric - Optimized for displaying statistics/KPIs

Props:
typescript{
  variant?: 'default' | 'premium' | 'metric';
  padding?: 'none' | 'compact' | 'normal' | 'comfortable';
  borderAccent?: boolean;
  className?: string;
  children: ReactNode;
}
Usage Examples:
typescript// Statistics/KPI display
<UnifiedCard variant="metric" padding="comfortable">
  <h3 className="text-2xl font-bold">{count}</h3>
  <p className="text-muted-foreground">Total Scans</p>
</UnifiedCard>

// Content sections
<UnifiedCard variant="default" padding="normal">
  <CardHeader>
    <CardTitle>Scan Results</CardTitle>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</UnifiedCard>

// Premium feature highlighting
<UnifiedCard variant="premium" borderAccent>
  <div className="flex items-center gap-3">
    <Star className="text-primary" />
    <span>Premium Feature</span>
  </div>
</UnifiedCard>

UnifiedBadge
Purpose: Status indicators, tags, labels, and categorical markers
Variants:

success - Completed, active, positive states
error / destructive - Failed, critical, negative states
warning - Caution, pending, needs attention
info - Informational, neutral status
default - Generic labels

Usage Examples:
typescript// Status indication
<UnifiedBadge variant="success">Active</UnifiedBadge>
<UnifiedBadge variant="error">Failed</UnifiedBadge>
<UnifiedBadge variant="warning">Pending</UnifiedBadge>

// Severity levels
<UnifiedBadge variant="destructive">Critical</UnifiedBadge>
<UnifiedBadge variant="warning">Medium</UnifiedBadge>
<UnifiedBadge variant="info">Low</UnifiedBadge>

// Tags and categories
<UnifiedBadge variant="default">TLS 1.2</UnifiedBadge>
<UnifiedBadge variant="info">RSA-2048</UnifiedBadge>

UnifiedResultCard
Purpose: Displaying scan results, job details, or any list item with rich metadata
Features:

Built-in expand/collapse functionality
Consistent header with title, subtitle, and badges
Metadata grid layout
Action buttons area

Usage Example:
typescript<UnifiedResultCard
  title="Scan Job #12345"
  subtitle="PostgreSQL Database"
  status={<UnifiedBadge variant="success">Completed</UnifiedBadge>}
  metadata={[
    { label: "Started", value: "2024-01-15 10:30 AM" },
    { label: "Duration", value: "5m 23s" },
    { label: "Findings", value: "12 issues" }
  ]}
  expandable
  expandedContent={
    <div className="space-y-4">
      {/* Detailed findings */}
    </div>
  }
  actions={
    <>
      <Button variant="outline" size="sm">
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
      <Button size="sm">View Details</Button>
    </>
  }
/>

UnifiedBackButton
Purpose: Consistent navigation back to previous view
Usage:
typescript// Simple usage
<UnifiedBackButton onClick={() => setView('dashboard')} />

// With custom text (rare - use only when "Back" is insufficient)
<UnifiedBackButton onClick={handleBack} text="Return to Overview" />

UnifiedExpandable
Purpose: Accordion-style expandable sections
Usage:
typescript<UnifiedExpandable
  title="Advanced Options"
  defaultOpen={false}
>
  <div className="space-y-4">
    {/* Collapsible content */}
  </div>
</UnifiedExpandable>

UnifiedModal
Purpose: All dialog/modal interactions
Usage:
typescript<UnifiedModal
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Scan Configuration"
  description="Configure your scan parameters"
>
  <div className="space-y-4">
    {/* Modal content */}
  </div>
  <div className="flex justify-end gap-2 mt-6">
    <Button variant="outline" onClick={() => setIsOpen(false)}>
      Cancel
    </Button>
    <Button onClick={handleSubmit}>Start Scan</Button>
  </div>
</UnifiedModal>

UnifiedTable
Purpose: Data tables with consistent styling
Usage:
typescript<UnifiedTable
  headers={['Name', 'Status', 'Date', 'Actions']}
  data={scanJobs}
  renderRow={(job) => (
    <>
      <td className="px-4 py-3">{job.name}</td>
      <td className="px-4 py-3">
        <UnifiedBadge variant={job.status === 'completed' ? 'success' : 'warning'}>
          {job.status}
        </UnifiedBadge>
      </td>
      <td className="px-4 py-3">{job.date}</td>
      <td className="px-4 py-3">
        <Button size="sm" variant="ghost">View</Button>
      </td>
    </>
  )}
/>

UnifiedFileInput
Purpose: File upload with drag-and-drop
Usage:
typescript<UnifiedFileInput
  accept=".pdf,.csv"
  maxSize={5 * 1024 * 1024} // 5MB
  onFileSelect={(file) => handleFileUpload(file)}
  label="Upload Scan Configuration"
/>

UnifiedPagination
Purpose: Navigating paginated data
Usage:
typescript<UnifiedPagination
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={setCurrentPage}
  itemsPerPage={itemsPerPage}
  totalItems={totalItems}
/>

Building a New Page: Step-by-Step
Step 1: Setup Imports
typescriptimport { useState } from 'react';
import { UnifiedCard, UnifiedBadge, UnifiedBackButton } from '@/components/ui/unified';
import { Button } from '@/components/ui/button';
import { colorTokens, typography } from '@/lib/design-tokens';
import { AlertCircle, CheckCircle } from 'lucide-react';
Step 2: Page Layout Structure
typescriptexport default function NewScanPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      {/* Navigation */}
      <div className="mb-6">
        <UnifiedBackButton onClick={() => navigate('/dashboard')} />
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className={typography.display}>New Scan Type</h1>
        <p className={typography.muted}>Description of the scan functionality</p>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Use UnifiedCard for metrics */}
        </div>

        {/* Main Content Area */}
        <UnifiedCard variant="default" padding="normal">
          {/* Content */}
        </UnifiedCard>
      </div>
    </div>
  );
}
Step 3: Implement Statistics Section
typescript<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <UnifiedCard variant="metric" padding="comfortable">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">Total Scans</p>
        <h3 className="text-2xl font-bold text-foreground">{totalScans}</h3>
      </div>
      <CheckCircle className="h-8 w-8 text-success" />
    </div>
  </UnifiedCard>

  <UnifiedCard variant="metric" padding="comfortable">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">Active</p>
        <h3 className="text-2xl font-bold text-foreground">{activeScans}</h3>
      </div>
      <AlertCircle className="h-8 w-8 text-warning" />
    </div>
  </UnifiedCard>

  {/* More metric cards */}
</div>
Step 4: Build Results/Data Section
typescript<UnifiedCard variant="default" padding="normal">
  <div className="space-y-4">
    {scanResults.map((result) => (
      <UnifiedResultCard
        key={result.id}
        title={result.name}
        subtitle={result.target}
        status={
          <UnifiedBadge 
            variant={result.status === 'completed' ? 'success' : 'warning'}
          >
            {result.status}
          </UnifiedBadge>
        }
        metadata={[
          { label: "Date", value: result.date },
          { label: "Duration", value: result.duration }
        ]}
        expandable
        expandedContent={
          <DetailedResultsView data={result.details} />
        }
      />
    ))}
  </div>
</UnifiedCard>

Migrating an Existing Page: Checklist
Phase 1: Audit & Identify

 List all custom-styled <div> cards → Replace with UnifiedCard
 Find all status indicators → Replace with UnifiedBadge
 Locate hardcoded colors (e.g., bg-blue-500) → Replace with tokens
 Identify custom modals → Replace with UnifiedModal
 Find back buttons → Replace with UnifiedBackButton
 Check for tables → Replace with UnifiedTable

Phase 2: Update Imports
typescript// Remove old imports
- import { Card } from '@/components/ui/card';
- import { Badge } from '@/components/ui/badge';

// Add unified imports
+ import { 
+   UnifiedCard, 
+   UnifiedBadge,
+   UnifiedBackButton 
+ } from '@/components/ui/unified';
Phase 3: Replace Components
Cards:
typescript// Before
<div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
  <h3 className="font-bold text-lg">Title</h3>
  <p>Content</p>
</div>

// After
<UnifiedCard variant="default" padding="normal">
  <h3 className="font-bold text-lg">Title</h3>
  <p>Content</p>
</UnifiedCard>
Status Badges:
typescript// Before
<span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
  Success
</span>

// After
<UnifiedBadge variant="success">Success</UnifiedBadge>
Back Buttons:
typescript// Before
<Button variant="outline" onClick={handleBack}>
  <ArrowLeft className="h-4 w-4 mr-2" />
  Back to Dashboard
</Button>

// After
<UnifiedBackButton onClick={handleBack} />
Phase 4: Color Token Migration
typescript// Before
className="bg-blue-500 text-white border-gray-300"
className="text-green-600"
className="bg-red-50 text-red-800"

// After
className="bg-primary text-primary-foreground border-border"
className="text-success"
className="bg-destructive/10 text-destructive"
Phase 5: Testing

 Visual verification in light mode
 Visual verification in dark mode
 Mobile responsiveness (< 768px)
 Tablet responsiveness (768px - 1024px)
 Desktop responsiveness (> 1024px)
 All interactive elements functional
 Keyboard navigation works
 Screen reader accessibility (basic check)


Color Token Reference
Semantic Tokens (Use These)
typescript// Backgrounds
bg-background           // Main page background
bg-card                 // Card backgrounds
bg-muted                // Subtle backgrounds

// Text
text-foreground         // Primary text
text-muted-foreground   // Secondary text
text-primary            // Brand color text
text-success            // Success messages
text-destructive        // Error messages
text-warning            // Warning messages

// Borders
border-border           // Standard borders
border-primary          // Accent borders

// States (with opacity)
bg-primary/10           // 10% opacity primary
text-success/80         // 80% opacity success
Never Use These
❌ bg-blue-500, text-slate-600, border-gray-300
❌ Hardcoded hex values: bg-[#1A4FFF]
❌ RGB values: text-[rgb(100,100,100)]

Typography Usage
typescriptimport { typography } from '@/lib/design-tokens';

// Page titles
<h1 className={typography.display}>Dashboard</h1>

// Section headings
<h2 className={typography.h1}>Recent Scans</h2>
<h3 className={typography.h2}>Configuration</h3>

// Body text
<p className={typography.base}>Description text</p>

// Labels
<label className={typography.label}>Field Name</label>

// Muted text
<span className={typography.muted}>Secondary information</span>

Responsive Design Patterns
Grid Layouts
typescript// Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Mobile: 1 column, Desktop: 4 columns
<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
Conditional Rendering for Mobile
typescript{/* Mobile view */}
<div className="block md:hidden">
  <MobileOptimizedComponent />
</div>

{/* Desktop view */}
<div className="hidden md:block">
  <DesktopTableComponent />
</div>

Pre-Commit Checklist
Before committing your work, verify:

 ✅ All components imported from @/components/ui/unified
 ✅ Zero hardcoded colors (no bg-blue-500, etc.)
 ✅ All colors use design tokens
 ✅ UnifiedBackButton used for navigation
 ✅ UnifiedCard used for all card layouts
 ✅ UnifiedBadge used for all status indicators
 ✅ Typography tokens used where applicable
 ✅ Mobile responsiveness tested
 ✅ Dark mode verified
 ✅ No console errors
 ✅ Code formatted with Prettier


Common Mistakes to Avoid
❌ Creating Custom Variants
typescript// DON'T create one-off styled components
<div className="rounded-xl shadow-2xl bg-gradient-to-r from-blue-500 to-purple-600">
❌ Mixing Old and New Components
typescript// DON'T mix Card and UnifiedCard in the same page
<Card>...</Card>
<UnifiedCard>...</UnifiedCard>
❌ Inline Styles
typescript// DON'T use inline styles
<div style={{ backgroundColor: '#3B82F6' }}>
❌ Inconsistent Spacing
typescript// DON'T mix spacing scales arbitrarily
<div className="p-3"> {/* Then later */}
<div className="p-7">
// USE the standard scale: p-2, p-4, p-6, p-8

Questions to Ask Yourself
Before writing any UI code:

"Does a unified component already exist for this?"

If yes → Use it
If no → Consider if it should be added to the library


"Am I using design tokens for ALL colors?"

Check every className for hardcoded colors


"Will this look consistent with other pages?"

Compare side-by-side with existing pages


"Is this component reusable?"

If used 2+ times → Extract to unified library


"Have I tested in dark mode?"

Always verify both themes




Getting Help

Design Tokens: See Frontend/src/lib/design-tokens.ts
Migration Examples: See Frontend/MIGRATION_GUIDE.md
Component Library: See Frontend/src/components/ui/unified/
Existing Implementations: Reference PQC-Scans.tsx as the gold standard
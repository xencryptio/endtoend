
// =================================================================
// UNIFIED DESIGN SYSTEM TOKENS
//
// This file is the single source of truth for all design-related
// constants in the application. Do not use hardcoded values for
// colors, typography, or spacing in components. Instead, import
// them from this file or use the corresponding Tailwind CSS
// utility classes that are extended via tailwind.config.ts.
//
// =================================================================

// -----------------------------------------------------------------
// 1. COLOR TOKEN SYSTEM
// -----------------------------------------------------------------

export const colorTokens = {
  // Base system colors for layout, text, and borders.
  // These are mapped to CSS variables to support light/dark modes.
  border: "hsl(var(--border))",
  input: "hsl(var(--input))",
  ring: "hsl(var(--ring))",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",

  // Brand colors, representing the primary identity of the application.
  // This is the single source for the main brand color.
  primary: {
    DEFAULT: "#1A4FFF",
    foreground: "#ffffff",
  },

  // Semantic status colors for UI feedback (e.g., success, error states).
  success: { DEFAULT: "#10b981", foreground: "#ffffff" },
  destructive: { DEFAULT: "#ef4444", foreground: "#ffffff" },
  warning: { DEFAULT: "#f59e0b", foreground: "#ffffff" },

  // Domain-specific semantic colors related to scan results.
  scan: {
    pqc: "#8b5cf6",        // Purple for PQC scans
    safe: "#10b981",       // Green for safe/compliant results
    vulnerable: "#f43f5e", // Rose for vulnerable results
    http: "#f59e0b",       // Amber for HTTP/non-secure warnings
  },

  // Color palette for charts and data visualizations.
  // Mapped to CSS variables for theming.
  chart: {
    1: "hsl(var(--chart-1))",
    2: "hsl(var(--chart-2))",
    3: "hsl(var(--chart-3))",
    4: "hsl(var(--chart-4))",
    5: "hsl(var(--chart-5))",
  },
  
  // Secondary and muted colors from the Shadcn UI palette.
  secondary: {
    DEFAULT: "hsl(var(--secondary))",
    foreground: "hsl(var(--secondary-foreground))",
  },
  muted: {
    DEFAULT: "hsl(var(--muted))",
    foreground: "hsl(var(--muted-foreground))",
  },
  accent: {
    DEFAULT: "hsl(var(--accent))",
    foreground: "hsl(var(--accent-foreground))",
  },
  popover: {
    DEFAULT: "hsl(var(--popover))",
    foreground: "hsl(var(--popover-foreground))",
  },
  card: {
    DEFAULT: "hsl(var(--card))",
    foreground: "hsl(var(--card-foreground))",
  },
};

// -----------------------------------------------------------------
// 2. TYPOGRAPHY SYSTEM
// -----------------------------------------------------------------

export const typography = {
  // Large, page-level display text.
  display: "text-4xl font-bold tracking-tight",
  
  // Section headers with a clear hierarchy.
  h1: "text-3xl font-bold tracking-tight",
  h2: "text-2xl font-semibold tracking-tight",
  h3: "text-xl font-semibold",
  h4: "text-lg font-semibold",

  // Body text styles.
  base: "text-base",      // Default body text (16px)
  small: "text-sm",       // Smaller body text or captions (14px)
  
  // Specialized text styles.
  label: "text-xs uppercase tracking-wider font-semibold", // For form labels or metadata
  code: "font-mono text-sm", // For displaying code snippets
};

// -----------------------------------------------------------------
// 3. SPACING & LAYOUT SYSTEM
// -----------------------------------------------------------------

export const spacing = {
  // Standard container widths for responsive layouts.
  container: {
    sm: "max-w-3xl",
    md: "max-w-5xl",
    lg: "max-w-7xl",
    xl: "max-w-[1400px]"
  },
  
  // Consistent page padding for main content areas.
  page: "px-6 py-8 md:px-8 md:py-12",
  
  // Vertical rhythm for sections.
  section: "space-y-8",
  
  // Gap utilities for flexbox and grid layouts.
  gap: {
    tight: "gap-2",
    default: "gap-4",
    relaxed: "gap-6",
    loose: "gap-8"
  }
};

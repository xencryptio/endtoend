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

This guide is a living document and will be updated as the migration progresses.

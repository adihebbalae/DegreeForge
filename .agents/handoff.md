# Handoff: TASK-005 — App Shell + Page Layout + Routing
**Task ID**: TASK-005
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user degree planner for UT Austin ECE. TASK-001 scaffolded the monorepo. TASK-002 built the data layer (DataContext, all hooks). The app currently shows a placeholder page.

There are **two main views**:
1. **V1 Planner** (`/`) — 4-year degree plan with timeline grid, course palette, progress bars, chat
2. **V2 Scheduler** (`/schedule`) — next-semester schedule optimizer with weekly calendar view

**Why this task matters**: This establishes the page structure, layout containers, and routing that every other UI task (TASK-006 through TASK-016) builds into. Component placement areas must be sized correctly now.

## Task

### 1. Install React Router

```bash
cd packages/client && npm install react-router-dom
```

### 2. App layout structure

```
App.tsx
  └── BrowserRouter
        └── Layout (header + main area)
              ├── Header (title, nav links V1/V2, dark mode toggle)
              └── Routes
                    ├── / → PlannerPage
                    └── /schedule → SchedulerPage
```

### 3. `src/pages/PlannerPage.tsx`

Three-panel layout:
```
┌─────────────────────────────────────────────────────────────┐
│  Header: DegreeForge | [Planner] [Schedule]        [🌙]     │
├────────────────────────────────────────┬────────────────────┤
│  Progress bars (full width top strip)  │                    │
├──────────────────────────┬─────────────┤  Course Palette    │
│                          │             │  (right sidebar)   │
│   Semester Timeline Grid │  Chat Panel │                    │
│   (main area, scrollable)│  (slide-in) │                    │
│                          │             │                    │
└──────────────────────────┴─────────────┴────────────────────┘
```

- **Left main area** (~65% width): Semester timeline — scrollable horizontally, contains semester columns
- **Right sidebar** (~35% width): Course palette panel
- **Top strip** (above timeline): Progress bars
- **Chat panel**: Slide-in overlay from the right (not always visible) — floating button to open

### 4. `src/pages/SchedulerPage.tsx`

Simple two-column layout:
```
┌─────────────────────────────────────────────────────────────┐
│  Header                                                      │
├──────────────────────────────────┬──────────────────────────┤
│  Course selector + ranked        │  Weekly calendar view    │
│  schedule cards (left ~40%)      │  (right ~60%)            │
└──────────────────────────────────┴──────────────────────────┘
```

Use placeholder `<div>` areas for now — TASK-015/016 will fill them.

### 5. Header component (`src/components/Header.tsx`)

```tsx
- Left: "DegreeForge" logo/wordmark (text)
- Center: Nav links — "Planner" (active when /) and "Schedule" (active when /schedule)
- Right: Dark mode toggle button (sun/moon icon using lucide-react)
```

Use shadcn `Button` with `variant="ghost"` for nav links. Active link gets underline or different variant.

### 6. Dark mode

Use Tailwind's `dark:` variant with class-based dark mode (`darkMode: 'class'` in tailwind.config). Toggle adds/removes `dark` class on `<html>`. Persist preference to `localStorage`.

### 7. Wrap in DataContext

`src/main.tsx` should look like:
```tsx
<BrowserRouter>
  <DataProvider>
    <App />
  </DataProvider>
</BrowserRouter>
```

`App.tsx` renders `<Layout>` which renders the routes.

## Acceptance Criteria
- [ ] Two routes work: `/` renders PlannerPage, `/schedule` renders SchedulerPage
- [ ] Header shows nav links, clicking switches routes
- [ ] Dark mode toggle works and persists to localStorage
- [ ] PlannerPage has 3 placeholder layout areas (timeline, palette, progress)
- [ ] SchedulerPage has 2 placeholder layout areas  
- [ ] DataContext wraps entire app (hooks available in all pages)
- [ ] `tsc --noEmit` passes, no TypeScript errors
- [ ] No console errors on load

## Validation Gates
- [ ] `npm run dev` — both pages load without errors
- [ ] `cd packages/client && npx tsc --noEmit` — no errors
- [ ] Dark mode toggle works in browser

## Files to Read First
- `packages/client/src/main.tsx` — current entry point
- `packages/client/src/App.tsx` — current app root
- `packages/client/src/context/DataContext.tsx` — from TASK-002

## Constraints
- Do NOT add page content beyond layout containers/placeholders — TASK-006 through TASK-016 fill them
- Do NOT use any routing library other than react-router-dom
- Do NOT add CSS files or styled-components — Tailwind utility classes only
- Use shadcn/ui components for all interactive elements (buttons, etc.)
- Commit when done: `git add -A && git commit -m "feat(TASK-005): app shell, page layout, React Router routing, dark mode"`

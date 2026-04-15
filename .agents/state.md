# DegreeForge Project State

**Current Task**: [TASK-010] Prerequisite validation UI (borders, tooltips, highlights)
**Status**: COMPLETE ✅

## Overview
DegreeForge is an interactive degree planner for UT Austin ECE students. It is currently in Phase 3 (Building).

## Recent Accomplishments
- **TASK-001**: Scaffolded monorepo with Vite/React/TS client and Express/TS server.
- **TASK-002**: Implemented data layer with 11 typed hooks and E E -> ECE normalization.
- **TASK-003**: Built core prerequisite graph engine with topological sort and validation logic.
- **TASK-005**: Built app layout with header, sidebar, and 3-panel planner.     
- **TASK-006**: Implemented 8-semester timeline grid with course cards and GPA badges.
- **TASK-007**: Built course palette with collapsible categories and search.    
- **TASK-008**: Implemented drag-and-drop between palette and timeline semesters.
- **TASK-009**: Built Progress Bars for tracking requirements.
- **TASK-010**: Implemented Prerequisite Validation UI:
    - **Red borders**: Missing prerequisites (must be taken before).
    - **Orange borders**: Misplaced corequisites (must be taken same or earlier).
    - **Tooltips**: Hovering a violated card lists specific missing courses.
    - **Highlights**: Hovering any course highlights its downstream dependents in purple.
    - **Validation Banner**: Top-level summary of issues.
    - **Reactive**: Validation updates live on every drag-and-drop or reorder.

## Progress (TASK-010)
- Created `useValidation` and `usePrereqGraph` hooks.
- Integrated `shadcn/ui` Tooltip component.
- Added 6 unit tests in `graph-engine.test.ts` to verify validation and downstream logic.
- Verified `tsc --noEmit` passes with 0 errors.

## Next Steps
- **TASK-011**: What-if simulator (tech core track switching).
- **TASK-012**: Claude chat integration for planning advice.

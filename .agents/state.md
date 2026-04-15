# DegreeForge Project State

**Current Task**: [TASK-013] External links + course detail popover
**Status**: IN_PROGRESS ðŸ› ï¸ 

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
- **TASK-011**: Implemented What-If Simulator:
    - **Dropdown**: Select any of the 9 tech core tracks.
    - **Toggle**: Math BA double-major consideration.
    - **Diff Preview**: Real-time summary of added/removed courses and credit impact.
    - **Projected Mode**: Progress bars and palette update live in simulation mode.
    - **Apply/Cancel**: Commit simulation to real plan or revert.

## Progress (TASK-011)
- Created `WhatIfPanel` component using shadcn/ui.
- Implemented `computeWhatIfDiff` logic in `lib/what-if.ts`.
- Updated `PlanContext` with `whatIf` state and actions.
- Integrated `WhatIfPanel` into `PlannerPage` as a left-side slide-over.
- Verified with unit tests and `tsc --noEmit`.

## Next Steps
- **TASK-013**: External links + course detail popover.
- **TASK-012**: Claude chat integration (already partially complete/integrated).

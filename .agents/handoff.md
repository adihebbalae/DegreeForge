# Handoff: TASK-008 — Drag-Drop System (dnd-kit)
**Task ID**: TASK-008
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user degree planner for UT Austin ECE student Adi. Previous tasks complete:
- TASK-006: Semester timeline grid with `PlanContext` (useReducer) + `CourseCard` components + empty `DroppableSlot` placeholder components
- TASK-007: Course palette panel with palette `CourseCard` variants

The app now shows a static layout: timeline on the left with Adi's placed courses, palette on the right with remaining courses. Drag-drop is not yet connected — cards and drop zones are visual-only.

**dnd-kit** is already installed in `packages/client/package.json` (from TASK-001): `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

**Why this task matters**: This connects the palette and timeline. Without drag-drop, the user can't build their plan.

## Task

Implement the full drag-drop system using dnd-kit.

### Interaction model

```
Palette card ──drag──→ Semester slot     (ADD_COURSE action)
Semester card ──drag──→ Different slot   (MOVE_COURSE action)
Semester card ──drag──→ Palette area     (REMOVE_COURSE action)
```

### Architecture

`DndContext` from dnd-kit wraps the entire `PlannerPage`. Inside it:
- **Draggable items**: Course cards in both palette and timeline — `useDraggable` or use `@dnd-kit/sortable`
- **Droppable containers**: Each semester's course list area + the palette area — `useDroppable`
- **Drag overlay**: Shows a floating copy of the card being dragged

### Droppable areas

Each semester column's course list zone is a `Droppable` with ID = `semesterId` (e.g., `"Fall 2026"`).
The palette drop zone has ID = `"palette"`.

### Draggable course cards

Each draggable `CourseCard` has:
```typescript
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: `${source}-${courseId}`,  // e.g. "timeline-Fall 2026-ECE 460N" or "palette-ECE 460N"
  data: { courseId, source, semesterId? }
});
```

`isDragging` → reduce card opacity to 0.5 (ghost effect, original stays in place).

### `DragOverlay`

Show a clean copy of the `CourseCard` while dragging (not the ghost):
```tsx
<DragOverlay>
  {activeCard && <CourseCard courseId={activeCard.courseId} isDragOverlay />}
</DragOverlay>
```

### `onDragEnd` handler

```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return; // dropped outside any droppable

  const { courseId, source, semesterId: fromSemester } = active.data.current;
  const targetId = over.id as string;

  if (targetId === 'palette') {
    // Dropped back on palette → remove from plan
    if (source === 'timeline') {
      dispatch({ type: 'REMOVE_COURSE', semesterId: fromSemester, courseId });
    }
    return;
  }

  // Dropped on a semester
  const toSemester = targetId;
  if (source === 'palette') {
    dispatch({ type: 'ADD_COURSE', semesterId: toSemester, courseId });
  } else if (source === 'timeline' && fromSemester !== toSemester) {
    dispatch({ type: 'MOVE_COURSE', fromSemesterId: fromSemester, toSemesterId: toSemester, courseId });
  }
}
```

### Sortable within semesters (using @dnd-kit/sortable)

Within a single semester, courses should be reorderable using `SortableContext` with `verticalListSortingStrategy`:
1. Wrap each semester's course list in `<SortableContext items={courseIds} strategy={verticalListSortingStrategy}>`
2. Course cards in the timeline use `useSortable` instead of `useDraggable`
3. On `onDragEnd`, if `source === 'timeline' && fromSemester === toSemester`, reorder within semester (add `REORDER_SEMESTER` action to PlanContext if needed)

### Duplicate prevention

In `ADD_COURSE` reducer and `handleDragEnd`: check if `courseId` already exists anywhere in the plan. If yes, skip the add (don't duplicate a course).

### Visual feedback on hover

Droppable semester slots should show a highlighted background when a draggable is hovering over them:
```typescript
const { isOver } = useDroppable({ id: semesterId });
// Apply: isOver ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
```

## Acceptance Criteria
- [ ] Drag from palette → semester slot adds course to plan
- [ ] Drag course between semesters moves it correctly
- [ ] Drag course back over palette removes it from plan
- [ ] Visual drag overlay shows card preview while dragging
- [ ] Original card ghosts at 0.5 opacity while being dragged
- [ ] Drop zones highlight blue on hover  
- [ ] Cannot place the same course twice (duplicate prevention)
- [ ] Sorting within a semester works (reorder cards in same column)
- [ ] `tsc --noEmit` passes, no console errors

## Validation Gates
- [ ] `npm run dev` — drag a card from palette to a future semester — it appears in timeline
- [ ] Drag between semesters — course moves
- [ ] Drag over palette — course removed from plan
- [ ] `cd packages/client && npx tsc --noEmit` — no errors

## Files to Read First
- `packages/client/src/components/CourseCard.tsx` — to add drag attributes
- `packages/client/src/context/PlanContext.tsx` — to use dispatch actions
- `packages/client/src/pages/PlannerPage.tsx` — where to add DndContext wrapper
- `packages/client/src/components/` — look for DroppableSlot from TASK-006

## Constraints
- Use dnd-kit exclusively — do NOT use react-dnd, HTML5 drag API, or other libraries
- Do NOT add validation logic here — that's TASK-010. Drops should succeed visually even with prereq issues (red borders come in TASK-010)
- Commit when done: `git add -A && git commit -m "feat(TASK-008): dnd-kit drag-drop (palette↔timeline, between semesters, remove)"`

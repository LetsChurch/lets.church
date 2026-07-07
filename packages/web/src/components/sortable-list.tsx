import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Thin wrapper around dnd-kit for the dashboard's vertical, drag-handle-driven
 * reorderable lists (playlists, featured uploads). Renders a `DndContext` +
 * `SortableContext` and maps each item through the render prop. Reordering is
 * surfaced via `onReorder` with the already-reordered array so callers can both
 * update local state and persist the new order.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  className,
  children,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (items: T[]) => void;
  className?: string;
  children: (item: T) => ReactNode;
}) {
  const sensors = useSensors(
    // Require a small drag before activating so clicks on the handle button
    // (and any other in-card controls) still register as clicks.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = items.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>{items.map((item) => children(item))}</div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * A single sortable row. Exposes dnd-kit's node ref, computed transform style,
 * and drag-handle props via a render prop so callers keep full control over the
 * card markup. Spread `attributes`/`listeners` onto the element that should act
 * as the drag handle.
 */
export function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (args: {
    setNodeRef: (node: HTMLElement | null) => void;
    style: CSSProperties;
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
    isDragging: boolean;
  }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };

  return children({ setNodeRef, style, attributes, listeners, isDragging });
}

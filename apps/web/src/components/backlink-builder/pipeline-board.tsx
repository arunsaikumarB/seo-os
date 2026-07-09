import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OpportunityLogo } from './opportunity-logo';
import {
  EPIC_PIPELINE_STAGES,
  type BacklinkOpportunity,
  scoreBadgeClass,
  formatType,
} from './types';

type PipelineStageId = (typeof EPIC_PIPELINE_STAGES)[number]['id'];

function DraggableCard({ item, projectId }: { item: BacklinkOpportunity; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.4 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Link
        to={`/projects/${projectId}/backlink-builder/opportunities/${item.id}`}
        className="block rounded-md border bg-card p-2.5 text-xs space-y-1.5 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
        onClick={(e) => isDragging && e.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <OpportunityLogo domain={item.domain} logoUrl={item.logo_url} size={20} />
          <p className="font-medium truncate flex-1">{item.website_name ?? item.title}</p>
        </div>
        <p className="text-muted-foreground capitalize truncate">
          {formatType(item.opportunity_type)}
        </p>
        <Badge className={`text-[9px] ${scoreBadgeClass(item.score)}`}>Score {item.score}</Badge>
      </Link>
    </div>
  );
}

function DroppableColumn({ stageId, children }: { stageId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 min-h-[100px] rounded-md p-1 transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
    >
      {children}
    </div>
  );
}

interface PipelineBoardProps {
  projectId: string;
  columns: Record<string, BacklinkOpportunity[]>;
  onMove: (opportunityId: string, stage: PipelineStageId) => void;
}

export function PipelineBoard({ projectId, columns, onMove }: PipelineBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    for (const stage of EPIC_PIPELINE_STAGES) {
      const found = columns[stage.id]?.find((o) => o.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, columns]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const stageIds = EPIC_PIPELINE_STAGES.map((s) => s.id);
    const targetStage = String(over.id);
    if (stageIds.includes(targetStage as PipelineStageId)) {
      onMove(String(active.id), targetStage as PipelineStageId);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {EPIC_PIPELINE_STAGES.map((stage) => {
          const items = columns[stage.id] ?? [];
          return (
            <Card key={stage.id} className={`min-w-[240px] shrink-0 border-t-2 ${stage.color}`}>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs flex justify-between font-medium">
                  <span>{stage.label}</span>
                  <Badge className="text-[10px] border-muted-foreground/30">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <DroppableColumn stageId={stage.id}>
                  {items.map((item) => (
                    <DraggableCard key={item.id} item={item} projectId={projectId} />
                  ))}
                </DroppableColumn>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="rounded-md border bg-card p-2.5 text-xs shadow-xl w-[220px]">
            <p className="font-medium">{activeItem.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

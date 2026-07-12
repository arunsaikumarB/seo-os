import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { ArrowLeft, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/demo/page-transition';

type WNode = {
  id: string;
  type: string;
  data: { label: string; description?: string; requiresApproval?: boolean };
  position: { x: number; y: number };
};

type WEdge = { id: string; source: string; target: string; label?: string };

type Definition = { nodes: WNode[]; edges: WEdge[] };

const NODE_PALETTE = [
  'trigger',
  'condition',
  'delay',
  'ai_task',
  'approval',
  'campaign',
  'outreach',
  'verification',
  'notification',
  'update_status',
  'end',
] as const;

function SortableNode({
  node,
  onRemove,
  onLabelChange,
}: {
  node: WNode;
  onRemove: () => void;
  onLabelChange: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card p-2"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Badge className="capitalize shrink-0">{node.type.replace(/_/g, ' ')}</Badge>
      <Input
        value={node.data.label}
        onChange={(e) => onLabelChange(e.target.value)}
        className="h-8"
      />
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function rebuildEdges(nodes: WNode[]): WEdge[] {
  return nodes.slice(0, -1).map((n, i) => ({
    id: `e_${n.id}_${nodes[i + 1].id}`,
    source: n.id,
    target: nodes[i + 1].id,
    label: 'default',
  }));
}

export function WorkflowBuilderPage() {
  const { projectId = '', workflowId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState<Definition | null>(null);

  const { isLoading } = useQuery({
    queryKey: ['workflow', projectId, workflowId],
    queryFn: async () => {
      const res = await request<{
        data: { name: string; definition: Definition; status: string };
      }>(`/v1/projects/${projectId}/workflows/${workflowId}`);
      setName(res.data.name);
      setDefinition(res.data.definition);
      return res.data;
    },
    enabled: !!projectId && !!workflowId,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const nodeIds = useMemo(() => definition?.nodes.map((n) => n.id) ?? [], [definition]);

  const saveMutation = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, definition }),
      }),
    onSuccess: () => {
      toast.success('Workflow saved');
      queryClient.invalidateQueries({ queryKey: ['workflows', projectId] });
    },
    onError: () => toast.error('Failed to save workflow'),
  });

  const onDragEnd = (event: DragEndEvent) => {
    if (!definition) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = definition.nodes.findIndex((n) => n.id === active.id);
    const newIndex = definition.nodes.findIndex((n) => n.id === over.id);
    const nodes = arrayMove(definition.nodes, oldIndex, newIndex).map((n, i) => ({
      ...n,
      position: { x: 80 + i * 160, y: 120 },
    }));
    setDefinition({ nodes, edges: rebuildEdges(nodes) });
  };

  const addNode = (type: (typeof NODE_PALETTE)[number]) => {
    if (!definition) return;
    const id = `${type}_${Math.random().toString(36).slice(2, 8)}`;
    const nodes = [
      ...definition.nodes.filter((n) => n.type !== 'end'),
      {
        id,
        type,
        data: { label: type.replace(/_/g, ' '), requiresApproval: type === 'outreach' || type === 'approval' },
        position: { x: 0, y: 120 },
      },
      ...definition.nodes.filter((n) => n.type === 'end'),
    ].map((n, i) => ({ ...n, position: { x: 80 + i * 160, y: 120 } }));
    if (!nodes.some((n) => n.type === 'end')) {
      nodes.push({
        id: `end_${Math.random().toString(36).slice(2, 8)}`,
        type: 'end',
        data: { label: 'End' },
        position: { x: 80 + nodes.length * 160, y: 120 },
      });
    }
    setDefinition({ nodes, edges: rebuildEdges(nodes) });
  };

  if (isLoading || !definition) {
    return <Skeleton className="h-96" />;
  }

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}/workflows`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Add node</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {NODE_PALETTE.map((type) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                className="w-full justify-start capitalize"
                onClick={() => addNode(type)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {type.replace(/_/g, ' ')}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Visual flow (drag to reorder)</CardTitle>
          </CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={nodeIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {definition.nodes.map((node) => (
                    <SortableNode
                      key={node.id}
                      node={node}
                      onLabelChange={(label) =>
                        setDefinition({
                          ...definition,
                          nodes: definition.nodes.map((n) =>
                            n.id === node.id ? { ...n, data: { ...n.data, label } } : n
                          ),
                        })
                      }
                      onRemove={() => {
                        if (node.type === 'trigger') {
                          toast.error('Trigger node is required');
                          return;
                        }
                        const nodes = definition.nodes.filter((n) => n.id !== node.id);
                        setDefinition({ nodes, edges: rebuildEdges(nodes) });
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="mt-4 overflow-x-auto rounded-md border bg-muted/20 p-4">
              <div className="flex min-w-max items-center gap-2">
                {definition.nodes.map((n, i) => (
                  <div key={n.id} className="flex items-center gap-2">
                    <div className="rounded-md border bg-background px-3 py-2 text-xs text-center min-w-[110px]">
                      <p className="font-medium capitalize">{n.type.replace(/_/g, ' ')}</p>
                      <p className="text-muted-foreground truncate max-w-[110px]">{n.data.label}</p>
                    </div>
                    {i < definition.nodes.length - 1 && (
                      <span className="text-muted-foreground">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OpportunityLogo } from './opportunity-logo';
import { scoreBadgeClass, formatType, formatNumber, type BacklinkOpportunity } from './types';
import { ExternalLink, Check, X, FileText } from 'lucide-react';

interface OpportunityTableProps {
  projectId: string;
  data: BacklinkOpportunity[];
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

export function OpportunityTable({
  projectId,
  data,
  selected,
  onSelect,
  onSelectAll,
  onApprove,
  onReject,
  search,
  onSearchChange,
}: OpportunityTableProps) {
  const columns = useMemo<ColumnDef<BacklinkOpportunity>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={data.length > 0 && selected.size === data.length}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="rounded border-input"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selected.has(row.original.id)}
            onChange={(e) => onSelect(row.original.id, e.target.checked)}
            className="rounded border-input"
          />
        ),
        size: 36,
      },
      {
        id: 'site',
        header: 'Website',
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="flex items-center gap-2.5 min-w-[200px]">
              <OpportunityLogo domain={o.domain} logoUrl={o.logo_url} />
              <div className="min-w-0">
                <Link
                  to={`/projects/${projectId}/backlink-builder/opportunities/${o.id}`}
                  className="font-medium hover:underline truncate block"
                >
                  {o.website_name ?? o.domain ?? o.title}
                </Link>
                <p className="text-[10px] text-muted-foreground truncate">{o.domain}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'dr',
        header: 'DR',
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{row.original.domain_rating ?? '—'}</span>
        ),
        size: 48,
      },
      {
        id: 'traffic',
        header: 'Traffic',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">{formatNumber(row.original.monthly_traffic)}</span>
        ),
        size: 72,
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge className="text-[10px] capitalize">
            {formatType(row.original.opportunity_type)}
          </Badge>
        ),
      },
      {
        id: 'score',
        header: 'Score',
        cell: ({ row }) => (
          <Badge className={scoreBadgeClass(row.original.score)}>{row.original.score}</Badge>
        ),
        size: 64,
      },
      {
        id: 'spam',
        header: 'Spam',
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.spam_score ?? '—'}</span>
        ),
        size: 52,
      },
      {
        id: 'success',
        header: 'Success %',
        cell: ({ row }) => (
          <span className="text-xs font-medium text-primary tabular-nums">
            {row.original.success_probability ?? '—'}%
          </span>
        ),
        size: 72,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge className="text-[10px] border-muted-foreground/30 capitalize">
            {(row.original.pipeline_stage ?? row.original.queue_status ?? 'discovered').replace(
              /_/g,
              ' '
            )}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="flex gap-1 justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => onApprove(o.id)}
                title="Approve"
              >
                <Check className="h-3.5 w-3.5 text-primary" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => onReject(o.id)}
                title="Reject"
              >
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
              {o.url && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  asChild
                  title="Open website"
                >
                  <a href={o.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild title="Details">
                <Link to={`/projects/${projectId}/backlink-builder/opportunities/${o.id}`}>
                  <FileText className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [projectId, data.length, selected, onSelect, onSelectAll, onApprove, onReject]
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search domain, website, title… (/)"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-sm h-9"
        />
        <Badge className="text-[10px] border-muted-foreground/30 self-center">
          {data.length} opportunities
        </Badge>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/40">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No opportunities match your filters.
          </p>
        )}
      </div>
    </div>
  );
}

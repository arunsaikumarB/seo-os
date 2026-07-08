import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { Upload, FileText, Trash2, RefreshCw } from 'lucide-react';

interface KbDocument {
  id: string;
  title: string;
  filename: string;
  mime_type: string;
  status: string;
  byte_size: number;
  chunk_count: number;
  created_at: string;
}

export function KnowledgeLibraryPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const docs = useQuery({
    queryKey: ['kb-documents', projectId],
    queryFn: () => request<{ data: KbDocument[] }>(`/v1/projects/${projectId}/knowledge/documents`),
    enabled: !!projectId,
  });

  const upload = useMutation({
    mutationFn: (body: { title: string; content: string }) =>
      request(`/v1/projects/${projectId}/knowledge/documents`, {
        method: 'POST',
        body: JSON.stringify({ ...body, mimeType: 'text/plain' }),
      }),
    onSuccess: () => {
      toast.success('Document uploaded — ingestion started');
      setTitle('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['kb-documents', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (docId: string) =>
      request(`/v1/projects/${projectId}/knowledge/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Document archived');
      queryClient.invalidateQueries({ queryKey: ['kb-documents', projectId] });
    },
  });

  const reingest = useMutation({
    mutationFn: (docId: string) =>
      request(`/v1/projects/${projectId}/knowledge/documents/${docId}/ingest`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Re-ingestion started');
      queryClient.invalidateQueries({ queryKey: ['kb-documents', projectId] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="text-muted-foreground">Upload documents for RAG-powered AI features</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload document
          </CardTitle>
          <CardDescription>Plain text or markdown (max 25MB)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Document title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="flex min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Paste document content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button
            disabled={!title || !content || upload.isPending}
            onClick={() => upload.mutate({ title, content })}
          >
            Upload & ingest
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {docs.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (docs.data?.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            (docs.data?.data ?? []).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.chunk_count} chunks · {(doc.byte_size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-[10px]">{doc.status}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reingest.mutate(doc.id)}
                    disabled={reingest.isPending}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(doc.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

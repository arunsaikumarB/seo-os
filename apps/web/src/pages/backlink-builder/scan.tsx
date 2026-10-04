import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ScanSearch } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';

type ScannedForm = {
  pageUrl: string;
  index: number;
  kind: string;
  action: string | null;
  isBacklinkSubmission: boolean;
  fields: Array<{ name: string; type: string; label: string; required: boolean }>;
};

type Verdict = {
  requestedUrl: string;
  finalUrl: string | null;
  redirected: boolean;
  httpStatus: number | null;
  fetchError: string | null;
  broken: boolean;
  brokenReason: string | null;
  stop: boolean;
  pageKind: string;
  loginRequired: boolean;
  loginUrl: string | null;
  captcha: boolean;
  cloudflare: boolean;
  forms: ScannedForm[];
  submissionFormIndex: number | null;
  noForm: boolean;
  contactEmails: string[];
  nextAction: string;
  linkPolicy: string;
  linkPolicyEvidence: string;
  suggestedCategory: string | null;
  categoryFit: string;
  indexable: boolean | null;
  robotsNoindex: boolean;
  renderedWith: string;
  truthStatus: string;
  notes: string[];
};

export function BacklinkScanPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const scan = useMutation({
    mutationFn: () =>
      request<{ data: Verdict }>(`/v1/projects/${projectId}/backlink-builder/scan`, {
        method: 'POST',
        body: JSON.stringify({ url, category: category || undefined }),
      }),
    onSuccess: (res) => {
      setVerdict(res.data);
      toast.success(`Scan finished: ${res.data.truthStatus.replace(/_/g, ' ')}`);
    },
    onError: (err: Error) => toast.error(err.message || 'Scan failed'),
  });

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <BacklinkBuilderNav />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ScanSearch className="h-6 w-6" /> URL scanner
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fetches the page, follows one obvious submit or login link, and renders JavaScript shells with
          local Playwright. The verdict is what the fetch returned.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan a URL</CardTitle>
          <CardDescription>Broken pages stop here. They are not sent to submission or outreach.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.jayde.com/submit.html"
            />
          </div>
          <div className="space-y-1">
            <Label>Expected category (optional)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="directory"
            />
          </div>
          <Button disabled={!url.trim() || scan.isPending} onClick={() => scan.mutate()}>
            {scan.isPending ? 'Scanning…' : 'Scan'}
          </Button>
        </CardContent>
      </Card>

      {verdict && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Verdict
              <Badge>{verdict.truthStatus.replace(/_/g, ' ')}</Badge>
            </CardTitle>
            <CardDescription>{verdict.nextAction}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Requested <span className="font-mono">{verdict.requestedUrl}</span>
            </p>
            {verdict.redirected && verdict.finalUrl && (
              <p>
                Final URL <span className="font-mono">{verdict.finalUrl}</span>
              </p>
            )}
            <p>
              HTTP {verdict.httpStatus ?? 'none'}
              {verdict.fetchError ? ` · ${verdict.fetchError}` : ''} · rendered with {verdict.renderedWith}
            </p>
            {verdict.broken && <p>Broken: {verdict.brokenReason}</p>}
            {verdict.loginRequired && (
              <p>Login required first{verdict.loginUrl ? `: ${verdict.loginUrl}` : ''}.</p>
            )}
            {(verdict.captcha || verdict.cloudflare) && (
              <p>
                {verdict.captcha ? 'Captcha is present.' : 'Cloudflare or an anti-bot challenge is present.'} A
                person has to clear it. The app will not click Submit.
              </p>
            )}
            {verdict.noForm && <p>No form found. The page looks like a {verdict.pageKind}.</p>}
            <p>
              Links: {verdict.linkPolicy}. {verdict.linkPolicyEvidence}
            </p>
            <p>
              Indexable: {verdict.indexable == null ? 'unknown' : verdict.indexable ? 'yes' : 'no'}
              {verdict.robotsNoindex ? ' (noindex)' : ''}. Category fit: {verdict.categoryFit}
              {verdict.suggestedCategory ? ` (signals ${verdict.suggestedCategory})` : ''}.
            </p>
            {verdict.contactEmails.length > 0 && <p>Contact: {verdict.contactEmails.join(', ')}</p>}
            {verdict.notes.map((note) => (
              <p key={note} className="text-muted-foreground">
                {note}
              </p>
            ))}
            <div className="space-y-2">
              {verdict.forms.length === 0 && <p>Forms: none.</p>}
              {verdict.forms.map((form) => (
                <div key={`${form.pageUrl}-${form.index}`} className="rounded-md border p-3">
                  <p className="font-medium">
                    {form.kind}
                    {form.isBacklinkSubmission ? ' · backlink submission form' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">{form.pageUrl}</p>
                  <ul className="mt-2 text-xs">
                    {form.fields.map((field, i) => (
                      <li key={`${field.name}-${i}`}>
                        {field.label || field.name || field.type} ({field.type}
                        {field.required ? ', required' : ''})
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageTransition>
  );
}

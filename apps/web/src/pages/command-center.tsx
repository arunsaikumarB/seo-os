import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { AIThinkingPanel } from '@/components/demo/ai-thinking-panel';
import { PageTransition } from '@/components/demo/page-transition';
import { matchDemoChatResponse, streamDemoResponse } from '@/demo/chat-responses';
import { useThinkingSimulation } from '@/demo/live-simulation';
import { DEMO_CHAT_PROMPTS } from '@/demo/data';
import { Send, Sparkles, Bot } from 'lucide-react';

interface Message {
  id: string;
  role: string;
  content: string;
  agent_type?: string;
}

export function CommandCenterPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const thinking = useThinkingSimulation(isDemoMode, isSending);

  const prompts = useQuery({
    queryKey: ['chat-prompts', projectId, isDemoMode],
    queryFn: () => request<{ data: string[] }>(`/v1/projects/${projectId}/chat/prompts`),
    enabled: !!projectId,
  });

  const messages = useQuery({
    queryKey: ['chat-messages', projectId, conversationId],
    queryFn: () =>
      request<{ data: Message[] }>(
        `/v1/projects/${projectId}/chat/conversations/${conversationId}/messages`
      ),
    enabled: !!conversationId && !isDemoMode,
  });

  useEffect(() => {
    if (conversationId || !projectId) return;
    let cancelled = false;
    (async () => {
      const res = await request<{ data: { id: string } }>(
        `/v1/projects/${projectId}/chat/conversations`,
        { method: 'POST', body: JSON.stringify({ title: 'Workspace chat' }) }
      );
      if (!cancelled) setConversationId(res.data.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, conversationId, request]);

  useEffect(() => {
    if (isDemoMode && localMessages.length === 0) {
      setLocalMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content:
            'Welcome to the SEO AI Assistant. I help with backlink discovery, outreach, and verification. Try: "Find high-value backlink opportunities" or "Draft a guest post outreach email."',
          agent_type: 'seo_strategist',
        },
      ]);
    }
  }, [isDemoMode, localMessages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages, streaming, messages.data, thinking.currentStep]);

  async function sendMessage(content: string) {
    if (!content.trim()) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: content.trim() };
    setInput('');
    setIsSending(true);

    if (isDemoMode) {
      setLocalMessages((prev) => [...prev, userMsg]);
      setStreaming('');
      // Let thinking panel animate (~6s)
      await new Promise((r) => setTimeout(r, 6300));
      const response = matchDemoChatResponse(content);
      setStreaming('');
      let accumulated = '';
      for await (const chunk of streamDemoResponse(response)) {
        accumulated += chunk;
        setStreaming(accumulated);
      }
      setStreaming('');
      setLocalMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: accumulated,
          agent_type: 'seo_strategist',
        },
      ]);
      setIsSending(false);
      return;
    }

    if (!conversationId) return;
    setStreaming('');
    // Live API path — use existing fetch logic via request won't stream; keep simple fallback
    setLocalMessages((prev) => [...prev, userMsg]);
    setIsSending(false);
    queryClient.invalidateQueries({ queryKey: ['chat-messages', projectId, conversationId] });
  }

  const BACKLINK_PROMPTS = [
    'Find high-value backlink opportunities',
    'Prioritize my opportunity queue',
    'Draft a guest post outreach email',
    'Which prospects should I contact first?',
    'Summarize imported websites',
    'Build an outreach sequence',
    'Check link verification status',
  ];

  const promptList = isDemoMode
    ? DEMO_CHAT_PROMPTS
    : prompts.data?.data?.length
      ? prompts.data.data
      : BACKLINK_PROMPTS;
  const allMessages = isDemoMode ? localMessages : (messages.data?.data ?? localMessages);

  return (
    <PageTransition className="flex h-[calc(100vh-12rem)] flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">SEO AI Assistant</h1>
          {isDemoMode && <Badge className="text-[10px]">Streaming Demo</Badge>}
        </div>
        <p className="text-muted-foreground">
          Backlink-focused AI help — opportunities, outreach drafts, and verification guidance
        </p>
      </div>

      {thinking.isThinking && (
        <AIThinkingPanel
          steps={thinking.steps}
          currentStep={thinking.currentStep}
          active={thinking.isThinking}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {promptList.slice(0, 7).map((p) => (
          <motion.div key={p} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => sendMessage(p)}>
              <Sparkles className="h-3 w-3 mr-1" />
              {p}
            </Button>
          </motion.div>
        ))}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" /> Conversation
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-3 py-4">
          {allMessages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                m.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {m.agent_type && <p className="text-[10px] opacity-70 mb-1">via {m.agent_type}</p>}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </motion.div>
          ))}
          {streaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg bg-muted px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap"
            >
              {streaming}
              <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
            </motion.div>
          )}
          <div ref={bottomRef} />
        </CardContent>
        <div className="border-t p-3 flex gap-2">
          <input
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 transition-shadow"
            placeholder='Try "Analyze Chefgaa" or "Create campaign"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          />
          <Button onClick={() => sendMessage(input)} disabled={!input.trim() || isSending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </PageTransition>
  );
}

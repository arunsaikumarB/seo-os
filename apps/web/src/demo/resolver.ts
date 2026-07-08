import {
  DEMO_AGENTS,
  DEMO_APPROVALS,
  DEMO_BACKLINK_AUDIT,
  DEMO_BACKLINK_SUMMARY,
  DEMO_BACKLINK_TYPES,
  DEMO_BACKLINKS_LOST,
  DEMO_BACKLINKS_PENDING,
  DEMO_BACKLINKS_WON,
  DEMO_AI_BACKLINK_SUGGESTIONS,
  DEMO_CAMPAIGNS,
  DEMO_CHAT_PROMPTS,
  DEMO_COMPETITORS,
  DEMO_EXECUTIVE_METRICS,
  DEMO_KB_DOCUMENTS,
  DEMO_KEYWORDS,
  DEMO_MEMORY,
  DEMO_OPPORTUNITIES,
  DEMO_ORGANIZATIONS,
  DEMO_PROJECT_CHEFGAA,
  DEMO_PROJECTS,
  DEMO_PROSPECT_PIPELINE,
  DEMO_TIMELINE,
  getDemoProject,
} from './data';

/** Resolve demo API responses — never hits live APIs in demo mode */
export function resolveDemoApi(path: string, method: string, body?: string): unknown {
  const m = path;
  const projectId = m.match(/\/projects\/([^/]+)/)?.[1] ?? DEMO_PROJECT_CHEFGAA;
  const project = getDemoProject(projectId);

  // Version
  if (m === '/v1/version') return { data: { version: '0.5.5-demo', api: 'v1', mode: 'demo' } };

  // Feature flags — all enabled in demo
  if (m === '/v1/feature-flags') {
    return {
      data: {
        mission_control: true,
        ai_workforce: true,
        knowledge_base: true,
        ai_memory: true,
        backlink_builder: true,
        outreach: true,
        technical_seo: true,
        reports: true,
      },
    };
  }

  // Me / orgs
  if (m === '/v1/me') {
    return {
      data: {
        user: { id: 'demo-user', full_name: 'Demo Executive', email: 'ceo@seoos.demo', avatar_url: null },
        organizations: DEMO_ORGANIZATIONS.map((org) => ({
          role: 'owner',
          org_id: org.id,
          organizations: { id: org.id, name: org.name, slug: org.slug, industry: org.industry, plan: org.plan },
        })),
      },
    };
  }

  // Projects list
  const orgProjects = m.match(/^\/v1\/organizations\/([^/]+)\/projects$/);
  if (orgProjects && method === 'GET') {
    const orgId = orgProjects[1];
    const projects = DEMO_PROJECTS.filter((p) => p.orgId === orgId || orgId.startsWith('demo-'));
    return {
      data: (projects.length ? projects : DEMO_PROJECTS).map((p) => ({
        id: p.id,
        name: p.name,
        domain: p.domain,
        url: p.url,
        industry: p.industry,
        org_id: p.orgId,
        status: 'active',
      })),
    };
  }

  // Mission control summary
  if (m.includes('/mission-control/summary')) {
    return {
      data: {
        knowledge: { readyDocuments: DEMO_KB_DOCUMENTS.length, totalChunks: 136 },
        memory: { entries: DEMO_MEMORY.entries.length, facts: DEMO_MEMORY.facts },
        conversations: 14,
        workforce: {
          registered: DEMO_AGENTS.length,
          activeRuns: 4,
          completedRuns: 284,
          recentRuns: [
            { id: 'r1', agent_type: 'research_manager', status: 'running' },
            { id: 'r2', agent_type: 'content_strategist', status: 'completed' },
            { id: 'r3', agent_type: 'seo_strategist', status: 'running' },
          ],
        },
        intelligence: {
          websiteScanner: { status: 'healthy', phase: 'completed', pagesAnalyzed: 47 },
          discovery: {
            keywordCount: DEMO_KEYWORDS.length,
            prospectTotal: 47,
            opportunityCounts: { guest_post: 8, resource_page: 5, broken_link: 3, directory: 4 },
          },
          timeline: DEMO_TIMELINE.slice(0, 5),
        },
        campaigns: {
          active: 2,
          pendingApproval: 1,
          total: DEMO_CAMPAIGNS.length,
          avgProgress: 31,
          pendingApprovals: DEMO_APPROVALS.length,
          recent: DEMO_CAMPAIGNS.slice(0, 3),
          timeline: DEMO_TIMELINE.filter((t) => t.event_type.startsWith('campaign')),
        },
        backlinkBuilder: DEMO_BACKLINK_SUMMARY,
      },
    };
  }

  // AI endpoints
  if (m === '/v1/ai/agents') return { data: DEMO_AGENTS };
  if (m.includes('/ai/health')) {
    return { data: { agentsRegistered: 5, handlersReady: 5, recentFailures: 0, status: 'healthy' } };
  }
  if (m.includes('/ai/runs')) {
    return {
      data: [
        { id: 'r1', agent_type: 'research_manager', status: 'running' },
        { id: 'r2', agent_type: 'content_strategist', status: 'completed' },
        { id: 'r3', agent_type: 'seo_strategist', status: 'running' },
        { id: 'r4', agent_type: 'qa_agent', status: 'queued' },
      ],
    };
  }
  if (m.includes('/ai/events')) {
    return {
      data: {
        live: DEMO_TIMELINE.slice(0, 6).map((t) => ({
          type: t.event_type,
          createdAt: t.created_at,
          payload: { title: t.title },
        })),
        persisted: [],
      },
    };
  }
  if (m.includes('/ai/queue')) {
    return {
      data: {
        enabled: true,
        queues: [
          { name: 'ai.high', pending: 2, active: 1 },
          { name: 'ai.default', pending: 5, active: 2 },
          { name: 'intelligence.low', pending: 1, active: 0 },
        ],
      },
    };
  }
  if (m === '/v1/ai/providers/health') {
    return {
      data: {
        primary: { name: 'Gemini', status: 'healthy' },
        fallback: { name: 'Ollama', status: 'healthy' },
      },
    };
  }

  // Executive dashboard
  if (m.includes('/executive/summary')) return { data: DEMO_EXECUTIVE_METRICS };

  // Intelligence
  if (m.includes('/intelligence/summary')) {
    return {
      data: {
        websiteScanner: { status: 'completed', phase: 'done', pagesAnalyzed: 47 },
        discovery: { keywordCount: 24, prospectTotal: 47, opportunityCounts: { guest_post: 8, resource_page: 5 } },
        timeline: DEMO_TIMELINE,
      },
    };
  }
  if (m.includes('/intelligence/website/scans') && method === 'GET') {
    return {
      data: [{
        id: 'scan1',
        status: 'completed',
        phase: 'completed',
        target_url: project.url,
        pages_analyzed: 47,
        pages_discovered: 52,
        brand_profile: { name: project.name, tagline: 'Premium catering & chef services', topics: ['catering', 'events', 'corporate'] },
        tech_stack: { cms: 'WordPress', analytics: ['GA4'], frameworks: ['React'] },
      }],
    };
  }
  if (m.includes('/intelligence/website/scans') && method === 'POST') return { data: { id: 'scan-new', status: 'running' } };
  if (m.includes('/intelligence/discover') && method === 'POST') return { data: { status: 'started' } };
  if (m.includes('/intelligence/competitors') && !m.includes('suggestions')) return { data: DEMO_COMPETITORS };
  if (m.includes('/intelligence/keywords')) return { data: DEMO_KEYWORDS };
  if (m.includes('/intelligence/opportunities')) return { data: DEMO_OPPORTUNITIES };
  if (m.includes('/intelligence/prospects/pipeline')) return { data: DEMO_PROSPECT_PIPELINE };
  if (m.includes('/intelligence/research/events')) return { data: DEMO_TIMELINE };

  // Knowledge
  if (m.includes('/knowledge/stats')) return { data: { readyDocuments: 5, totalChunks: 136, processing: 0 } };
  if (m.includes('/knowledge/documents')) return { data: DEMO_KB_DOCUMENTS };

  // Memory
  if (m.includes('/memory') || m.includes('/knowledge/memory')) {
    return { data: DEMO_MEMORY };
  }

  // Campaigns
  if (m.includes('/campaigns/types')) {
    return {
      data: [
        { id: 'guest_post', display_name: 'Guest Posts' },
        { id: 'resource_page', display_name: 'Resource Pages' },
        { id: 'digital_pr', display_name: 'Digital PR' },
      ],
    };
  }
  if (m.includes('/campaigns/summary')) return { data: { active: 2, pendingApproval: 1, total: 4, avgProgress: 31 } };
  if (m.match(/\/campaigns$/) && method === 'GET') return { data: DEMO_CAMPAIGNS };
  if (m.includes('/campaigns/queue/opportunities')) return { data: DEMO_OPPORTUNITIES };
  if (m.includes('/campaigns/approvals')) return { data: DEMO_APPROVALS };
  if (m.includes('/campaigns/plan') && method === 'POST') {
    return {
      data: {
        summary: `AI campaign plan for ${project.name} targeting ${project.domain}`,
        phases: [
          { name: 'Discovery & qualification', durationWeeks: 2, actions: ['Review opportunity queue', 'Approve top prospects'] },
          { name: 'Outreach preparation', durationWeeks: 2, actions: ['Draft email templates', 'Personalize outreach'] },
          { name: 'Execution', durationWeeks: 4, actions: ['Launch outreach', 'Track responses'] },
        ],
        targetOpportunities: 25,
        recommendedTypes: ['guest_post'],
        aiGenerated: true,
      },
    };
  }
  if (m.includes('/campaigns/') && method === 'GET' && !m.includes('queue') && !m.includes('approvals')) {
    const camp = DEMO_CAMPAIGNS[0];
    return { data: { ...camp, plan: { summary: 'Guest post outreach for food & lifestyle publications', phases: [] }, goals: [] } };
  }
  if (m.includes('/timeline')) return { data: DEMO_TIMELINE.filter((t) => t.event_type.startsWith('campaign')) };

  // Backlink Builder (Sprint 5.5)
  if (m.includes('/backlink-builder/summary')) return { data: DEMO_BACKLINK_SUMMARY };
  if (m.includes('/backlink-builder/types')) return { data: DEMO_BACKLINK_TYPES };
  if (m.includes('/backlink-builder/ai/suggestions')) return { data: DEMO_AI_BACKLINK_SUGGESTIONS };
  if (m.includes('/backlink-builder/pipeline')) return { data: DEMO_PROSPECT_PIPELINE };
  if (m.includes('/backlink-builder/won')) return { data: DEMO_BACKLINKS_WON };
  if (m.includes('/backlink-builder/lost')) return { data: DEMO_BACKLINKS_LOST };
  if (m.includes('/backlink-builder/pending')) return { data: DEMO_BACKLINKS_PENDING };
  if (m.includes('/backlink-builder/audit')) return { data: DEMO_BACKLINK_AUDIT };
  if (m.includes('/backlink-builder/opportunities/') && method === 'GET') {
    const opp = DEMO_OPPORTUNITIES.find((o) => m.includes(o.id)) ?? DEMO_OPPORTUNITIES[0];
    return {
      data: {
        ...opp,
        domain: 'foodnetwork.com',
        category: 'content_based',
        type_label: 'Guest Posts',
        ai_suggestion: opp.ai_recommendation,
        score_tier: opp.score >= 75 ? 'high' : 'medium',
      },
    };
  }
  if (m.includes('/backlink-builder/opportunities')) {
    return {
      data: DEMO_OPPORTUNITIES.map((o) => ({
        ...o,
        backlink_category: o.opportunity_type === 'guest_post' ? 'content_based' : 'outreach_based',
        ai_suggestion: o.ai_recommendation,
      })),
    };
  }

  // Chat
  if (m.includes('/chat/prompts')) return { data: DEMO_CHAT_PROMPTS };
  if (m.includes('/chat/conversations') && method === 'POST') {
    return { data: { id: 'demo-conversation' } };
  }
  if (m.includes('/chat/conversations/') && m.includes('/messages') && method === 'GET') {
    return {
      data: [
        { id: 'msg1', role: 'assistant', content: 'Welcome to SEO OS Command Center. I have full context on Chefgaa — competitors, keywords, and 12 pending opportunities. What would you like to do?', agent_type: 'seo_strategist' },
      ],
    };
  }

  // POST mutations — return success
  if (method === 'POST' || method === 'PATCH') {
    try {
      return { data: body ? JSON.parse(body) : { ok: true } };
    } catch {
      return { data: { ok: true } };
    }
  }

  return { data: [] };
}

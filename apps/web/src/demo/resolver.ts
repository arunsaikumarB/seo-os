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
  DEMO_BACKLINK_PIPELINE,
  DEMO_RELATIONSHIPS,
  DEMO_RELATIONSHIP_SUMMARY,
  DEMO_RELATIONSHIP_ORGANIZATIONS,
  DEMO_RELATIONSHIP_CONTACTS,
  DEMO_RELATIONSHIP_TIMELINE,
  DEMO_RELATIONSHIP_ORG_DETAIL,
  DEMO_OUTREACH_SUMMARY,
  DEMO_OUTREACH_THREADS,
  DEMO_OUTREACH_THREAD_DETAIL,
  DEMO_OUTREACH_TEMPLATES,
  DEMO_OUTREACH_SEQUENCES,
  DEMO_OUTREACH_SEQUENCE_DETAIL,
  DEMO_WORKFLOW_SUMMARY,
  DEMO_WORKFLOW_TEMPLATES,
  DEMO_WORKFLOWS,
  DEMO_WORKFLOW_RUNS,
  DEMO_WORKFLOW_APPROVALS,
  DEMO_AUTOMATION_SUMMARY,
  DEMO_IMPORTS,
  DEMO_TRACKING,
  DEMO_SUBMISSIONS,
  DEMO_BROWSER_INTELLIGENCE,
  DEMO_BROWSER_SCANS,
  DEMO_BROWSER_PROFILES,
  DEMO_CAMPAIGNS,
  DEMO_CHAT_PROMPTS,
  DEMO_COMPETITORS,
  DEMO_EXECUTIVE_METRICS,
  DEMO_KB_DOCUMENTS,
  DEMO_KEYWORDS,
  DEMO_MEMORY,
  DEMO_NOTIFICATIONS,
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
  if (m === '/v1/version')
    return { data: { version: '11.0.0-production-ready-demo', api: 'v1', mode: 'demo' } };

  if (m.startsWith('/v1/notifications')) {
    return {
      data: {
        items: DEMO_NOTIFICATIONS.map((n) => ({
          id: n.id,
          title: n.title,
          body: null,
          category: n.type,
          href: null,
          read_at: n.unread ? null : new Date().toISOString(),
          created_at: new Date().toISOString(),
        })),
        unreadCount: DEMO_NOTIFICATIONS.filter((n) => n.unread).length,
      },
    };
  }

  if (m.includes('/platform/activity')) {
    return {
      data: {
        items: DEMO_TIMELINE.slice(0, 12).map((t, i) => ({
          id: `pe-${i}`,
          event_type: String(t.event_type ?? 'timeline_updated'),
          title: String(t.title ?? 'Activity'),
          summary: null,
          severity: 'info',
          source_module: 'system',
          created_at: String(t.created_at ?? new Date().toISOString()),
        })),
      },
    };
  }

  if (m.includes('/analytics/overview') || m.includes('/analytics/mission-control')) {
    const weekly = Array.from({ length: 7 }).map((_, i) => ({
      date: new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10),
      value: 12 + i * 3,
    }));
    const monthly = Array.from({ length: 30 }).map((_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
      value: 20 + Math.round(Math.sin(i / 3) * 8) + i,
    }));
    return {
      data: {
        kpis: [
          { key: 'backlinks_won', label: 'Backlinks Won', value: 18, deltaPct: 12, trend: 'up' },
          {
            key: 'campaign_success',
            label: 'Campaign Success',
            value: 72,
            unit: '%',
            deltaPct: 8,
            trend: 'up',
          },
          {
            key: 'workflow_success',
            label: 'Workflow Success',
            value: 91,
            unit: '%',
            deltaPct: 5,
            trend: 'up',
          },
          {
            key: 'ai_productivity',
            label: 'AI Hours Saved',
            value: 42,
            unit: 'h',
            deltaPct: 15,
            trend: 'up',
          },
          { key: 'reply_rate', label: 'Reply Rate', value: 24, unit: '%', deltaPct: 18, trend: 'up' },
          {
            key: 'relationship_health',
            label: 'Relationship Health',
            value: 68,
            unit: '/100',
            trend: 'up',
          },
          { key: 'opportunities', label: 'Opportunities', value: 84, trend: 'up' },
          { key: 'roi_index', label: 'Projected ROI Index', value: 126, trend: 'up' },
        ],
        growth: {
          today: { backlinksWon: 2, emailsSent: 11, workflowsRun: 4, aiTasks: 9 },
          weekly,
          monthly,
        },
        insights: [
          {
            id: 'd1',
            category: 'campaigns',
            severity: 'positive',
            title: 'Campaign A is outperforming Campaign B by 28%',
            body: 'Progress gap detected between top campaigns.',
            recommendation: 'Replicate the winning campaign template.',
            metricDeltaPct: 28,
          },
          {
            id: 'd2',
            category: 'backlinks',
            severity: 'positive',
            title: 'Guest posts have a 76% higher success rate than Directories',
            body: 'Guest post success dominates directory submissions.',
            recommendation: 'Prioritize guest-post campaigns next sprint.',
            metricDeltaPct: 76,
          },
          {
            id: 'd3',
            category: 'outreach',
            severity: 'positive',
            title: 'Reply rates increased 18% this week',
            body: 'Current reply rate improved versus prior period.',
            recommendation: 'Double down on this week’s subject lines.',
            metricDeltaPct: 18,
          },
        ],
        forecasts: [
          {
            metric: 'expected_backlinks',
            current: 18,
            projected30d: 26,
            projected90d: 42,
            confidence: 0.62,
            unit: 'links',
          },
          {
            metric: 'expected_replies',
            current: 14,
            projected30d: 22,
            projected90d: 38,
            confidence: 0.58,
            unit: 'replies',
          },
          {
            metric: 'ai_productivity_hours',
            current: 42,
            projected30d: 57,
            projected90d: 88,
            confidence: 0.5,
            unit: 'hours',
          },
          {
            metric: 'projected_roi_index',
            current: 126,
            projected30d: 148,
            projected90d: 190,
            confidence: 0.45,
            unit: 'index',
          },
        ],
        dashboards: [
          'executive',
          'seo',
          'backlinks',
          'campaigns',
          'workflows',
          'relationships',
          'outreach',
          'ai',
          'team',
          'system',
        ],
        todaysPerformance: { backlinksWon: 2, emailsSent: 11, workflowsRun: 4, aiTasks: 9 },
        weeklyGrowth: weekly,
        monthlyGrowth: monthly,
      },
    };
  }

  if (m.includes('/analytics/dashboards/') || m.includes('/analytics/export')) {
    return {
      data: {
        totalBacklinks: 42,
        won: 18,
        lost: 6,
        pending: 9,
        verified: 14,
        successRate: 72,
        emailsSent: 64,
        openRate: 41,
        replyRate: 24,
        byType: [
          { name: 'guest_post', value: 22 },
          { name: 'directory', value: 10 },
          { name: 'resource_page', value: 8 },
        ],
        growthTrend: Array.from({ length: 14 }).map((_, i) => ({
          date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
          value: 5 + i,
        })),
        funnel: [
          { name: 'Discovered', value: 80 },
          { name: 'Qualified', value: 48 },
          { name: 'Outreach', value: 30 },
          { name: 'Won', value: 18 },
        ],
      },
    };
  }

  if (m.includes('/reports/types')) {
    return {
      data: [
        { type: 'executive', label: 'Executive Report', description: 'Board-ready overview' },
        { type: 'campaign', label: 'Campaign Report', description: 'Campaign success' },
        { type: 'backlink', label: 'Backlink Report', description: 'Link growth' },
        { type: 'outreach', label: 'Outreach Report', description: 'Reply performance' },
        { type: 'monthly', label: 'Monthly Report', description: 'Monthly rollup' },
      ],
    };
  }

  if (m.includes('/reports/summary')) {
    return {
      data: {
        totalReports: 3,
        scheduled: 1,
        readyCount: 2,
        failedCount: 0,
        recentReady: [{ id: 'run-demo-1', status: 'ready', created_at: new Date().toISOString() }],
        failed: [],
        queue: [],
      },
    };
  }

  if (m.includes('/technical-seo/summary')) {
    return {
      data: {
        healthScore: 78,
        criticalIssues: 2,
        warnings: 7,
        passedChecks: 15,
        crawlQueue: 3,
        fixProgress: 42,
        scores: {
          overall: 78,
          performance: 72,
          seo: 81,
          accessibility: 76,
          content: 74,
          security: 88,
          technical: 79,
        },
        healthTrend: Array.from({ length: 8 }, (_, i) => ({
          date: `2026-07-${String(i + 2).padStart(2, '0')}`,
          value: 68 + i * 1.4,
        })),
        issueBreakdown: [
          { name: 'critical', value: 2 },
          { name: 'high', value: 4 },
          { name: 'medium', value: 3 },
          { name: 'low', value: 2 },
          { name: 'info', value: 1 },
        ],
        agents: [
          { id: 'technical_seo', displayName: 'Technical SEO Agent', description: 'Site-wide issues' },
          { id: 'performance', displayName: 'Performance Agent', description: 'CWV & speed' },
          { id: 'accessibility', displayName: 'Accessibility Agent', description: 'A11y + SEO' },
          { id: 'schema', displayName: 'Schema Agent', description: 'JSON-LD' },
          { id: 'security', displayName: 'Security Agent', description: 'HTTPS & headers' },
          { id: 'crawl', displayName: 'Crawl Agent', description: 'Robots & sitemap' },
        ],
        latestAudit: {
          id: 'audit-demo-1',
          status: 'completed',
          health_score: 78,
          created_at: new Date().toISOString(),
        },
        recentAudits: [
          {
            id: 'audit-demo-1',
            status: 'completed',
            health_score: 78,
            created_at: new Date().toISOString(),
            target_url: project?.url ?? 'https://chefgaa.com',
          },
        ],
      },
    };
  }

  if (m.includes('/technical-seo/modules')) {
    return {
      data: [
        'website_health',
        'site_audit',
        'core_web_vitals',
        'indexability',
        'crawlability',
        'broken_links',
        'canonical_tags',
        'structured_data',
        'meta_data',
        'xml_sitemap',
        'robots_txt',
        'accessibility',
        'security_headers',
        'https',
      ].map((id) => ({ id, label: id.replace(/_/g, ' ') })),
    };
  }

  if (m.includes('/technical-seo/agents')) {
    return {
      data: [
        { id: 'technical_seo', displayName: 'Technical SEO Agent', description: 'Detects issues' },
        { id: 'performance', displayName: 'Performance Agent', description: 'CWV' },
        { id: 'crawl', displayName: 'Crawl Agent', description: 'Queue & robots' },
      ],
    };
  }

  if (m.includes('/technical-seo/issues')) {
    return {
      data: [
        {
          id: 'ti-1',
          title: 'Broken internal links detected',
          module: 'broken_links',
          severity: 'critical',
          status: 'open',
          business_impact: 'Users hit dead ends; bounce rate rises.',
          seo_impact: 'Crawl waste and diluted equity.',
          explanation: 'Browser Intelligence reported broken link findings.',
          recommended_fix: 'Replace or 301 broken URLs.',
          estimated_fix_minutes: 45,
          confidence_score: 0.86,
          suggested_fix: { type: 'redirect_rules', note: 'Map each broken URL to a replacement.' },
        },
        {
          id: 'ti-2',
          title: 'Missing Open Graph tags on key pages',
          module: 'open_graph',
          severity: 'medium',
          status: 'open',
          business_impact: 'Weak social share previews.',
          seo_impact: 'Lower CTR from social referrals.',
          explanation: 'og:title / description / image incomplete.',
          recommended_fix: 'Add OG + Twitter Card tags.',
          estimated_fix_minutes: 30,
          confidence_score: 0.75,
          suggested_fix: {
            type: 'meta_tags',
            html: '<meta property="og:title" content="Page Title" />',
          },
        },
      ],
    };
  }

  if (m.includes('/technical-seo/audits') && method === 'POST') {
    return {
      data: {
        id: 'audit-demo-queued',
        status: 'queued',
        target_url: 'https://example.com',
        audit_mode: 'full',
      },
    };
  }

  if (m.includes('/technical-seo/audits')) {
    return {
      data: [
        {
          id: 'audit-demo-1',
          status: 'completed',
          health_score: 78,
          target_url: project?.url ?? 'https://chefgaa.com',
          created_at: new Date().toISOString(),
        },
      ],
    };
  }

  if (m.includes('/technical-seo/export')) {
    return { exportedAt: new Date().toISOString(), issues: [] };
  }

  if (m.includes('/integrations/summary')) {
    return {
      data: {
        connectedCount: 3,
        availableCount: 7,
        syncQueue: 1,
        lastSyncAt: new Date().toISOString(),
        failedSyncs: 0,
        apiHealth: { healthy: 3, degraded: 0, down: 0, status: 'healthy' },
        connections: [],
        recentJobs: [],
        providers: [
          {
            key: 'google_search_console',
            name: 'Google Search Console',
            description: 'Search performance',
            category: 'search',
            authType: 'oauth',
            scopes: ['webmasters.readonly'],
            capabilities: [{ id: 'queries', label: 'Queries' }],
          },
          {
            key: 'google_analytics_4',
            name: 'Google Analytics 4',
            description: 'Sessions & conversions',
            category: 'analytics',
            authType: 'oauth',
            scopes: ['analytics.readonly'],
            capabilities: [{ id: 'sessions', label: 'Sessions' }],
          },
          {
            key: 'slack',
            name: 'Slack',
            description: 'Notifications',
            category: 'notifications',
            authType: 'webhook',
            scopes: ['chat:write'],
            capabilities: [{ id: 'notifications', label: 'Notifications' }],
          },
        ],
      },
    };
  }

  if (m.includes('/integrations/connections') && method === 'POST') {
    return {
      data: {
        id: 'conn-demo',
        provider_key: 'google_search_console',
        display_name: 'Google Search Console',
        status: 'connected',
        health_status: 'healthy',
      },
    };
  }

  if (m.includes('/integrations/connections')) {
    return {
      data: [
        {
          id: 'conn-gsc',
          provider_key: 'google_search_console',
          display_name: 'Google Search Console',
          status: 'connected',
          health_status: 'healthy',
          health_message: 'OK',
          last_sync_at: new Date().toISOString(),
          scopes: ['webmasters.readonly'],
          external_account_label: 'sc-domain:example.com',
        },
        {
          id: 'conn-ga4',
          provider_key: 'google_analytics_4',
          display_name: 'Google Analytics 4',
          status: 'connected',
          health_status: 'healthy',
          last_sync_at: new Date().toISOString(),
          scopes: ['analytics.readonly'],
        },
        {
          id: 'conn-slack',
          provider_key: 'slack',
          display_name: 'Slack',
          status: 'connected',
          health_status: 'healthy',
          scopes: ['chat:write'],
        },
      ],
    };
  }

  if (m.includes('/integrations/sync-jobs')) {
    return {
      data: [
        {
          id: 'sync-1',
          connection_id: 'conn-gsc',
          status: 'completed',
          mode: 'manual',
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      ],
    };
  }

  if (m.includes('/integrations/usage')) {
    return { data: [{ metric_key: 'api_calls', metric_value: 42, period_start: '2026-07-12' }] };
  }

  if (m.includes('/integrations/metrics')) {
    return {
      data: {
        searchConsole: { clicks: 1240, impressions: 48200, ctr: 0.0257, position: 18.4 },
        analytics: { sessions: 8200, users: 6400, conversions: 214, engagementRate: 0.61 },
        snapshots: [],
      },
    };
  }

  if (m.includes('/reports/runs')) {
    return {
      data: [
        {
          id: 'run-demo-1',
          report_id: 'rep-1',
          status: 'ready',
          progress: 100,
          created_at: new Date().toISOString(),
          executive_summary: {
            narrative:
              'Executive Report: 18 backlinks won; 72% campaign success. AI workforce saved approximately 42 hours.',
            highlights: ['18 backlinks won', '72% campaign success'],
            recommendations: ['Scale winning campaign templates'],
            risks: [],
            nextActions: ['Approve pending outreach drafts'],
          },
        },
      ],
    };
  }

  if (m.includes('/reports/brands') || (m.includes('/reports') && method === 'POST')) {
    return {
      data: {
        id: 'rep-1',
        title: 'Executive Report',
        report_type: 'executive',
        status: 'draft',
        schedule: 'weekly',
        updated_at: new Date().toISOString(),
      },
    };
  }

  if (m.includes('/reports')) {
    return {
      data: [
        {
          id: 'rep-1',
          title: 'Executive Report',
          report_type: 'executive',
          status: 'ready',
          schedule: 'weekly',
          updated_at: new Date().toISOString(),
          next_run_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
        {
          id: 'rep-2',
          title: 'Backlink Report',
          report_type: 'backlink',
          status: 'draft',
          schedule: 'monthly',
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }

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
        workflows: true,
        analytics: true,
        technical_seo: true,
        reports: true,
        integrations: true,
        white_label: true,
      },
    };
  }

  // Me / orgs
  if (m === '/v1/me') {
    return {
      data: {
        user: {
          id: 'demo-user',
          full_name: 'Demo Executive',
          email: 'ceo@seoos.demo',
          avatar_url: null,
        },
        organizations: DEMO_ORGANIZATIONS.map((org) => ({
          role: 'owner',
          org_id: org.id,
          organizations: {
            id: org.id,
            name: org.name,
            slug: org.slug,
            industry: org.industry,
            plan: org.plan,
          },
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
        automation: DEMO_AUTOMATION_SUMMARY,
        browserIntelligence: DEMO_BROWSER_INTELLIGENCE,
        relationshipIntelligence: DEMO_RELATIONSHIP_SUMMARY,
        outreach: DEMO_OUTREACH_SUMMARY,
        workflows: DEMO_WORKFLOW_SUMMARY,
      },
    };
  }

  // AI endpoints
  if (m === '/v1/ai/agents') return { data: DEMO_AGENTS };
  if (m.includes('/ai/health')) {
    return {
      data: { agentsRegistered: 5, handlersReady: 5, recentFailures: 0, status: 'healthy' },
    };
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

  if (m.includes('/intelligence/browser/summary')) return { data: DEMO_BROWSER_INTELLIGENCE };
  if (m.includes('/intelligence/browser/scans') && method === 'GET')
    return { data: DEMO_BROWSER_SCANS };
  if (m.includes('/intelligence/browser/scans') && method === 'POST')
    return { data: { id: 'scan-new', status: 'queued', phase: 'discovering_pages' } };
  if (m.includes('/intelligence/browser/profiles') && !m.includes('/profiles/'))
    return { data: DEMO_BROWSER_PROFILES };
  if (m.includes('/intelligence/website/scans')) {
    if (m.match(/\/website\/scans\/[^/]+$/) && method === 'GET') {
      return {
        data: {
          scan: DEMO_BROWSER_SCANS[0],
          pages: [
            { id: 'p1', title: 'Contact Us', path: '/contact', page_type: 'contact' },
            { id: 'p2', title: 'Write for Us', path: '/write-for-us', page_type: 'guest_post' },
          ],
          discoveries: [
            {
              id: 'd1',
              title: 'Guest post opportunity',
              discovery_type: 'opportunity',
              confidence: 88,
            },
            {
              id: 'd2',
              title: 'Resource page',
              discovery_type: 'resource_page',
              confidence: 70,
              url: 'https://foodnetwork.com/resources',
            },
          ],
        },
      };
    }
    return { data: DEMO_BROWSER_SCANS };
  }

  // Intelligence (legacy)
  if (m.includes('/intelligence/summary')) {
    return {
      data: {
        websiteScanner: { status: 'completed', phase: 'done', pagesAnalyzed: 47 },
        discovery: {
          keywordCount: 24,
          prospectTotal: 47,
          opportunityCounts: { guest_post: 8, resource_page: 5 },
        },
        timeline: DEMO_TIMELINE,
      },
    };
  }
  if (m.includes('/intelligence/website/scans') && method === 'GET') {
    return {
      data: [
        {
          id: 'scan1',
          status: 'completed',
          phase: 'completed',
          target_url: project.url,
          pages_analyzed: 47,
          pages_discovered: 52,
          brand_profile: {
            name: project.name,
            tagline: 'Premium catering & chef services',
            topics: ['catering', 'events', 'corporate'],
          },
          tech_stack: { cms: 'WordPress', analytics: ['GA4'], frameworks: ['React'] },
        },
      ],
    };
  }
  if (m.includes('/intelligence/website/scans') && method === 'POST')
    return { data: { id: 'scan-new', status: 'running' } };
  if (m.includes('/intelligence/discover') && method === 'POST')
    return { data: { status: 'started' } };
  if (m.includes('/intelligence/competitors') && !m.includes('suggestions'))
    return { data: DEMO_COMPETITORS };
  if (m.includes('/intelligence/keywords')) return { data: DEMO_KEYWORDS };
  if (m.includes('/intelligence/opportunities')) return { data: DEMO_OPPORTUNITIES };
  if (m.includes('/intelligence/prospects/pipeline')) return { data: DEMO_PROSPECT_PIPELINE };
  if (m.includes('/intelligence/research/events')) return { data: DEMO_TIMELINE };

  // Knowledge
  if (m.includes('/knowledge/stats'))
    return { data: { readyDocuments: 5, totalChunks: 136, processing: 0 } };
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
  if (m.includes('/campaigns/summary'))
    return { data: { active: 2, pendingApproval: 1, total: 4, avgProgress: 31 } };
  if (m.match(/\/campaigns$/) && method === 'GET') return { data: DEMO_CAMPAIGNS };
  if (m.includes('/campaigns/queue/opportunities')) return { data: DEMO_OPPORTUNITIES };
  if (m.includes('/campaigns/approvals')) return { data: DEMO_APPROVALS };
  if (m.includes('/campaigns/plan') && method === 'POST') {
    return {
      data: {
        summary: `AI campaign plan for ${project.name} targeting ${project.domain}`,
        phases: [
          {
            name: 'Discovery & qualification',
            durationWeeks: 2,
            actions: ['Review opportunity queue', 'Approve top prospects'],
          },
          {
            name: 'Outreach preparation',
            durationWeeks: 2,
            actions: ['Draft email templates', 'Personalize outreach'],
          },
          { name: 'Execution', durationWeeks: 4, actions: ['Launch outreach', 'Track responses'] },
        ],
        targetOpportunities: 25,
        recommendedTypes: ['guest_post'],
        aiGenerated: true,
      },
    };
  }
  if (
    m.includes('/campaigns/') &&
    method === 'GET' &&
    !m.includes('queue') &&
    !m.includes('approvals')
  ) {
    const camp = DEMO_CAMPAIGNS[0];
    return {
      data: {
        ...camp,
        plan: { summary: 'Guest post outreach for food & lifestyle publications', phases: [] },
        goals: [],
      },
    };
  }
  if (m.includes('/timeline'))
    return { data: DEMO_TIMELINE.filter((t) => t.event_type.startsWith('campaign')) };

  // Backlink Builder (Sprint 5.5)
  if (m.includes('/backlink-builder/automation/summary')) return { data: DEMO_AUTOMATION_SUMMARY };
  if (m.includes('/backlink-builder/automation/imports') && method === 'GET')
    return { data: DEMO_IMPORTS };
  if (m.includes('/backlink-builder/automation/import') && method === 'POST') {
    return {
      data: { importId: 'imp-demo-new', stats: { total: 5, valid: 4, duplicates: 1, invalid: 0 } },
    };
  }
  if (
    m.includes('/backlink-builder/automation/imports/') &&
    m.includes('/run') &&
    method === 'POST'
  ) {
    return {
      data: {
        runId: 'run-demo-new',
        importId: 'imp-demo-2',
        opportunitiesCreated: 8,
        contentGenerated: 16,
        stepsCompleted: ['import', 'validate', 'analyze', 'classify', 'score', 'generate'],
      },
    };
  }
  if (m.includes('/backlink-builder/automation/tracking')) return { data: DEMO_TRACKING };
  if (m.includes('/backlink-builder/automation/submissions')) return { data: DEMO_SUBMISSIONS };
  if (m.includes('/backlink-builder/summary')) return { data: DEMO_BACKLINK_SUMMARY };
  if (m.includes('/backlink-builder/types')) return { data: DEMO_BACKLINK_TYPES };
  if (m.includes('/backlink-builder/ai/suggestions')) return { data: DEMO_AI_BACKLINK_SUGGESTIONS };
  if (m.includes('/backlink-builder/pipeline')) return { data: DEMO_BACKLINK_PIPELINE };
  if (m.includes('/backlink-builder/relationships')) return { data: DEMO_RELATIONSHIPS };

  if (m.includes('/relationships/summary')) return { data: DEMO_RELATIONSHIP_SUMMARY };
  if (m.includes('/relationships/organizations/') && !m.endsWith('/organizations')) {
    return { data: DEMO_RELATIONSHIP_ORG_DETAIL };
  }
  if (m.includes('/relationships/organizations')) return { data: DEMO_RELATIONSHIP_ORGANIZATIONS };
  if (m.includes('/relationships/contacts/recommended'))
    return { data: DEMO_RELATIONSHIP_CONTACTS.filter((c) => c.is_recommended_outreach) };
  if (m.includes('/relationships/contacts')) return { data: DEMO_RELATIONSHIP_CONTACTS };
  if (m.includes('/relationships/timeline')) return { data: DEMO_RELATIONSHIP_TIMELINE };
  if (m.includes('/relationships/discover') && method === 'POST')
    return { data: { enriched: 3, results: [] } };
  if (m.includes('/relationships/enrich') && method === 'POST')
    return {
      data: { organizationId: 'org1', contactsDiscovered: 3, scores: { priorityScore: 78 } },
    };

  if (m.includes('/outreach/summary')) return { data: DEMO_OUTREACH_SUMMARY };
  if (m.includes('/outreach/threads/') && !m.endsWith('/threads'))
    return { data: DEMO_OUTREACH_THREAD_DETAIL };
  if (m.includes('/outreach/threads')) return { data: DEMO_OUTREACH_THREADS };
  if (m.includes('/outreach/templates/') && m.includes('/apply') && method === 'POST') {
    return {
      data: {
        subject: DEMO_OUTREACH_TEMPLATES[0].subject,
        bodyHtml: DEMO_OUTREACH_TEMPLATES[0].body_html,
        tone: 'professional',
      },
    };
  }
  if (m.includes('/outreach/templates')) return { data: DEMO_OUTREACH_TEMPLATES };
  if (m.includes('/outreach/sequences/') && !m.endsWith('/sequences'))
    return { data: DEMO_OUTREACH_SEQUENCE_DETAIL };
  if (m.includes('/outreach/sequences') && method === 'POST')
    return { data: DEMO_OUTREACH_SEQUENCE_DETAIL };
  if (m.includes('/outreach/sequences')) return { data: DEMO_OUTREACH_SEQUENCES };
  if (m.includes('/outreach/messages/ai-generate') && method === 'POST') {
    return {
      data: {
        messageId: 'msg-demo',
        subject: 'Collaboration idea for Serious Eats',
        bodyHtml: '<p>Hi there,</p><p>AI-generated draft for review.</p>',
        subjectSuggestions: ['Guest post pitch', 'Partnership idea'],
      },
    };
  }
  if (m.includes('/outreach/messages/') && m.includes('/submit') && method === 'POST')
    return { data: { messageId: 'msg-demo', status: 'pending_approval' } };
  if (m.includes('/outreach/messages') && method === 'POST')
    return { data: { messageId: 'msg-demo', threadId: 'th1' } };
  if (m.includes('/outreach/accounts'))
    return {
      data: [
        {
          id: 'acct1',
          label: 'Demo Sender',
          provider_type: 'mock',
          from_email: 'outreach@seoos.demo',
          is_default: true,
          status: 'active',
        },
      ],
    };
  if (m.includes('/outreach/tasks')) return { data: DEMO_OUTREACH_THREAD_DETAIL.tasks };

  if (m.includes('/workflows/summary')) return { data: DEMO_WORKFLOW_SUMMARY };
  if (m.includes('/workflows/templates')) return { data: DEMO_WORKFLOW_TEMPLATES };
  if (m.includes('/workflows/approvals') && m.includes('/decide') && method === 'POST')
    return { data: { decision: 'approved' } };
  if (m.includes('/workflows/approvals')) return { data: DEMO_WORKFLOW_APPROVALS };
  if (m.includes('/workflows/runs/'))
    return {
      data: {
        ...DEMO_WORKFLOW_RUNS[0],
        steps: [],
        approvals: DEMO_WORKFLOW_APPROVALS,
      },
    };
  if (m.includes('/workflows/runs')) return { data: DEMO_WORKFLOW_RUNS };
  if (m.match(/\/workflows\/[^/]+\/run$/) && method === 'POST')
    return { data: DEMO_WORKFLOW_RUNS[0] };
  if (m.match(/\/workflows\/[^/]+$/) && method === 'PATCH')
    return { data: { ...DEMO_WORKFLOWS[0], ...(body ? JSON.parse(body) : {}) } };
  if (m.match(/\/workflows\/[^/]+$/) && !m.endsWith('/workflows'))
    return { data: DEMO_WORKFLOWS[0] };
  if (m.includes('/workflows') && method === 'POST')
    return { data: { ...DEMO_WORKFLOWS[0], id: 'wf-new', name: 'New workflow' } };
  if (m.includes('/workflows')) return { data: DEMO_WORKFLOWS };


  if (m.includes('/backlink-builder/campaigns/associations')) {
    return {
      data: {
        campaigns: DEMO_CAMPAIGNS,
        associations: DEMO_OPPORTUNITIES.filter((o) => o.pipeline_stage === 'campaign_ready').map(
          (o) => ({
            ...o,
            campaign_id: 'camp1',
          })
        ),
      },
    };
  }
  if (
    m.includes('/backlink-builder/opportunities/') &&
    m.includes('/stage') &&
    method === 'PATCH'
  ) {
    return { data: { ok: true } };
  }
  if (m.includes('/backlink-builder/opportunities/bulk') && method === 'POST') {
    return { data: [{ status: 'approved' }] };
  }
  if (
    m.includes('/backlink-builder/opportunities/') &&
    m.includes('/generate') &&
    method === 'POST'
  ) {
    return {
      data: {
        id: 'draft-demo',
        title: 'AI Draft',
        content: 'Demo generated content...',
        draft_type: 'email',
      },
    };
  }
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
    const enriched = DEMO_OPPORTUNITIES.map((o) => ({
      ...o,
      logo_url: `https://www.google.com/s2/favicons?domain=${o.domain}&sz=64`,
      backlink_category: o.opportunity_type === 'guest_post' ? 'content_based' : 'outreach_based',
      ai_suggestion: o.ai_recommendation,
    }));
    return {
      data: enriched,
      pagination: { nextCursor: null, prevCursor: null, limit: 50, hasMore: false },
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
        {
          id: 'msg1',
          role: 'assistant',
          content:
            'Welcome to SEO OS Command Center. I have full context on Chefgaa — competitors, keywords, and 12 pending opportunities. What would you like to do?',
          agent_type: 'seo_strategist',
        },
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

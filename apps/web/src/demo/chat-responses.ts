import { DEMO_CHAT_PROMPTS } from './data';

const RESPONSES: Record<string, string> = {
  'analyze chefgaa': `## Chefgaa Analysis

**Domain:** chefgaa.com | **Industry:** Restaurant & Catering

### Brand Position
Chefgaa positions as a premium catering and chef-on-demand service targeting corporate events and weddings.

### Competitive Landscape
| Competitor | Threat | Gap |
|------------|--------|-----|
| Zomato | High delivery presence | Chefgaa wins on bespoke catering |
| Swiggy | Consumer delivery | B2B corporate niche underserved |
| Uber Eats | Brand recognition | Local authority & events focus |

### Top Opportunities
1. **FoodNetwork.com** — Guest post (Score: 87)
2. **Eater.com** — Resource page (Score: 82)
3. **Serious Eats** — Broken link reclamation (Score: 76)

### Recommendation
Launch a **Guest Post campaign** targeting food & lifestyle publications. Estimated impact: +15 referring domains in 90 days.`,

  'find opportunities': `## Discovered Opportunities

I analyzed Chefgaa's competitive landscape and found **12 high-value opportunities**:

**Guest Posts (8)**
- FoodNetwork.com — Score 87 ⭐
- Bon Appétit — Score 85
- Serious Eats — Score 79

**Resource Pages (5)**
- Eater.com catering guide — Score 82
- Tasting Table resources — Score 74

**Broken Links (3)**
- Local food blog — dead catering link

**Directories (4)**
- Yelp, TripAdvisor, Zomato Business

Would you like me to add the top 5 to a new campaign?`,

  'create campaign': `## Campaign Created ✓

**Name:** Guest Post — Food & Lifestyle  
**Type:** Guest Post Outreach  
**Status:** Draft → Ready for approval

### AI-Generated Plan
**Phase 1 (2 weeks):** Qualify 12 opportunities, approve top 8  
**Phase 2 (2 weeks):** Draft personalized outreach emails  
**Phase 3 (4 weeks):** Execute outreach, track responses

### Attached Opportunities
- FoodNetwork.com (87)
- Eater.com (82)
- Bon Appétit (85)
- Serious Eats (79)
- Tasting Table (74)

Campaign is visible in Mission Control. Submit for launch approval when ready.`,

  'generate guest post': `## Guest Post Draft

**Title:** How Corporate Teams Are Rediscovering the Art of Shared Meals

**Target:** FoodNetwork.com — Lifestyle section

---

In an era of desk lunches and video calls, something remarkable is happening in corporate kitchens across the country. Companies are investing in experiences, not just calories.

Chefgaa has seen a 340% increase in corporate catering requests this year. The trend isn't about feeding people — it's about bringing teams together.

**Three shifts driving this:**
1. **Experience over convenience** — Teams want memorable moments
2. **Health meets indulgence** — Premium ingredients, dietary flexibility
3. **Local authenticity** — Regional flavors that tell a story

*[Draft continues — 1,200 words ready for editor review]*

**QA Agent status:** ✓ Brand voice validated | ✓ Facts verified`,

  'explain competitors': `## Competitor Intelligence

### Zomato (zomato.com) — Primary Threat
- **Strength:** Massive delivery network, brand recognition
- **Weakness:** Generic restaurant listings, no bespoke catering
- **Chefgaa angle:** Position as premium alternative for corporate events

### Swiggy (swiggy.com) — Secondary
- **Strength:** Fast consumer delivery, marketing spend
- **Weakness:** Limited B2B catering focus
- **Chefgaa angle:** Own the "corporate lunch" keyword cluster

### Uber Eats — Emerging
- **Strength:** Global brand, enterprise partnerships starting
- **Weakness:** Catering is add-on, not core
- **Chefgaa angle:** First-mover in chef-on-demand category

**Strategic recommendation:** Target publications where these brands don't have editorial presence.`,

  'generate report': `## Executive SEO Report — Chefgaa

**Period:** Q2 2026 | **Prepared by:** SEO OS AI Workforce

### Key Metrics
| Metric | Value | Change |
|--------|-------|--------|
| Organic traffic | 12,400/mo | +23% |
| Referring domains | 34 | +8 |
| Keywords top 10 | 47 | +12 |
| Campaign success rate | 78% | +5% |

### Time Saved
**340 hours** of manual research, outreach prep, and reporting automated by AI agents this quarter.

### Productivity Score: 94/100

### Next Actions
1. Approve Guest Post campaign launch
2. Review 3 pending email drafts
3. Expand to Desi Dhamaka project`,

  'build outreach strategy': `## Outreach Strategy — Chefgaa

### Target Personas
1. **Food editors** — Guest posts, recipe features
2. **Event planners** — Resource page listings
3. **Local business directories** — NAP consistency

### Sequence (AI-Optimized)
**Week 1-2:** Research & personalization  
**Week 3-4:** Initial outreach (8 prospects/week)  
**Week 5-6:** Follow-up & negotiation  
**Week 7-8:** Content delivery & link placement

### Email Templates Ready
- Guest post pitch (personalized)
- Resource page request
- Broken link reclamation

### Expected Outcomes
- 15-20% response rate (industry avg: 8%)
- 6-8 placements in 90 days
- Est. 12 new referring domains`,
};

export function matchDemoChatResponse(input: string): string {
  const lower = input.toLowerCase().trim();
  for (const [key, response] of Object.entries(RESPONSES)) {
    if (lower.includes(key) || key.includes(lower.slice(0, 20))) return response;
  }
  // Fuzzy match on prompt list
  const prompt = DEMO_CHAT_PROMPTS.find((p) => lower.includes(p.toLowerCase().slice(0, 12)));
  if (prompt) {
    const key = prompt.toLowerCase().replace(/\.$/, '');
    return RESPONSES[key] ?? defaultResponse(input);
  }
  return defaultResponse(input);
}

function defaultResponse(input: string): string {
  return `I've analyzed your request: "${input}"

Based on Chefgaa's knowledge base, competitive landscape, and 12 pending opportunities, here's my assessment:

**Context loaded:** Brand guidelines, 5 KB documents, 24 memory facts, 4 active competitors

**Recommendation:** I suggest starting with the Guest Post campaign — FoodNetwork.com and Eater.com are your highest-scoring opportunities.

Would you like me to create a campaign, generate content, or dive deeper into any area?`;
}

/** Simulate streaming by yielding chunks */
export async function* streamDemoResponse(text: string, chunkSize = 12): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 25));
  }
}

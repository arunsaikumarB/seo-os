/** Relationship scoring model — Epic 4 */

import type { WarmthLevel } from './relationship-agent.js';

export interface RelationshipScores {
  relationshipStrength: number;
  responseProbability: number;
  campaignSuitability: number;
  collaborationPotential: number;
  priorityScore: number;
  riskScore: number;
  warmth: WarmthLevel;
  recommendedAction: string;
}

export interface ScoringInput {
  domainAuthority?: number;
  contactCount?: number;
  hasContactEmail?: boolean;
  hasContactForm?: boolean;
  guestPostAvailable?: boolean;
  backlinksWon?: number;
  campaignCount?: number;
  confidenceScore?: number;
  warmth?: WarmthLevel;
}

export function scoreRelationship(input: ScoringInput): RelationshipScores {
  let strength = 20;
  let response = 15;
  let suitability = 40;
  let collaboration = 30;
  let risk = 25;

  if (input.domainAuthority && input.domainAuthority >= 50) {
    strength += 15;
    suitability += 10;
  }
  if (input.domainAuthority && input.domainAuthority >= 70) {
    collaboration += 15;
  }
  if (input.hasContactEmail) {
    response += 20;
    strength += 10;
    risk -= 5;
  }
  if (input.hasContactForm) {
    response += 8;
  }
  if (input.guestPostAvailable) {
    suitability += 20;
    collaboration += 15;
  }
  if ((input.contactCount ?? 0) >= 2) {
    strength += 10;
    collaboration += 10;
  }
  if ((input.backlinksWon ?? 0) > 0) {
    strength += 25;
    response += 15;
    collaboration += 20;
    risk -= 15;
  }
  if ((input.campaignCount ?? 0) > 0) {
    suitability += 10;
  }

  const warmth: WarmthLevel =
    input.warmth ?? (strength >= 70 ? 'hot' : strength >= 45 ? 'warm' : 'cold');

  if (warmth === 'partner') strength = Math.min(100, strength + 20);
  if (warmth === 'hot') strength = Math.min(95, strength + 10);

  const priority = Math.round(
    strength * 0.3 + response * 0.25 + suitability * 0.25 + collaboration * 0.2 - risk * 0.1
  );

  let recommendedAction = 'Research organization further before outreach.';
  if (priority >= 75)
    recommendedAction = 'Prioritize personalized outreach to recommended contact.';
  else if (priority >= 55) recommendedAction = 'Queue for campaign with tailored guest post pitch.';
  else if (input.guestPostAvailable)
    recommendedAction = 'Review editorial guidelines and prepare submission draft.';
  else if (input.hasContactEmail)
    recommendedAction = 'Send introductory outreach email for review.';

  return {
    relationshipStrength: Math.min(100, Math.max(5, strength)),
    responseProbability: Math.min(90, Math.max(5, response)),
    campaignSuitability: Math.min(100, Math.max(10, suitability)),
    collaborationPotential: Math.min(100, Math.max(10, collaboration)),
    priorityScore: Math.min(100, Math.max(5, priority)),
    riskScore: Math.min(90, Math.max(5, risk)),
    warmth,
    recommendedAction,
  };
}

export function recommendOutreachContact(
  contacts: Array<{ id: string; role?: string; confidence_score?: number; public_email?: string }>
): string | null {
  if (!contacts.length) return null;
  const scored = contacts.map((c) => {
    let score = c.confidence_score ?? 50;
    if (c.public_email) score += 15;
    if (c.role === 'Editor') score += 20;
    if (c.role === 'Marketing Manager' || c.role === 'Partnerships') score += 15;
    if (c.role === 'Founder') score += 10;
    return { id: c.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}

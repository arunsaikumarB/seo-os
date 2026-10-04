/**
 * What to write, if anything, after a scan. An email is only for outreach
 * with a real editor. Directory and citation forms get field values.
 * A stopped page gets nothing.
 */

import type { UrlScanVerdict } from './url-scanner.js';

export type DraftKind = 'none' | 'outreach_email' | 'form_fields' | 'assisted_content';

export interface DraftPlan {
  kind: DraftKind;
  reason: string;
  /** Editor address from the page or an explicit editor flag. Never the SMTP test inbox. */
  recipientEmail: string | null;
  /** Always unknown unless a name was actually on the page. The local-part of an email is not a name. */
  recipientName: string | null;
  fieldNames: string[];
}

const NAME_ON_PAGE = /(?:editor|contact|author)\s*:\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})/;

export function planBacklinkDraft(input: {
  category: string | null;
  mode: 'stop' | 'automatic' | 'assisted' | 'outreach' | 'unknown';
  verdict: Pick<
    UrlScanVerdict,
    'contactEmails' | 'contactChannels' | 'forms' | 'pageExcerpt' | 'submissionFormIndex' | 'pageKind'
  >;
  /** An editor address the user named. Not the --to mailbox used only to send a test. */
  editorEmail?: string | null;
}): DraftPlan {
  const submission =
    input.verdict.forms.find((form) => form.isBacklinkSubmission) ??
    input.verdict.forms.find((form) => form.kind === 'submission') ??
    null;
  const fieldNames = submission?.fields.map((field) => field.name).filter(Boolean) ?? [];
  const pageEmail = input.verdict.contactEmails[0] ?? null;
  const editor = input.editorEmail?.trim() || null;
  const named = NAME_ON_PAGE.exec(input.verdict.pageExcerpt)?.[1] ?? null;

  if (!input.category || input.mode === 'unknown' || input.mode === 'stop') {
    return {
      kind: 'none',
      reason: input.mode === 'stop' || !input.category
        ? 'No draft. The workflow is stop or the category is unknown, so there is nothing to send or fill.'
        : 'No draft.',
      recipientEmail: null,
      recipientName: null,
      fieldNames,
    };
  }

  if (input.mode === 'outreach') {
    const recipient = pageEmail || editor;
    if (!recipient) {
      return {
        kind: 'none',
        reason:
          'No outreach email. This is an outreach page, but no editor address was on the page and none was provided with --editor. The --to address is only the test mailbox and is not the recipient.',
        recipientEmail: null,
        recipientName: null,
        fieldNames,
      };
    }
    return {
      kind: 'outreach_email',
      reason: pageEmail
        ? `Outreach email to ${pageEmail}, the address found on the page.`
        : `Outreach email to ${editor}, the editor address that was provided.`,
      recipientEmail: recipient,
      recipientName: named,
      fieldNames,
    };
  }

  if (input.mode === 'automatic' || input.category === 'directory' || input.category === 'citation') {
    return {
      kind: 'form_fields',
      reason:
        fieldNames.length > 0
          ? 'Form field values for the submission form. This is not an email.'
          : 'No submission fields were found to fill.',
      recipientEmail: null,
      recipientName: null,
      fieldNames,
    };
  }

  return {
    kind: 'assisted_content',
    reason: 'Post or profile text for a person to paste after they sign in. This is not an email.',
    recipientEmail: null,
    recipientName: null,
    fieldNames,
  };
}

export interface ClientFacts {
  label: string;
  niche: string;
  url: string;
  description: string;
}

function fieldRole(name: string): 'url' | 'business' | 'description' | 'category' | 'skip' {
  const blob = name.toLowerCase();
  if (/logo|facebook|twitter|youtube|gplus|gmap|twellow|phone|zip|postal|country|state|address|e-?mail/.test(blob)) {
    return 'skip';
  }
  if (/\burl\b|website|homepage/.test(blob)) return 'url';
  if (/description|about|summary|xdescription/.test(blob)) return 'description';
  if (/categor|industry|niche/.test(blob)) return 'category';
  if (/business.?name|company|organization|site name|\bname\b/.test(blob)) return 'business';
  return 'skip';
}

/** Drop repeated sentences such as a title pasted after the same meta description. */
export function dedupeDescription(text: string): string {
  const pieces = text
    .split(/\s*\|\s*|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 1);
  const kept: string[] = [];
  const keys: string[] = [];
  for (const part of pieces) {
    const key = part.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key) continue;
    if (keys.some((existing) => existing === key || existing.includes(key) || key.includes(existing))) continue;
    keys.push(key);
    kept.push(/[.!?]$/.test(part) ? part : `${part}.`);
  }
  return kept.join(' ').slice(0, 400);
}

export function buildBusinessDescriptionPrompt(input: {
  label: string;
  title?: string | null;
  h1?: string | null;
  metaDescription?: string | null;
}): string {
  const facts = [input.metaDescription, input.h1, input.title]
    .map((part) => (part ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [
    `Write 1 or 2 sentences describing ${input.label} for a directory listing.`,
    'Use only the facts below. Do not invent an address, phone, email, country, or award.',
    'Return the sentences only, with no heading and no JSON.',
    facts.join('\n') || '(no page text)',
  ].join('\n');
}

/** Keep a model description only when it is one or two plain sentences. */
export function acceptBusinessDescription(modelText: string): string | null {
  const stripped = modelText.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped || stripped.startsWith('{') || stripped.startsWith('[')) return null;
  const sentences = stripped.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  const chosen = (sentences.length > 0 ? sentences.slice(0, 2).join(' ') : stripped).slice(0, 400);
  if (chosen.length < 12) return null;
  return dedupeDescription(chosen);
}

/** Values taken only from the target site. Unknown contact details stay empty. */
export function formValuesFromFacts(fieldNames: string[], facts: ClientFacts): Record<string, string> {
  const description = dedupeDescription(facts.description || '');
  const label = facts.label.toLowerCase();
  const category = facts.niche
    .split(/\s+/)
    .filter((word) => word && word.toLowerCase() !== label)
    .slice(0, 4)
    .join(' ');
  const values: Record<string, string> = {};
  for (const name of fieldNames) {
    const role = fieldRole(name);
    if (role === 'url') values[name] = facts.url;
    else if (role === 'business') values[name] = facts.label;
    else if (role === 'description') values[name] = description;
    else if (role === 'category') values[name] = category;
    else values[name] = '';
  }
  return values;
}

function parseModelObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Keep a model form draft only when its keys are the real field names and every
 * non-empty value is already in the client facts. Otherwise the rules fill is used.
 */
export function groundFormFieldDraft(
  modelText: string | null | undefined,
  fieldNames: string[],
  facts: ClientFacts
): { json: string; source: 'rules' | 'model' } {
  const rules = formValuesFromFacts(fieldNames, facts);
  const parsed = parseModelObject(modelText);
  const keys = parsed ? Object.keys(parsed) : [];
  const expected = new Set(fieldNames);
  if (!parsed || keys.length === 0 || keys.some((key) => !expected.has(key))) {
    return { json: JSON.stringify(rules, null, 2), source: 'rules' };
  }
  const corpus = `${facts.label}\n${facts.niche}\n${facts.url}\n${facts.description}`.toLowerCase();
  let usedModel = false;
  const merged: Record<string, string> = {};
  for (const name of fieldNames) {
    const ruleValue = rules[name] ?? '';
    const modelValue = typeof parsed[name] === 'string' ? parsed[name].trim() : '';
    if (ruleValue) merged[name] = ruleValue;
    else if (modelValue && corpus.includes(modelValue.toLowerCase())) {
      merged[name] = modelValue;
      usedModel = true;
    } else merged[name] = '';
  }
  return { json: JSON.stringify(merged, null, 2), source: usedModel ? 'model' : 'rules' };
}

export function buildDraftPrompt(input: {
  plan: DraftPlan;
  category: string;
  clientLabel: string;
  niche: string;
  targetUrl: string;
  pageUrl: string;
  pageExcerpt: string;
}): string | null {
  if (input.plan.kind === 'none' || (input.plan.kind === 'form_fields' && input.plan.fieldNames.length === 0)) {
    return null;
  }
  const who = `You write for ${input.clientLabel} (${input.targetUrl}). Niche: ${input.niche || 'unknown'}.`;
  const facts = `Use only facts that appear in the niche or that the user already knows about ${input.clientLabel}. If a fact is missing, use an empty string. Do not invent a person's name, a phone number, or an address.`;
  if (input.plan.kind === 'form_fields') {
    return [
      who,
      `Fill the ${input.category} form on ${input.pageUrl}. Return a JSON object whose keys are exactly: ${input.plan.fieldNames.join(', ')}.`,
      'This is the client being submitted to that site. Do not ask the site to add itself to the client\'s directory. Do not write an email.',
      facts,
      `Page excerpt: ${input.pageExcerpt.slice(0, 800)}`,
    ].join('\n');
  }
  if (input.plan.kind === 'outreach_email') {
    const greeting = input.plan.recipientName ? `Hello ${input.plan.recipientName},` : 'Hello,';
    return [
      who,
      `Write one email from ${input.clientLabel} to the editor of ${input.pageUrl}.`,
      `To: ${input.plan.recipientEmail}. Category: ${input.category}.`,
      `Start the body with "${greeting}". The recipient name is ${input.plan.recipientName ?? 'unknown'}. Never derive a name from an email address.`,
      'Purpose: ask for a relevant placement of the client (guest post, resource mention, or the category\'s normal request). Do not offer to list the editor\'s site on the client.',
      facts,
      'Return a subject line and the body. Do not invent metrics or a claim that the link is already placed.',
    ].join('\n');
  }
  return [
    who,
    `Write the ${input.category} text a person will paste on ${input.pageUrl} after they log in. This is a post, answer, or profile, not an email.`,
    facts,
    `Page excerpt: ${input.pageExcerpt.slice(0, 800)}`,
  ].join('\n');
}

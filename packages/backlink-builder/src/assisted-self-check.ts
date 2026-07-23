/**
 * Phase 8 — value/role self-check + confidence gating.
 * Never ship a wrong value as high confidence; flag mismatches for the human.
 */

export type SelfCheckConfidence = 'high' | 'medium' | 'low';
export type SelfCheckSource =
  | 'dom_label'
  | 'llm_inferred'
  | 'human_corrected'
  | 'name_guess'
  | 'known_bad';

export type SelfCheckRole =
  | 'title'
  | 'short_desc'
  | 'long_desc'
  | 'url'
  | 'email'
  | 'phone'
  | 'address'
  | 'name'
  | 'business_name'
  | 'category'
  | 'terms'
  | 'attachment'
  | 'other';

export type SelfCheckFieldInput = {
  role: SelfCheckRole | string;
  source: SelfCheckSource | string;
  confidence: SelfCheckConfidence;
  value: string;
  humanStep?: string | null;
  flagged?: boolean;
  flagReason?: string | null;
};

const URL_RE =
  /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[\w\-./?%&=+#]*)?$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOKS_LIKE_URL_RE =
  /^(https?:\/\/|www\.)|[a-z0-9-]+\.(com|org|net|io|co|app|dev|ai|info|biz)(\/|$)/i;
export const MIN_LONG_DESC_CHARS = 40;
export const MIN_SHORT_DESC_CHARS = 12;

export type RoleValueCheck = {
  ok: boolean;
  reason?: string;
};

/** Validate a filled value against its assigned role. Empty values are handled separately. */
export function valueMatchesRole(role: string, value: string): RoleValueCheck {
  const v = String(value ?? '').trim();
  if (!v) {
    return { ok: true };
  }

  switch (role) {
    case 'url':
      if (!URL_RE.test(v) && !LOOKS_LIKE_URL_RE.test(v)) {
        return { ok: false, reason: 'URL field value is not a URL' };
      }
      return { ok: true };

    case 'title':
    case 'business_name':
    case 'name':
      if (LOOKS_LIKE_URL_RE.test(v) || /^https?:\/\//i.test(v)) {
        return { ok: false, reason: `${role} must not be a URL` };
      }
      if (v.length > 200) {
        return { ok: false, reason: `${role} looks too long for a title` };
      }
      return { ok: true };

    case 'short_desc':
      if (LOOKS_LIKE_URL_RE.test(v) && v.length < 80) {
        return { ok: false, reason: 'short description must be prose, not a URL' };
      }
      if (v.length > 0 && v.length < MIN_SHORT_DESC_CHARS) {
        return { ok: false, reason: `short description under ${MIN_SHORT_DESC_CHARS} chars` };
      }
      return { ok: true };

    case 'long_desc':
      if (LOOKS_LIKE_URL_RE.test(v) && !/\s/.test(v)) {
        return { ok: false, reason: 'description must be prose, not a URL' };
      }
      if (v.length > 0 && v.length < MIN_LONG_DESC_CHARS) {
        return {
          ok: false,
          reason: `description under ${MIN_LONG_DESC_CHARS} chars — likely truncated or wrong role`,
        };
      }
      return { ok: true };

    case 'email':
      if (!EMAIL_RE.test(v)) {
        return { ok: false, reason: 'email field value is not an email' };
      }
      return { ok: true };

    case 'phone':
      if ((v.match(/\d/g) ?? []).length < 7) {
        return { ok: false, reason: 'phone field needs more digits' };
      }
      return { ok: true };

    default:
      return { ok: true };
  }
}

function demoteConfidence(_c: SelfCheckConfidence): SelfCheckConfidence {
  return 'low';
}

/**
 * Confidence gate: never present a wrong or empty value as high.
 * human_corrected pins keep shape unless the value clearly violates the role.
 */
export function confidenceAfterSelfCheck(
  role: string,
  source: string,
  base: SelfCheckConfidence,
  value: string
): { confidence: SelfCheckConfidence; flagged: boolean; flagReason: string | null } {
  const trimmed = String(value ?? '').trim();

  if (role === 'terms' || role === 'attachment') {
    return { confidence: base, flagged: false, flagReason: null };
  }

  if (!trimmed && role !== 'other') {
    return {
      confidence: 'low',
      flagged: true,
      flagReason: 'No value — do not treat as confident',
    };
  }

  const check = valueMatchesRole(role, trimmed);
  if (!check.ok) {
    return {
      confidence: source === 'human_corrected' ? demoteConfidence(base) : 'low',
      flagged: true,
      flagReason: check.reason ?? 'Value does not match role',
    };
  }

  if (source === 'name_guess' || source === 'known_bad') {
    return {
      confidence: base === 'high' ? 'low' : base === 'medium' ? 'low' : base,
      flagged: base === 'high' || base === 'medium',
      flagReason:
        base === 'high' || base === 'medium'
          ? 'Classifier uncertain — verify this field'
          : null,
    };
  }

  if (source === 'llm_inferred' && base === 'high') {
    return {
      confidence: 'medium',
      flagged: true,
      flagReason: 'Inferred without a clear DOM label — verify',
    };
  }

  return { confidence: base, flagged: false, flagReason: null };
}

/** Apply self-check + confidence gate to every package field. */
export function selfCheckPackageFields<T extends SelfCheckFieldInput>(fields: T[]): T[] {
  return fields.map((f) => {
    const gated = confidenceAfterSelfCheck(
      f.role,
      f.source,
      f.confidence,
      f.value
    );
    if (!gated.flagged && gated.confidence === f.confidence) return f;
    return {
      ...f,
      confidence: gated.confidence,
      flagged: gated.flagged || Boolean(f.flagged),
      flagReason: gated.flagReason ?? f.flagReason ?? null,
      humanStep:
        gated.flagged && gated.flagReason
          ? [f.humanStep, `⚠ ${gated.flagReason}`].filter(Boolean).join(' · ')
          : f.humanStep,
    };
  });
}

/** Count high vs flagged — for honesty copy on the package. */
export function confidenceGateSummary(
  fields: Array<{
    required?: boolean;
    role: string;
    confidence: SelfCheckConfidence;
    flagged?: boolean;
  }>
): {
  high: number;
  flagged: number;
  lowOrMed: number;
  line: string | null;
} {
  const required = fields.filter(
    (f) => f.required && f.role !== 'terms' && f.role !== 'attachment'
  );
  const high = required.filter((f) => f.confidence === 'high' && !f.flagged).length;
  const flagged = required.filter((f) => f.flagged).length;
  const lowOrMed = required.filter(
    (f) => f.confidence === 'low' || f.confidence === 'medium'
  ).length;
  if (flagged === 0 && lowOrMed === 0) {
    return { high, flagged, lowOrMed, line: null };
  }
  return {
    high,
    flagged,
    lowOrMed,
    line: `${high} confident · ${flagged + lowOrMed} need a check — better than guessing`,
  };
}

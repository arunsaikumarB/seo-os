/** pg-compat: ILIKE/LIKE + jsonb array encoding for company Postgres Import. */
 * Chainable API mirrors supabase-js patterns used heavily in apps/api.
 * Not full PostgREST parity — see docs/cutover/no-supabase-phase-4b.md.
 */
import { pgQuery } from './pg.js';

export type PgCompatError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type PgCompatResult<T = unknown> = {
  data: T;
  error: PgCompatError | null;
  count?: number | null;
};

type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'is'
  | 'like'
  | 'ilike'
  | 'not.is'
  | 'not.in'
  | 'or';

type Filter = {
  op: FilterOp;
  column?: string;
  value?: unknown;
  /** Pre-built SQL fragment for OR groups (params already appended). */
  sql?: string;
};

type OrderSpec = { column: string; ascending: boolean; nullsFirst?: boolean };

type NestedSelect = {
  alias: string;
  table: string;
  columns: string; // '*' or comma list
  fkColumn: string; // column on parent that references nested.id
};

type ParsedSelect = {
  flat: string[]; // column names or '*'
  nested: NestedSelect[];
  unsupported?: string;
};

type MutationKind = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function quoteTable(table: string): string {
  return `public.${quoteIdent(table)}`;
}

/**
 * node-pg encodes JS arrays as `{a,b}` (Postgres array literal). That is invalid
 * for jsonb columns (`opportunity_types`, `steps_completed`, `metadata`, …) and
 * was aborting Import with "invalid input syntax for type json".
 * Native text[]/uuid[] columns keep JS arrays so node-pg can encode them.
 */
const PG_NATIVE_ARRAY_COLUMNS = new Set([
  'domain_style_profiles.keywords',
  'image_learning.style_tags',
  'image_metadata.categories',
  'image_metadata.keywords',
  'image_metadata.tags',
  'image_prompt_library.style_tags',
  'image_submission_requirements.supported_formats',
  'integration_connections.scopes',
  'outreach_messages.cc',
  'provider_registry.auth_modes',
  'report_runs.export_formats',
  'site_profiles.opportunity_ids',
]);

export function encodePgWriteValue(table: string, column: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;
  if (Array.isArray(value) && PG_NATIVE_ARRAY_COLUMNS.has(`${table}.${column}`)) {
    return value;
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function err(message: string, code?: string): PgCompatError {
  return { message, code };
}

/** Guess FK column on parent for nested relation `organizations` → org_id. */
function guessFkColumn(parentTable: string, relation: string): string {
  if (relation === 'organizations' || relation === 'organization') {
    if (parentTable === 'org_members' || parentTable === 'org_invites') return 'org_id';
    return 'org_id';
  }
  if (relation.endsWith('ies')) {
    return `${relation.slice(0, -3)}y_id`;
  }
  if (relation.endsWith('s')) {
    return `${relation.slice(0, -1)}_id`;
  }
  return `${relation}_id`;
}

/**
 * Parse select strings like:
 * - `*`
 * - `id, name, status`
 * - `role, organizations(*)`
 * - `org_id, organizations(id, name, slug)`
 * Complex embeds (alias:fk, !inner, nested depth>1) → unsupported message.
 */
function parseSelect(columns: string | undefined, parentTable: string): ParsedSelect {
  if (!columns || columns.trim() === '' || columns.trim() === '*') {
    return { flat: ['*'], nested: [] };
  }

  const raw = columns.trim();
  // Reject deep / inner / aliased-fk patterns we don't support
  if (raw.includes('!inner') || raw.includes('!left') || /:\w+\(/.test(raw)) {
    return {
      flat: [],
      nested: [],
      unsupported: `Unsupported nested select "${raw}". Flatten the query or join in SQL.`,
    };
  }

  const flat: string[] = [];
  const nested: NestedSelect[] = [];
  let i = 0;
  let buf = '';

  const flushFlat = () => {
    const t = buf.trim();
    if (t) flat.push(t);
    buf = '';
  };

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '(') {
      const alias = buf.trim();
      buf = '';
      i++;
      let depth = 1;
      let inner = '';
      while (i < raw.length && depth > 0) {
        const c = raw[i];
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        if (depth > 0) inner += c;
        i++;
      }
      if (!IDENT_RE.test(alias)) {
        return {
          flat: [],
          nested: [],
          unsupported: `Unsupported nested select alias "${alias}".`,
        };
      }
      nested.push({
        alias,
        table: alias,
        columns: inner.trim() || '*',
        fkColumn: guessFkColumn(parentTable, alias),
      });
      // skip trailing comma / whitespace
      while (i < raw.length && (raw[i] === ',' || raw[i] === ' ')) i++;
      continue;
    }
    if (ch === ',') {
      flushFlat();
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flushFlat();

  return { flat: flat.length ? flat : nested.length ? [] : ['*'], nested };
}

function parseOrFilterString(filterString: string, params: unknown[]): string {
  // Split on commas that separate conditions. Values rarely contain commas.
  const parts = filterString.split(',').map((p) => p.trim()).filter(Boolean);
  const clauses: string[] = [];

  for (const part of parts) {
    const m = part.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.+)$/
    );
    if (!m) {
      throw new Error(`Unsupported or() clause: ${part}`);
    }
    const [, col, op, rawVal] = m;
    const qcol = quoteIdent(col!);

    if (op === 'is') {
      if (rawVal === 'null') {
        clauses.push(`${qcol} IS NULL`);
      } else if (rawVal === 'true') {
        clauses.push(`${qcol} IS TRUE`);
      } else if (rawVal === 'false') {
        clauses.push(`${qcol} IS FALSE`);
      } else {
        throw new Error(`Unsupported or() is value: ${rawVal}`);
      }
      continue;
    }

    if (op === 'in') {
      // ("a","b") or (a,b)
      const inner = rawVal!.replace(/^\(/, '').replace(/\)$/, '');
      const vals = inner.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const placeholders: string[] = [];
      for (const v of vals) {
        params.push(v);
        placeholders.push(`$${params.length}`);
      }
      clauses.push(`${qcol} IN (${placeholders.join(', ')})`);
      continue;
    }

    params.push(coerceOrValue(rawVal!));
    const ph = `$${params.length}`;
    switch (op) {
      case 'eq':
        clauses.push(`${qcol} = ${ph}`);
        break;
      case 'neq':
        clauses.push(`${qcol} <> ${ph}`);
        break;
      case 'gt':
        clauses.push(`${qcol} > ${ph}`);
        break;
      case 'gte':
        clauses.push(`${qcol} >= ${ph}`);
        break;
      case 'lt':
        clauses.push(`${qcol} < ${ph}`);
        break;
      case 'lte':
        clauses.push(`${qcol} <= ${ph}`);
        break;
      case 'like':
        clauses.push(`${qcol} LIKE ${ph}`);
        break;
      case 'ilike':
        clauses.push(`${qcol} ILIKE ${ph}`);
        break;
      default:
        throw new Error(`Unsupported or() op: ${op}`);
    }
  }

  if (!clauses.length) return 'TRUE';
  return `(${clauses.join(' OR ')})`;
}

function coerceOrValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  // numeric?
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseInList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // '("deleted","ignored")' or '(a,b)'
    const inner = value.trim().replace(/^\(/, '').replace(/\)$/, '');
    if (!inner) return [];
    return inner.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
  }
  return [value];
}

class QueryBuilder implements PromiseLike<PgCompatResult> {
  private table: string;
  private kind: MutationKind = 'select';
  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitN: number | null = null;
  private selectRaw: string | undefined = '*';
  private prefer: 'many' | 'single' | 'maybe' = 'many';
  private insertRows: Record<string, unknown>[] | null = null;
  private updatePatch: Record<string, unknown> | null = null;
  private upsertOpts: { onConflict?: string } | null = null;
  private headOnly = false;
  private wantCount = false;
  /** True once .select() is chained (needed for insert/update RETURNING semantics). */
  private selectCalled = false;

  constructor(table: string) {
    if (!IDENT_RE.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    this.table = table;
  }

  select(columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    this.selectRaw = columns ?? '*';
    this.selectCalled = true;
    if (opts?.head) this.headOnly = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }

  insert(row: Record<string, unknown> | Record<string, unknown>[]): this {
    this.kind = 'insert';
    this.insertRows = Array.isArray(row) ? row : [row];
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.kind = 'update';
    this.updatePatch = patch;
    return this;
  }

  delete(): this {
    this.kind = 'delete';
    return this;
  }

  upsert(
    row: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string }
  ): this {
    this.kind = 'upsert';
    this.insertRows = Array.isArray(row) ? row : [row];
    this.upsertOpts = opts ?? {};
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  like(column: string, value: unknown): this {
    this.filters.push({ op: 'like', column, value });
    return this;
  }

  ilike(column: string, value: unknown): this {
    this.filters.push({ op: 'ilike', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ op: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ op: 'in', column, value: values });
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.filters.push({ op: 'is', column, value });
    return this;
  }

  /**
   * Best-effort `.not(column, operator, value)` — supports `is` and `in`.
   * Example: `.not('status', 'in', '("a","b")')` / `.not('lease_holder', 'is', null)`
   */
  not(column: string, operator: string, value: unknown): this {
    if (operator === 'is') {
      this.filters.push({ op: 'not.is', column, value });
      return this;
    }
    if (operator === 'in') {
      this.filters.push({ op: 'not.in', column, value });
      return this;
    }
    throw new Error(`pg-compat: unsupported not() operator "${operator}"`);
  }

  or(filterString: string): this {
    this.filters.push({ op: 'or', sql: filterString });
    return this;
  }

  order(
    column: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean }
  ): this {
    this.orders.push({
      column,
      ascending: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  single(): this {
    this.prefer = 'single';
    return this;
  }

  maybeSingle(): this {
    this.prefer = 'maybe';
    return this;
  }

  then<TResult1 = PgCompatResult, TResult2 = never>(
    onfulfilled?: ((value: PgCompatResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhere(params: unknown[], tableAlias?: string): string {
    const prefix = tableAlias ? `${quoteIdent(tableAlias)}.` : '';
    const parts: string[] = [];

    for (const f of this.filters) {
      if (f.op === 'or' && f.sql) {
        parts.push(parseOrFilterString(f.sql, params));
        continue;
      }
      const col = `${prefix}${quoteIdent(f.column!)}`;

      switch (f.op) {
        case 'eq':
          params.push(f.value);
          parts.push(`${col} = $${params.length}`);
          break;
        case 'neq':
          params.push(f.value);
          parts.push(`${col} <> $${params.length}`);
          break;
        case 'gt':
          params.push(f.value);
          parts.push(`${col} > $${params.length}`);
          break;
        case 'gte':
          params.push(f.value);
          parts.push(`${col} >= $${params.length}`);
          break;
        case 'lt':
          params.push(f.value);
          parts.push(`${col} < $${params.length}`);
          break;
        case 'lte':
          params.push(f.value);
          parts.push(`${col} <= $${params.length}`);
          break;
        case 'in': {
          const vals = parseInList(f.value);
          if (!vals.length) {
            parts.push('FALSE');
            break;
          }
          const phs = vals.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          parts.push(`${col} IN (${phs.join(', ')})`);
          break;
        }
        case 'not.in': {
          const vals = parseInList(f.value);
          if (!vals.length) {
            parts.push('TRUE');
            break;
          }
          const phs = vals.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          parts.push(`${col} NOT IN (${phs.join(', ')})`);
          break;
        }
        case 'like':
          params.push(f.value);
          parts.push(`${col} LIKE $${params.length}`);
          break;
        case 'ilike':
          params.push(f.value);
          parts.push(`${col} ILIKE $${params.length}`);
          break;
        case 'is':
          if (f.value === null) parts.push(`${col} IS NULL`);
          else if (f.value === true) parts.push(`${col} IS TRUE`);
          else if (f.value === false) parts.push(`${col} IS FALSE`);
          else {
            params.push(f.value);
            parts.push(`${col} IS $${params.length}`);
          }
          break;
        case 'not.is':
          if (f.value === null) parts.push(`${col} IS NOT NULL`);
          else if (f.value === true) parts.push(`${col} IS NOT TRUE`);
          else if (f.value === false) parts.push(`${col} IS NOT FALSE`);
          else {
            params.push(f.value);
            parts.push(`${col} IS DISTINCT FROM $${params.length}`);
          }
          break;
        default:
          break;
      }
    }

    if (!parts.length) return '';
    return `WHERE ${parts.join(' AND ')}`;
  }

  private buildOrder(tableAlias?: string): string {
    if (!this.orders.length) return '';
    const prefix = tableAlias ? `${quoteIdent(tableAlias)}.` : '';
    const bits = this.orders.map((o) => {
      let s = `${prefix}${quoteIdent(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`;
      if (o.nullsFirst === true) s += ' NULLS FIRST';
      if (o.nullsFirst === false) s += ' NULLS LAST';
      return s;
    });
    return `ORDER BY ${bits.join(', ')}`;
  }

  private shapeResult(rows: Record<string, unknown>[]): PgCompatResult {
    if (this.prefer === 'single') {
      if (rows.length === 0) {
        return {
          data: null,
          error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116'),
        };
      }
      if (rows.length > 1) {
        return {
          data: null,
          error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116'),
        };
      }
      return { data: rows[0], error: null };
    }
    if (this.prefer === 'maybe') {
      if (rows.length === 0) return { data: null, error: null };
      if (rows.length > 1) {
        return {
          data: null,
          error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116'),
        };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  private async execute(): Promise<PgCompatResult> {
    try {
      switch (this.kind) {
        case 'select':
          return await this.executeSelect();
        case 'insert':
          return await this.executeInsert(false);
        case 'upsert':
          return await this.executeInsert(true);
        case 'update':
          return await this.executeUpdate();
        case 'delete':
          return await this.executeDelete();
        default:
          return { data: null, error: err(`Unknown query kind: ${this.kind}`) };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { data: null, error: err(message) };
    }
  }

  private async executeSelect(): Promise<PgCompatResult> {
    const parsed = parseSelect(this.selectRaw, this.table);
    if (parsed.unsupported) {
      return { data: null, error: err(parsed.unsupported) };
    }

    const params: unknown[] = [];
    const parentAlias = 't';

    let selectSql: string;
    let fromSql: string;

    if (parsed.nested.length === 0) {
      const cols =
        parsed.flat[0] === '*'
          ? '*'
          : parsed.flat.map((c) => quoteIdent(c)).join(', ');
      selectSql = cols;
      fromSql = quoteTable(this.table);
      const where = this.buildWhere(params);
      const order = this.buildOrder();
      const limit = this.limitN != null ? `LIMIT ${Number(this.limitN)}` : '';

      if (this.headOnly && this.wantCount) {
        const countSql = `SELECT count(*)::int AS c FROM ${fromSql} ${where}`;
        const countRes = await pgQuery<{ c: number }>(countSql, params);
        return { data: null, error: null, count: countRes.rows[0]?.c ?? 0 };
      }

      const sql = [`SELECT ${selectSql} FROM ${fromSql}`, where, order, limit]
        .filter(Boolean)
        .join(' ');
      const result = await pgQuery<Record<string, unknown>>(sql, params);
      if (this.wantCount) {
        const shaped = this.shapeResult(result.rows);
        return { ...shaped, count: result.rowCount };
      }
      return this.shapeResult(result.rows);
    }

    // Nested: LEFT JOIN each relation (best-effort FK)
    const selectParts: string[] = [];
    for (const c of parsed.flat) {
      if (c === '*') {
        selectParts.push(`${quoteIdent(parentAlias)}.*`);
      } else {
        selectParts.push(`${quoteIdent(parentAlias)}.${quoteIdent(c)}`);
      }
    }
    // If only nested was requested with no flat cols, still return parent *
    // but listUserOrganizations uses `role, organizations(*)` so flat has role.

    let joinSql = '';
    for (let n = 0; n < parsed.nested.length; n++) {
      const nest = parsed.nested[n]!;
      const alias = `n${n}`;
      if (!IDENT_RE.test(nest.fkColumn)) {
        return {
          data: null,
          error: err(`Invalid FK guess for nested ${nest.alias}: ${nest.fkColumn}`),
        };
      }
      joinSql += ` LEFT JOIN ${quoteTable(nest.table)} AS ${quoteIdent(alias)} ON ${quoteIdent(alias)}.${quoteIdent('id')} = ${quoteIdent(parentAlias)}.${quoteIdent(nest.fkColumn)}`;

      // Nest as JSON object under alias (Supabase shape)
      if (nest.columns === '*') {
        selectParts.push(
          `CASE WHEN ${quoteIdent(alias)}.${quoteIdent('id')} IS NULL THEN NULL ELSE to_jsonb(${quoteIdent(alias)}) END AS ${quoteIdent(nest.alias)}`
        );
      } else {
        const nestCols = nest.columns
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        const jsonBits = nestCols.map((c) => {
          const q = quoteIdent(c);
          return `'${c}', ${quoteIdent(alias)}.${q}`;
        });
        selectParts.push(
          `CASE WHEN ${quoteIdent(alias)}.${quoteIdent('id')} IS NULL THEN NULL ELSE jsonb_build_object(${jsonBits.join(', ')}) END AS ${quoteIdent(nest.alias)}`
        );
      }
    }

    fromSql = `${quoteTable(this.table)} AS ${quoteIdent(parentAlias)}${joinSql}`;
    selectSql = selectParts.join(', ');
    const where = this.buildWhere(params, parentAlias);
    const order = this.buildOrder(parentAlias);
    const limit = this.limitN != null ? `LIMIT ${Number(this.limitN)}` : '';
    const sql = [`SELECT ${selectSql} FROM ${fromSql}`, where, order, limit]
      .filter(Boolean)
      .join(' ');
    const result = await pgQuery<Record<string, unknown>>(sql, params);
    return this.shapeResult(result.rows);
  }

  private returningClause(): string {
    // After insert/update/upsert, select() sets selectRaw; default RETURNING *
    const parsed = parseSelect(this.selectRaw, this.table);
    if (parsed.unsupported || parsed.nested.length) {
      return 'RETURNING *';
    }
    if (parsed.flat[0] === '*') return 'RETURNING *';
    return `RETURNING ${parsed.flat.map((c) => quoteIdent(c)).join(', ')}`;
  }

  private async executeInsert(isUpsert: boolean): Promise<PgCompatResult> {
    const rows = this.insertRows ?? [];
    if (!rows.length) {
      return { data: this.prefer === 'many' ? [] : null, error: null };
    }

    const keys = Object.keys(rows[0]!);
    for (const k of keys) {
      if (!IDENT_RE.test(k)) throw new Error(`Invalid column: ${k}`);
    }

    const params: unknown[] = [];
    const valueGroups: string[] = [];
    for (const row of rows) {
      const phs: string[] = [];
      for (const k of keys) {
        params.push(encodePgWriteValue(this.table, k, row[k] ?? null));
        phs.push(`$${params.length}`);
      }
      valueGroups.push(`(${phs.join(', ')})`);
    }

    const colList = keys.map((k) => quoteIdent(k)).join(', ');
    let sql = `INSERT INTO ${quoteTable(this.table)} (${colList}) VALUES ${valueGroups.join(', ')}`;

    if (isUpsert) {
      const onConflict = this.upsertOpts?.onConflict;
      if (onConflict) {
        const conflictCols = onConflict
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        for (const c of conflictCols) {
          if (!IDENT_RE.test(c)) throw new Error(`Invalid onConflict column: ${c}`);
        }
        const conflictList = conflictCols.map((c) => quoteIdent(c)).join(', ');
        const updateCols = keys.filter((k) => !conflictCols.includes(k));
        if (updateCols.length === 0) {
          sql += ` ON CONFLICT (${conflictList}) DO NOTHING`;
        } else {
          const sets = updateCols
            .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
            .join(', ');
          sql += ` ON CONFLICT (${conflictList}) DO UPDATE SET ${sets}`;
        }
      } else {
        // Best-effort: DO NOTHING on any unique violation via primary key id if present
        if (keys.includes('id')) {
          sql += ` ON CONFLICT (${quoteIdent('id')}) DO UPDATE SET ${keys
            .filter((k) => k !== 'id')
            .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
            .join(', ')}`;
        } else {
          // No onConflict — plain insert (caller should pass onConflict)
          // leave as insert
        }
      }
    }

    const wantsRows = this.selectCalled || this.prefer !== 'many';
    if (wantsRows) {
      sql += ` ${this.returningClause()}`;
    }

    const result = await pgQuery<Record<string, unknown>>(sql, params);
    if (!wantsRows) {
      return { data: null, error: null, count: result.rowCount };
    }
    return this.shapeResult(result.rows);
  }

  private async executeUpdate(): Promise<PgCompatResult> {
    const patch = this.updatePatch ?? {};
    const keys = Object.keys(patch);
    if (!keys.length) {
      return { data: null, error: err('update() requires at least one column') };
    }
    for (const k of keys) {
      if (!IDENT_RE.test(k)) throw new Error(`Invalid column: ${k}`);
    }

    const params: unknown[] = [];
    const sets = keys.map((k) => {
      params.push(encodePgWriteValue(this.table, k, patch[k]));
      return `${quoteIdent(k)} = $${params.length}`;
    });
    const where = this.buildWhere(params);
    if (!where) {
      return { data: null, error: err('Refusing update without WHERE filter') };
    }

    const sql = `UPDATE ${quoteTable(this.table)} SET ${sets.join(', ')} ${where} ${this.returningClause()}`;
    const result = await pgQuery<Record<string, unknown>>(sql, params);
    return this.shapeResult(result.rows);
  }

  private async executeDelete(): Promise<PgCompatResult> {
    const params: unknown[] = [];
    const where = this.buildWhere(params);
    if (!where) {
      return { data: null, error: err('Refusing delete without WHERE filter') };
    }
    // delete().select() is rare; support RETURNING when prefer single/maybe or select chained
    const returning =
      this.prefer !== 'many' || (this.selectRaw && this.selectRaw !== '*')
        ? ` ${this.returningClause()}`
        : '';
    // Always return rows when select was used; for plain delete, return null data like supabase
    const sql = `DELETE FROM ${quoteTable(this.table)} ${where}${returning || ' RETURNING *'}`;
    const result = await pgQuery<Record<string, unknown>>(sql, params);
    if (this.prefer === 'many' && !returning) {
      // supabase delete without select → data null
      return { data: null, error: null, count: result.rowCount };
    }
    return this.shapeResult(result.rows);
  }
}

type RpcThenable = PromiseLike<PgCompatResult> & {
  then: Promise<PgCompatResult>['then'];
};

function rpc(name: string, args?: Record<string, unknown>): RpcThenable {
  const run = async (): Promise<PgCompatResult> => {
    try {
      if (!IDENT_RE.test(name)) {
        return { data: null, error: err(`Invalid rpc name: ${name}`) };
      }
      const entries = Object.entries(args ?? {});
      const params: unknown[] = [];
      const argSql = entries
        .map(([key, val]) => {
          if (!IDENT_RE.test(key)) throw new Error(`Invalid rpc arg: ${key}`);
          params.push(val);
          return `${quoteIdent(key)} := $${params.length}`;
        })
        .join(', ');
      const sql = `SELECT * FROM public.${quoteIdent(name)}(${argSql})`;
      const result = await pgQuery<Record<string, unknown>>(sql, params);
      // supabase rpc often returns scalar/array; return rows or first row array
      return { data: result.rows, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        data: null,
        error: err(
          `rpc(${name}) failed under DATA_MODE=pg: ${message}. Ensure the function exists in public schema.`
        ),
      };
    }
  };

  return {
    then(onfulfilled, onrejected) {
      return run().then(onfulfilled, onrejected);
    },
  };
}

export type PgSupabaseCompat = {
  from: (table: string) => QueryBuilder;
  rpc: (name: string, args?: Record<string, unknown>) => RpcThenable;
  /** Stubs — not supported under pg compat */
  auth: { admin: { getUserById: (..._args: unknown[]) => Promise<PgCompatResult> } };
  storage: { from: (..._args: unknown[]) => never };
};

export function createPgSupabaseCompat(): PgSupabaseCompat {
  return {
    from(table: string) {
      return new QueryBuilder(table);
    },
    rpc,
    auth: {
      admin: {
        async getUserById() {
          return {
            data: null,
            error: err(
              'auth.admin is not supported under DATA_MODE=pg. Use local auth / profiles tables.'
            ),
          };
        },
      },
    },
    storage: {
      from() {
        throw new Error('storage is not supported under DATA_MODE=pg PostgREST-compat.');
      },
    },
  };
}

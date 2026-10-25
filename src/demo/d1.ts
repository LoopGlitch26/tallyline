// A tiny stand-in for Cloudflare D1 on top of sql.js (SQLite compiled to JavaScript),
// so the real Worker code can run inside a browser tab for the live demo.
import type { Database } from 'sql.js';

type Value = string | number | null | Uint8Array;
const clean = (v: unknown): Value => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as Value));

class Statement {
  constructor(
    private db: Database,
    private sql: string,
    private params: Value[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Statement(this.db, this.sql, values.map(clean));
  }

  rows(): Record<string, unknown>[] {
    const st = this.db.prepare(this.sql);
    try {
      if (this.params.length) st.bind(this.params);
      const out: Record<string, unknown>[] = [];
      while (st.step()) out.push(st.getAsObject());
      return out;
    } finally {
      st.free();
    }
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const r = this.rows()[0];
    if (!r) return null;
    return (column ? r[column] : r) as T;
  }

  async all<T = Record<string, unknown>>() {
    return { results: this.rows() as T[], success: true, meta: {} };
  }

  async run() {
    this.rows();
    return { success: true, meta: { changes: this.db.getRowsModified() } };
  }

  async raw() {
    return this.rows().map((r) => Object.values(r));
  }
}

export function makeD1(db: Database) {
  return {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(stmts: Statement[]) {
      // Runs synchronously so two batches can never interleave inside one transaction.
      db.run('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push({ results: s.rows(), success: true, meta: {} });
        db.run('COMMIT');
        return out;
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}

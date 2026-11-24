import bcrypt from "bcryptjs";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "./schema";

type Row = Record<string, any>;

const colMetaMap = new WeakMap<object, { tableName: string; jsKey: string }>();
const tableMetaMap = new Map<string, { table: any; columns: Record<string, any> }>();

for (const exportVal of Object.values(schema)) {
  if (exportVal && typeof exportVal === "object" && Symbol.for("drizzle:IsDrizzleTable") in exportVal) {
    const tableName = getTableName(exportVal as any);
    const cols = getTableColumns(exportVal as any);
    tableMetaMap.set(tableName, { table: exportVal, columns: cols });
    for (const [jsKey, col] of Object.entries(cols)) {
      if (col && typeof col === "object") {
        colMetaMap.set(col, { tableName, jsKey });
      }
    }
  }
}

function isColumn(x: unknown): boolean {
  return !!x && typeof x === "object" && colMetaMap.has(x as object);
}

function isSQL(x: unknown): x is { queryChunks: any[] } {
  return !!x && typeof x === "object" && Array.isArray((x as any).queryChunks);
}

function isStringChunk(x: unknown): x is { value: string[] } {
  return !!x && typeof x === "object" && Array.isArray((x as any).value) && !("queryChunks" in (x as any));
}

function unwrapParam(x: unknown): any {
  if (x && typeof x === "object" && "value" in (x as any) && "encoder" in (x as any)) {
    return (x as any).value;
  }
  return x;
}

function toTimestamp(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const ta = toTimestamp(a);
  const tb = toTimestamp(b);
  if (ta !== null && tb !== null) return ta - tb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  if (/^-?\d+(\.\d+)?$/.test(sa) && /^-?\d+(\.\d+)?$/.test(sb)) {
    return Number(sa) - Number(sb);
  }
  return sa.localeCompare(sb);
}

function readColFromCtx(col: any, ctx: Map<string, Row | null>): any {
  const meta = colMetaMap.get(col);
  if (!meta) return undefined;
  const row = ctx.get(meta.tableName);
  return row ? row[meta.jsKey] : undefined;
}

function evalCondition(node: any, ctx: Map<string, Row | null>): boolean {
  if (!node) return true;
  if (!isSQL(node)) return Boolean(node);

  const chunks = node.queryChunks;
  // Check for top-level AND / OR combinations
  const strParts = chunks.filter(isStringChunk).map((c) => c.value.join(""));
  const joinedStr = strParts.join("|");

  if (joinedStr.includes(" and ")) {
    const subNodes = chunks.filter(isSQL);
    return subNodes.every((sub) => evalCondition(sub, ctx));
  }
  if (joinedStr.includes(" or ")) {
    const subNodes = chunks.filter(isSQL);
    return subNodes.some((sub) => evalCondition(sub, ctx));
  }

  // Unwrap single parenthesized SQL: ['(', SQL, ')']
  const sqlChildren = chunks.filter(isSQL);
  if (sqlChildren.length === 1 && chunks.every((c) => isSQL(c) || isStringChunk(c))) {
    return evalCondition(sqlChildren[0], ctx);
  }

  // Binary or unary operator with columns/values
  const nonEmptyChunks = chunks.filter((c) => !(isStringChunk(c) && c.value.join("") === ""));
  const opChunk = nonEmptyChunks.find((c) => isStringChunk(c) && c.value.join("").trim() !== "");
  const op = opChunk ? opChunk.value.join("").trim().toLowerCase() : "";

  const operands = nonEmptyChunks.filter((c) => !isStringChunk(c));
  const resolveVal = (o: unknown) => (isColumn(o) ? readColFromCtx(o, ctx) : unwrapParam(o));

  if (op === "is null") {
    const v = resolveVal(operands[0]);
    return v === null || v === undefined;
  }
  if (op === "is not null") {
    const v = resolveVal(operands[0]);
    return v !== null && v !== undefined;
  }
  if (operands.length >= 2) {
    const left = resolveVal(operands[0]);
    const right = resolveVal(operands[1]);

    if (op === "=") {
      if (left instanceof Date || right instanceof Date) {
        return toTimestamp(left) === toTimestamp(right);
      }
      return left === right;
    }
    if (op === "!=" || op === "<>") return left !== right;
    if (op === ">=") return compareValues(left, right) >= 0;
    if (op === "<=") return compareValues(left, right) <= 0;
    if (op === ">") return compareValues(left, right) > 0;
    if (op === "<") return compareValues(left, right) < 0;
    if (op === "like") {
      if (left === null || left === undefined) return false;
      const pattern = String(right ?? "");
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${escaped}$`, "i").test(String(left));
    }
  }

  return true;
}

function evalRowExpr(expr: any, ctx: Map<string, Row | null>): any {
  if (isColumn(expr)) return readColFromCtx(expr, ctx);
  if (!isSQL(expr)) return expr;

  const text = expr.queryChunks
    .map((c, idx) => (isStringChunk(c) ? c.value.join("") : `__ARG${idx}__`))
    .join("");

  // Arithmetic subtraction: (colA - colB)
  if (text.includes(" - ")) {
    const cols = expr.queryChunks.filter(isColumn);
    if (cols.length === 2) {
      const a = Number(readColFromCtx(cols[0], ctx) ?? 0);
      const b = Number(readColFromCtx(cols[1], ctx) ?? 0);
      return (a - b).toFixed(2);
    }
  }
  return null;
}

function evalAggregateExpr(expr: any, groupRows: Map<string, Row | null>[]): any {
  if (isColumn(expr)) {
    return groupRows.length ? readColFromCtx(expr, groupRows[0]) : null;
  }
  if (!isSQL(expr)) return expr;

  const text = expr.queryChunks
    .map((c) => {
      if (isStringChunk(c)) return c.value.join("");
      if (isColumn(c)) return `COL(${colMetaMap.get(c)?.jsKey})`;
      return `VAL(${String(unwrapParam(c))})`;
    })
    .join("");

  if (/COUNT\(\*\)/i.test(text)) {
    return groupRows.length;
  }

  // CASE WHEN col = 'x' THEN valCol ELSE 0 END inside SUM
  const caseMatch = text.match(/CASE\s+WHEN\s+COL\((\w+)\)\s*=\s*'([^']+)'\s+THEN\s+COL\((\w+)\)\s+ELSE\s+0\s+END/i);
  if (caseMatch && /SUM\(/i.test(text)) {
    const [, condKey, matchVal, sumKey] = caseMatch;
    const cols = expr.queryChunks.filter(isColumn);
    const condCol = cols[0];
    const sumCol = cols[1];
    let total = 0;
    for (const ctx of groupRows) {
      const cv = condCol ? readColFromCtx(condCol, ctx) : undefined;
      if (String(cv) === matchVal) {
        const sv = sumCol ? readColFromCtx(sumCol, ctx) : ctx.values().next().value?.[sumKey];
        total += Number(sv ?? 0);
      }
    }
    void condKey;
    return String(total);
  }

  if (/SUM\(/i.test(text)) {
    const col = expr.queryChunks.find(isColumn);
    let total = 0;
    for (const ctx of groupRows) {
      const v = col ? readColFromCtx(col, ctx) : 0;
      total += Number(v ?? 0);
    }
    return String(total);
  }

  if (/AVG\(/i.test(text)) {
    const col = expr.queryChunks.find(isColumn);
    if (!groupRows.length) return "0";
    let total = 0;
    let count = 0;
    for (const ctx of groupRows) {
      const v = col ? readColFromCtx(col, ctx) : null;
      if (v !== null && v !== undefined) {
        total += Number(v);
        count++;
      }
    }
    return count ? String(total / count) : "0";
  }

  return groupRows.length ? evalRowExpr(expr, groupRows[0]) : null;
}

function isAggregateProjection(projection: Record<string, any> | undefined): boolean {
  if (!projection) return false;
  return Object.values(projection).some((v) => {
    if (!isSQL(v)) return false;
    const s = v.queryChunks.filter(isStringChunk).map((c) => c.value.join("")).join("");
    return /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(s);
  });
}

class MockStore {
  tables = new Map<string, Row[]>();
  counters = new Map<string, number>();

  constructor() {
    for (const name of tableMetaMap.keys()) {
      this.tables.set(name, []);
      this.counters.set(name, 0);
    }
    this.seedDefaults();
  }

  getRows(tableName: string): Row[] {
    let arr = this.tables.get(tableName);
    if (!arr) {
      arr = [];
      this.tables.set(tableName, arr);
    }
    return arr;
  }

  nextId(tableName: string): number {
    const next = (this.counters.get(tableName) ?? 0) + 1;
    this.counters.set(tableName, next);
    return next;
  }

  insertRow(tableName: string, values: Row): Row {
    const meta = tableMetaMap.get(tableName);
    const now = new Date();
    const row: Row = {};
    if (meta) {
      for (const [jsKey, col] of Object.entries(meta.columns)) {
        if (values[jsKey] !== undefined) {
          row[jsKey] = values[jsKey];
        } else if (col.autoIncrement) {
          row[jsKey] = this.nextId(tableName);
        } else if (col.hasDefault) {
          if (col.default !== undefined && !isSQL(col.default)) {
            row[jsKey] = col.default;
          } else if (col.dataType === "date" || isSQL(col.default)) {
            row[jsKey] = now;
          } else {
            row[jsKey] = null;
          }
        } else {
          row[jsKey] = null;
        }
      }
      if (typeof row.id === "number" && row.id > (this.counters.get(tableName) ?? 0)) {
        this.counters.set(tableName, row.id);
      }
    } else {
      Object.assign(row, values);
    }
    this.getRows(tableName).push(row);
    return row;
  }

  snapshot(): { tables: Map<string, Row[]>; counters: Map<string, number> } {
    const tables = new Map<string, Row[]>();
    for (const [k, v] of this.tables.entries()) {
      tables.set(k, v.map((r) => ({ ...r })));
    }
    return { tables, counters: new Map(this.counters) };
  }

  restore(snap: { tables: Map<string, Row[]>; counters: Map<string, number> }) {
    this.tables = snap.tables;
    this.counters = snap.counters;
  }

  private seedDefaults() {
    const now = new Date();
    // Seed roles
    for (const [name, description] of [
      ["owner", "Workspace owner"],
      ["admin", "Full system access"],
      ["manager", "Business operations and approvals"],
      ["accountant", "Financial records and reports"],
      ["staff", "Limited daily data entry"],
    ]) {
      this.insertRow("roles", { name, description });
    }

    // Seed currencies
    this.insertRow("currencies", { code: "ETB", name: "Ethiopian Birr", symbol: "Br", isBase: true, isActive: true });
    this.insertRow("currencies", { code: "USD", name: "United States Dollar", symbol: "$", isBase: false, isActive: true });

    // Seed default company & demo owner (matches README credentials: admin@coffee.local / ChangeMe123!)
    const company = this.insertRow("companies", { name: "Abyssinia Coffee Trading", status: "active" });
    const passwordHash = bcrypt.hashSync("ChangeMe123!", 10);
    const owner = this.insertRow("users", {
      companyId: company.id,
      fullName: "Abebe Bikila",
      email: "admin@coffee.local",
      passwordHash,
      roleId: 1,
      isActive: true,
      passwordChangedAt: now,
    });

    // Seed sample contacts
    const supplier = this.insertRow("contacts", {
      companyId: company.id,
      name: "Yirgacheffe Cooperative Union",
      phone: "+251 911 234 567",
      email: "supply@yirgacheffe.et",
      address: "Gedeb, Yirgacheffe",
      roles: ["supplier"],
      isActive: true,
    });
    const customer = this.insertRow("contacts", {
      companyId: company.id,
      name: "Addis Roast & Export PLC",
      phone: "+251 912 889 900",
      email: "orders@addisroast.et",
      address: "Bole, Addis Ababa",
      roles: ["customer", "exporter"],
      isActive: true,
    });
    const driver = this.insertRow("contacts", {
      companyId: company.id,
      name: "Dawit Tesfaye",
      phone: "+251 913 445 221",
      roles: ["driver", "employee"],
      isActive: true,
    });

    // Seed sample transactions
    this.insertRow("transactions", {
      companyId: company.id,
      publicId: "tx-demo-1",
      title: "Washed Grade 1 Export Sale",
      kind: "income",
      amount: "485000.00",
      currency: "ETB",
      transactionDate: new Date(Date.now() - 2 * 86400000),
      contactId: customer.id,
      category: "coffee_sale",
      paymentMethod: "bank_transfer",
      createdBy: owner.id,
    });
    this.insertRow("transactions", {
      companyId: company.id,
      publicId: "tx-demo-2",
      title: "Cherry Parchment Purchase - Lot YIRG-04",
      kind: "expense",
      amount: "215000.00",
      currency: "ETB",
      transactionDate: new Date(Date.now() - 4 * 86400000),
      contactId: supplier.id,
      category: "coffee_purchase",
      paymentMethod: "cash",
      createdBy: owner.id,
    });

    // Seed sample invoice
    this.insertRow("invoices", {
      companyId: company.id,
      invoiceNumber: "INV-2026-001",
      partyType: "customer",
      contactId: customer.id,
      issueDate: new Date(Date.now() - 5 * 86400000),
      dueDate: new Date(Date.now() + 10 * 86400000),
      status: "partially_paid",
      currency: "ETB",
      subtotal: "300000.00",
      taxAmount: "45000.00",
      totalAmount: "345000.00",
      amountPaid: "150000.00",
      createdBy: owner.id,
    });

    // Seed sample coffee trade
    this.insertRow("coffee_trades", {
      companyId: company.id,
      lotNumber: "LOT-YIRG-2026-01",
      grade: "Grade 1 Washed",
      weightKg: "4200.000",
      moisturePct: "11.20",
      contactId: supplier.id,
      tradeType: "purchase",
      tradeDate: new Date(Date.now() - 3 * 86400000),
      createdBy: owner.id,
    });

    // Seed sample inventory item
    this.insertRow("inventory_items", {
      companyId: company.id,
      itemName: "Yirgacheffe Grade 1 Parchment",
      warehouseLocation: "Warehouse A - Addis Ababa",
      bagCount: 70,
      totalWeightKg: "4200.000",
      createdBy: owner.id,
    });

    // Seed sample vehicle
    this.insertRow("vehicles", {
      companyId: company.id,
      name: "Isuzu FSR Cargo",
      registrationNumber: "ET-3-48291",
      vehicleType: "Truck",
      driverContactId: driver.id,
      currentMileage: "84210.0",
      status: "active",
    });

    // Seed sample employee
    this.insertRow("employees", {
      companyId: company.id,
      contactId: driver.id,
      fullName: "Dawit Tesfaye",
      phone: "+251 913 445 221",
      jobTitle: "Lead Fleet Driver",
      startDate: new Date("2024-03-01"),
      isActive: true,
      createdBy: owner.id,
    });
  }
}

export const mockStore = new MockStore();

function buildSelectQuery(projection: Record<string, any> | undefined) {
  let baseTable: any = null;
  const joins: Array<{ table: any; on: any }> = [];
  let whereCond: any = null;
  let groupCols: any[] = [];
  let orderItems: any[] = [];
  let limitCount: number | null = null;

  const execute = async (): Promise<any[]> => {
    if (!baseTable) return [];
    const baseName = getTableName(baseTable);
    const baseRows = mockStore.getRows(baseName);

    let contexts: Map<string, Row | null>[] = baseRows.map((row) => {
      const m = new Map<string, Row | null>();
      m.set(baseName, row);
      return m;
    });

    for (const j of joins) {
      const joinName = getTableName(j.table);
      const joinRows = mockStore.getRows(joinName);
      const nextContexts: Map<string, Row | null>[] = [];
      for (const ctx of contexts) {
        let matched = false;
        for (const jr of joinRows) {
          const candidate = new Map(ctx);
          candidate.set(joinName, jr);
          if (evalCondition(j.on, candidate)) {
            nextContexts.push(candidate);
            matched = true;
          }
        }
        if (!matched) {
          const candidate = new Map(ctx);
          candidate.set(joinName, null);
          nextContexts.push(candidate);
        }
      }
      contexts = nextContexts;
    }

    if (whereCond) {
      contexts = contexts.filter((ctx) => evalCondition(whereCond, ctx));
    }

    let results: any[];

    if (groupCols.length > 0 || isAggregateProjection(projection)) {
      const groups = new Map<string, Map<string, Row | null>[]>();
      for (const ctx of contexts) {
        const key = groupCols.map((c) => JSON.stringify(readColFromCtx(c, ctx) ?? null)).join("|");
        const bucket = groups.get(key) ?? [];
        bucket.push(ctx);
        groups.set(key, bucket);
      }
      results = [];
      for (const bucket of groups.values()) {
        const out: Row = {};
        if (projection) {
          for (const [alias, expr] of Object.entries(projection)) {
            out[alias] = evalAggregateExpr(expr, bucket);
          }
        }
        results.push(out);
      }
    } else {
      if (orderItems.length > 0) {
        contexts.sort((a, b) => {
          for (const item of orderItems) {
            let col = item;
            let dir = 1;
            if (isSQL(item)) {
              const s = item.queryChunks.filter(isStringChunk).map((c) => c.value.join("")).join("").toLowerCase();
              if (s.includes("desc")) dir = -1;
              col = item.queryChunks.find(isColumn);
            }
            if (!col) continue;
            const cmp = compareValues(readColFromCtx(col, a), readColFromCtx(col, b));
            if (cmp !== 0) return cmp * dir;
          }
          return 0;
        });
      }

      if (limitCount !== null) {
        contexts = contexts.slice(0, limitCount);
      }

      results = contexts.map((ctx) => {
        if (!projection) {
          return { ...(ctx.get(baseName) ?? {}) };
        }
        const out: Row = {};
        for (const [alias, expr] of Object.entries(projection)) {
          out[alias] = evalRowExpr(expr, ctx);
        }
        return out;
      });
    }

    if (limitCount !== null && results.length > limitCount) {
      results = results.slice(0, limitCount);
    }
    return results;
  };

  const builder: any = {
    from(table: any) {
      baseTable = table;
      return builder;
    },
    leftJoin(table: any, on: any) {
      joins.push({ table, on });
      return builder;
    },
    where(cond: any) {
      whereCond = cond;
      return builder;
    },
    groupBy(...cols: any[]) {
      groupCols = cols;
      return builder;
    },
    orderBy(...items: any[]) {
      orderItems = items;
      return builder;
    },
    limit(n: number) {
      limitCount = n;
      return builder;
    },
    for() {
      return builder;
    },
    then(onFulfilled: any, onRejected: any) {
      return execute().then(onFulfilled, onRejected);
    },
  };

  return builder;
}

export const mockDb: any = {
  select(projection?: Record<string, any>) {
    return buildSelectQuery(projection);
  },
  insert(table: any) {
    const tableName = getTableName(table);
    return {
      values(data: Row | Row[]) {
        const items = Array.isArray(data) ? data : [data];
        let firstId = 0;
        for (const item of items) {
          const inserted = mockStore.insertRow(tableName, item);
          if (!firstId && typeof inserted.id === "number") firstId = inserted.id;
        }
        return Promise.resolve([{ insertId: firstId }]);
      },
    };
  },
  update(table: any) {
    const tableName = getTableName(table);
    return {
      set(payload: Row) {
        let whereCond: any = null;
        const exec = async () => {
          const rows = mockStore.getRows(tableName);
          let affected = 0;
          for (const row of rows) {
            const ctx = new Map<string, Row | null>([[tableName, row]]);
            if (!whereCond || evalCondition(whereCond, ctx)) {
              Object.assign(row, payload);
              affected++;
            }
          }
          return [{ affectedRows: affected }];
        };
        const q: any = {
          where(cond: any) {
            whereCond = cond;
            return q;
          },
          then(onFulfilled: any, onRejected: any) {
            return exec().then(onFulfilled, onRejected);
          },
        };
        return q;
      },
    };
  },
  delete(table: any) {
    const tableName = getTableName(table);
    let whereCond: any = null;
    const exec = async () => {
      const rows = mockStore.getRows(tableName);
      const remaining = rows.filter((row) => {
        if (!whereCond) return false;
        const ctx = new Map<string, Row | null>([[tableName, row]]);
        return !evalCondition(whereCond, ctx);
      });
      const deleted = rows.length - remaining.length;
      mockStore.tables.set(tableName, remaining);
      return [{ affectedRows: deleted }];
    };
    const q: any = {
      where(cond: any) {
        whereCond = cond;
        return q;
      },
      then(onFulfilled: any, onRejected: any) {
        return exec().then(onFulfilled, onRejected);
      },
    };
    return q;
  },
  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const snap = mockStore.snapshot();
    try {
      return await fn(mockDb);
    } catch (err) {
      mockStore.restore(snap);
      throw err;
    }
  },
};

export const mockPool = {
  async query(_sql?: string) {
    return [[{ "1": 1 }], []];
  },
  async end() {
    return undefined;
  },
};

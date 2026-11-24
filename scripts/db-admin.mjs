import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
dotenv.config({ path: path.join(root, ".env") });

const cfg = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  connectTimeout: 15000,
};

const GUARDED = /^coffee_business_manager(_test|_restore_test_\d{8}|_backup_test_\d{8})?$/;
const WRITABLE = /^coffee_business_manager(_test|_restore_test_\d{8}|_backup_test_\d{8})$/;
const PROTECTED = new Set(["coffee_business_manager_restore_test_20261119"]);

function targetDb(name) {
  if (!GUARDED.test(name)) {
    throw new Error(`Refusing to operate on unapproved database name: ${name}`);
  }
  return name;
}

function writableDb(name) {
  targetDb(name);
  if (PROTECTED.has(name)) {
    throw new Error(`Refusing to write to protected database: ${name}`);
  }
  if (!WRITABLE.test(name)) {
    throw new Error(`Refusing to write to non-test database: ${name}`);
  }
  return name;
}

async function conn(database) {
  return mysql.createConnection({ ...cfg, database });
}

async function server() {
  return mysql.createConnection(cfg);
}

function splitStatements(sql) {
  return sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applyFile(dbName, file) {
  const sql = fs.readFileSync(path.resolve(root, file), "utf8");
  const chunks = splitStatements(sql);
  const c = await conn(dbName);
  let applied = 0;
  try {
    for (const chunk of chunks) {
      await c.query(chunk);
      applied += 1;
    }
  } finally {
    await c.end();
  }
  return applied;
}

async function restoreFile(dbName, file) {
  const sql = fs.readFileSync(path.resolve(root, file), "utf8");
  const c = await mysql.createConnection({ ...cfg, database: dbName, multipleStatements: true });
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

const CHECKS = `
SELECT 'column' AS kind, TABLE_NAME AS t, COLUMN_NAME AS c, ORDINAL_POSITION AS o,
       COLUMN_TYPE AS d, IS_NULLABLE AS n, COLUMN_DEFAULT AS def, EXTRA AS e
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ?
  AND TABLE_NAME NOT IN ('__drizzle_migrations')
ORDER BY TABLE_NAME, ORDINAL_POSITION
`;

const INDEXES = `
SELECT TABLE_NAME AS t, INDEX_NAME AS i, NON_UNIQUE AS nu, SEQ_IN_INDEX AS s, COLUMN_NAME AS c,
       SUB_PART AS sp, INDEX_TYPE AS it
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = ?
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`;

const CONSTRAINTS = `
SELECT TABLE_NAME AS t, CONSTRAINT_NAME AS c, CONSTRAINT_TYPE AS ct
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = ?
ORDER BY TABLE_NAME, CONSTRAINT_NAME
`;

const FK_DETAILS = `
SELECT k.TABLE_NAME AS t, k.CONSTRAINT_NAME AS c, k.COLUMN_NAME AS col,
       k.REFERENCED_TABLE_NAME AS rt, k.REFERENCED_COLUMN_NAME AS rc,
       r.DELETE_RULE AS dr, r.UPDATE_RULE AS ur
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
 AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION
`;

async function schema(dbName) {
  const c = await conn(dbName);
  try {
    const [columns] = await c.query(CHECKS, [dbName]);
    const [indexes] = await c.query(INDEXES, [dbName]);
    const [constraints] = await c.query(CONSTRAINTS, [dbName]);
    const [fks] = await c.query(FK_DETAILS, [dbName]);
    const [tables] = await c.query(
      `SELECT TABLE_NAME AS t, TABLE_TYPE AS ty, ENGINE AS e, TABLE_COLLATION AS col
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME NOT IN ('__drizzle_migrations')
       ORDER BY TABLE_NAME`,
      [dbName]
    );
    return { tables, columns, indexes, constraints, fks };
  } finally {
    await c.end();
  }
}

function keySets(s) {
  return {
    tables: new Set(s.tables.map((r) => JSON.stringify(r))),
    columns: new Set(s.columns.map((r) => JSON.stringify(r))),
    indexes: new Set(s.indexes.map((r) => JSON.stringify(r))),
    constraints: new Set(s.constraints.map((r) => JSON.stringify(r))),
    fks: new Set(s.fks.map((r) => JSON.stringify(r))),
  };
}

async function compare(a, b) {
  const [sa, sb] = await Promise.all([schema(a), schema(b)]);
  const ka = keySets(sa);
  const kb = keySets(sb);
  const diffs = {};
  for (const part of ["tables", "columns", "indexes", "constraints", "fks"]) {
    const onlyA = [...ka[part]].filter((x) => !kb[part].has(x));
    const onlyB = [...kb[part]].filter((x) => !ka[part].has(x));
    diffs[part] = { onlyA, onlyB };
  }
  return diffs;
}

async function counts(dbName) {
  const c = await conn(dbName);
  try {
    const [rows] = await c.query(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT IN ('__drizzle_migrations')
       ORDER BY TABLE_NAME`,
      [dbName]
    );
    const out = [];
    let total = 0;
    for (const { t } of rows) {
      const [r] = await c.query(
        `SELECT COUNT(*) AS n FROM \`${dbName.replace(/`/g, "``")}\`.\`${t.replace(/`/g, "``")}\``
      );
      out.push([t, Number(r[0].n)]);
      total += Number(r[0].n);
    }
    return { out, total };
  } finally {
    await c.end();
  }
}

async function checksums(dbName) {
  const c = await conn(dbName);
  try {
    const [rows] = await c.query(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT IN ('__drizzle_migrations')
       ORDER BY TABLE_NAME`,
      [dbName]
    );
    const out = [];
    for (const { t } of rows) {
      const [r] = await c.query(
        `CHECKSUM TABLE \`${dbName.replace(/`/g, "``")}\`.\`${t.replace(/`/g, "``")}\``
      );
      out.push([t, String(r[0].Checksum)]);
    }
    return out;
  } finally {
    await c.end();
  }
}

function printDiffs(diffs) {
  let any = false;
  for (const [part, { onlyA, onlyB }] of Object.entries(diffs)) {
    if (onlyA.length || onlyB.length) {
      any = true;
      console.log(`  ${part}: only-in-first=${onlyA.length} only-in-second=${onlyB.length}`);
      for (const x of onlyA.slice(0, 10)) console.log(`    - ${x}`);
      for (const x of onlyB.slice(0, 10)) console.log(`    + ${x}`);
    }
  }
  if (!any) console.log("  no structural differences");
  return any;
}

async function stats(dbName) {
  const c = await conn(dbName);
  try {
    const one = async (sql, params = []) => {
      const [r] = await c.query(sql, params);
      return Object.values(r[0] ?? {})[0];
    };
    const tables = Number(await one(
      "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> '__drizzle_migrations'",
      [dbName]
    ));
    const companyCols = Number(await one(
      "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'company_id'",
      [dbName]
    ));
    const companyNotNull = Number(await one(
      "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'company_id' AND IS_NULLABLE = 'NO'",
      [dbName]
    ));
    const fks = Number(await one(
      "SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?",
      [dbName]
    ));
    const checks = Number(await one(
      "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_TYPE = 'CHECK'",
      [dbName]
    ));
    let companies = 0;
    try {
      companies = Number(await one(
        `SELECT COUNT(*) FROM \`${dbName}\`.\`companies\``
      ));
    } catch {}
    const [tenantTables] = await c.query(
      "SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'company_id' ORDER BY TABLE_NAME",
      [dbName]
    );
    let orphans = 0;
    for (const { t } of tenantTables) {
      const n = Number(await one(
        `SELECT COUNT(*) FROM \`${dbName}\`.\`${t.replace(/`/g, "``")}\` x
         WHERE x.company_id NOT IN (SELECT id FROM \`${dbName}\`.\`companies\`)`
      ));
      orphans += n;
    }
    return { tables, companyCols, companyNotNull, fks, checks, companies, orphans };
  } finally {
    await c.end();
  }
}

async function idsum(dbName) {
  const c = await conn(dbName);
  const tables = ["users", "roles", "contacts", "transactions", "audit_logs"];
  const out = [];
  try {
    for (const t of tables) {
      const [r] = await c.query(
        `SELECT COUNT(*) AS n, MD5(GROUP_CONCAT(id ORDER BY id)) AS h FROM \`${dbName}\`.\`${t}\``
      );
      out.push([t, Number(r[0].n), r[0].h]);
    }
    const [cur] = await c.query(
      `SELECT COUNT(*) AS n, MD5(GROUP_CONCAT(code ORDER BY code)) AS h FROM \`${dbName}\`.\`currencies\``
    );
    out.push(["currencies", Number(cur[0].n), cur[0].h]);
    const [tx] = await c.query(
      `SELECT COALESCE(SUM(amount),0) AS s, COALESCE(SUM(CRC32(kind)),0) AS k FROM \`${dbName}\`.\`transactions\``
    );
    out.push(["transactions_amount_sum", tx[0].s, tx[0].k]);
  } finally {
    await c.end();
  }
  return out;
}

async function spotcheck(dbName) {
  const c = await conn(dbName);
  const results = [];
  const one = async (sql, params = []) => {
    const [r] = await c.query(sql, params);
    return Object.values(r[0] ?? {})[0];
  };
  const add = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const defaults = Number(await one(
      "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'company_id' AND COLUMN_DEFAULT IS NOT NULL",
      [dbName]
    ));
    add("company_id_has_no_default", defaults === 0, `columns_with_default=${defaults}`);

    for (const [table, column] of [
      ["employees", "contact_id"],
      ["processing_batches", "machine_id"],
      ["processing_batches", "input_product_id"],
    ]) {
      const n = Number(await one(
        "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND IS_NULLABLE = 'YES'",
        [dbName, table, column]
      ));
      add(`${table}.${column}_nullable`, n === 1, `matches=${n}`);
    }

    const fullName = Number(await one(
      "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'full_name' AND IS_NULLABLE = 'NO'",
      [dbName]
    ));
    add("employees.full_name_not_null", fullName === 1, `matches=${fullName}`);

    const indexCols = async (table, index) => {
      const [rows] = await c.query(
        "SELECT COLUMN_NAME AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX",
        [dbName, table, index]
      );
      return rows.map((r) => r.c).join(",");
    };
    const expect = [
      ["processing_batches", "processing_batches_company_batch_code_unique", "company_id,batch_code"],
      ["vehicles", "vehicles_company_registration_unique", "company_id,registration_number"],
      ["invoices", "invoices_company_number_unique", "company_id,invoice_number"],
      ["coffee_trades", "coffee_trades_company_lot_unique", "company_id,lot_number"],
      ["contacts", "contacts_company_id_id_unique", "company_id,id"],
    ];
    for (const [table, index, want] of expect) {
      const got = await indexCols(table, index);
      add(`index_${index}`, got === want, `columns=${got || "(missing)"}`);
    }

    const fkNames = ["coffee_trades_company_contact_fk", "stock_movements_company_item_fk", "vehicle_logs_company_vehicle_fk", "employees_company_contact_fk", "invoices_company_contact_fk", "invoice_payments_company_invoice_fk", "invoice_payments_company_transaction_fk", "vehicles_company_driver_fk"];
    for (const fk of fkNames) {
      const n = Number(await one(
        "SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?",
        [dbName, fk]
      ));
      add(`fk_${fk}`, n === 1, `matches=${n}`);
    }

    const checkNames = ["coffee_trades_values_valid", "stock_movements_values_valid", "vehicle_logs_values_valid", "invoices_amounts_valid", "invoice_payments_amount_positive", "inventory_items_nonnegative", "processing_batches_quantities_valid", "vehicles_mileage_nonnegative"];
    for (const ck of checkNames) {
      const n = Number(await one(
        "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'",
        [dbName, ck]
      ));
      add(`check_${ck}`, n === 1, `matches=${n}`);
    }
  } finally {
    await c.end();
  }
  return results;
}

const [cmd, ...args] = process.argv.slice(2);

try {
  if (cmd === "exists") {
    const name = targetDb(args[0]);
    const c = await server();
    const [rows] = await c.query("SELECT SCHEMA_NAME AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [name]);
    await c.end();
    console.log(`${name}: ${rows.length ? "EXISTS" : "ABSENT"}`);
  } else if (cmd === "create") {
    const name = writableDb(args[0]);
    const c = await server();
    const [rows] = await c.query("SELECT SCHEMA_NAME AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [name]);
    if (rows.length) throw new Error(`${name} already exists; refusing to overwrite`);
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.end();
    console.log(`${name}: CREATED`);
  } else if (cmd === "recreate") {
    const name = writableDb(args[0]);
    const c = await server();
    await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.end();
    console.log(`${name}: RECREATED (dedicated test database only)`);
  } else if (cmd === "apply") {
    const name = writableDb(args[0]);
    const files = args.slice(1);
    for (const f of files) {
      const n = await applyFile(name, f);
      console.log(`${name}: applied ${n} statements from ${f}`);
    }
  } else if (cmd === "restore") {
    const name = writableDb(args[0]);
    await restoreFile(name, args[1]);
    console.log(`${name}: restored from ${args[1]}`);
  } else if (cmd === "apply-live") {
    // Deliberately controlled live migration. Requires an explicit approval
    // token, an exact file whitelist, a non-empty backup, and a clean
    // preflight. Stops on the first failed statement; never repairs.
    const [file, backup] = args;
    const APPROVED = "coffee_business_manager";
    if (process.env.APPROVE_LIVE_MIGRATION !== APPROVED) {
      throw new Error("Refusing live migration: APPROVE_LIVE_MIGRATION is not set to the target database");
    }
    if (file !== "apps/api/drizzle/0001_tenancy_and_modules.sql") {
      throw new Error(`Refusing live migration: unexpected file ${file}`);
    }
    if (!backup || !backup.startsWith("backups/")) {
      throw new Error("Refusing live migration: backup must be a file inside backups/");
    }
    const backupPath = path.resolve(root, backup);
    if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
      throw new Error(`Refusing live migration: backup missing or empty: ${backup}`);
    }
    const pre = await conn(APPROVED);
    try {
      const [[companiesTable]] = await pre.query(
        "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companies'",
        [APPROVED],
      );
      if (Number(companiesTable.n) !== 0) throw new Error("Refusing live migration: companies table already exists");
      const [[companyCols]] = await pre.query(
        "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'company_id'",
        [APPROVED],
      );
      if (Number(companyCols.n) !== 0) throw new Error("Refusing live migration: company_id columns already exist");
      const [[usersCount]] = await pre.query("SELECT COUNT(*) n FROM `users`");
      console.log(`preflight: users=${usersCount.n} companies=absent company_id_columns=0`);
    } finally {
      await pre.end();
    }
    const sql = fs.readFileSync(path.resolve(root, file), "utf8");
    const chunks = splitStatements(sql);
    const live = await mysql.createConnection({ ...cfg, database: APPROVED, multipleStatements: false });
    let applied = 0;
    try {
      for (let i = 0; i < chunks.length; i += 1) {
        try {
          await live.query(chunks[i]);
          applied += 1;
        } catch (error) {
          console.error(`FAILED statement ${i + 1}/${chunks.length}: ${error.code ?? ""} ${error.message}`);
          throw new Error(`Live migration stopped at statement ${i + 1}; backup: ${backup}`);
        }
      }
    } finally {
      await live.end();
    }
    console.log(`LIVE MIGRATION APPLIED: ${applied}/${chunks.length} statements from ${file}`);
  } else if (cmd === "compare") {
    const [a, b] = args;
    targetDb(a);
    targetDb(b);
    const diffs = await compare(a, b);
    console.log(`compare ${a} vs ${b}`);
    printDiffs(diffs);
  } else if (cmd === "counts") {
    const name = targetDb(args[0]);
    const { out, total } = await counts(name);
    for (const [t, n] of out) console.log(`${t}=${n}`);
    console.log(`TOTAL=${total}`);
  } else if (cmd === "checksums") {
    const name = targetDb(args[0]);
    const out = await checksums(name);
    for (const [t, s] of out) console.log(`${t}=${s}`);
  } else if (cmd === "stats") {
    const name = targetDb(args[0]);
    const s = await stats(name);
    console.log(`tables=${s.tables}`);
    console.log(`company_id_columns=${s.companyCols}`);
    console.log(`company_id_not_null=${s.companyNotNull}`);
    console.log(`foreign_keys=${s.fks}`);
    console.log(`check_constraints=${s.checks}`);
    console.log(`companies=${s.companies}`);
    console.log(`orphan_company_rows=${s.orphans}`);
  } else if (cmd === "idsum") {
    const name = targetDb(args[0]);
    const out = await idsum(name);
    for (const [t, n, h] of out) console.log(`${t}=count:${n}|hash:${h}`);
  } else if (cmd === "spotcheck") {
    const name = targetDb(args[0]);
    const results = await spotcheck(name);
    let failed = 0;
    for (const r of results) {
      if (!r.ok) failed += 1;
      console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name} ${r.detail}`);
    }
    console.log(`SUMMARY pass=${results.length - failed} fail=${failed}`);
    if (failed) process.exitCode = 1;
  } else {
    console.log("usage: exists|create|recreate|apply|apply-live|restore|compare|counts|checksums|stats|idsum|spotcheck ...");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
}

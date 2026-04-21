import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { parse } from "csv-parse";

export default class GenerateLendingClubSchema {
    static #INTEGER_RE = /^-?\d+$/;
    static #FLOAT_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    static #PERCENT_RE = /^-?\d+(\.\d+)?\s*%$/;
    static #DATE_MON_YYYY_RE = /^[A-Z][a-z]{2}-\d{4}$/;
    static #TERM_RE = /^\s*\d+\s*months?$/;
    static #EMP_LENGTH_RE = /^(<\s*1\s*year|10\+?\s*years?|\d+\s*years?)$/;
    static #LOAN_ID_RE = /^\d+$/;

    static #TABLE = "accepted_loans";
    static #VIEW = "v_collectible_loans";
    static #DERIVED = "collectible_loans";
    static #INDEXED = Object.freeze(["loan_status", "issue_d", "addr_state", "grade"]);
    static #COLLECTIBLE_STATUSES = Object.freeze([
        "Charged Off",
        "Default",
        "Late (31-120 days)",
        "Late (16-30 days)",
        "In Grace Period",
        "Does not meet the credit policy. Status:Charged Off",
    ]);

    #csvGzPath;
    #schemaPath;
    #operationsPath;

    constructor({ csvGzPath, schemaPath, operationsPath }) {
        if (!csvGzPath) throw new Error("GenerateLendingClubSchema: csvGzPath required");
        if (!schemaPath) throw new Error("GenerateLendingClubSchema: schemaPath required");
        if (!operationsPath) throw new Error("GenerateLendingClubSchema: operationsPath required");
        this.#csvGzPath = csvGzPath;
        this.#schemaPath = schemaPath;
        this.#operationsPath = operationsPath;
    }

    async run() {
        console.log("Profiling CSV...");
        const { columns, types, rowCount, skipped, elapsed } = await this.#profile();
        console.log(`  ${rowCount.toLocaleString()} rows profiled (${skipped} non-loan rows skipped) in ${elapsed}s`);
        this.#logTypeSummary(types);

        await mkdir(path.dirname(this.#schemaPath), { recursive: true });
        await writeFile(this.#schemaPath, this.#buildSchemaSql(columns, types));
        console.log(`\nWrote schema → ${this.#schemaPath}`);

        await mkdir(path.dirname(this.#operationsPath), { recursive: true });
        await writeFile(this.#operationsPath, this.#buildOperationsSql(columns));
        console.log(`Wrote operations → ${this.#operationsPath}`);
    }

    async #profile() {
        const profiles = new Map();
        let columns = null;
        let rowCount = 0;
        let skipped = 0;
        const startedAt = Date.now();

        await pipeline(
            createReadStream(this.#csvGzPath),
            zlib.createGunzip(),
            parse({ columns: true, bom: true }),
            async (source) => {
                for await (const record of source) {
                    if (!columns) {
                        columns = Object.keys(record);
                        for (const c of columns) profiles.set(c, GenerateLendingClubSchema.#freshProfile());
                    }
                    if (!GenerateLendingClubSchema.#LOAN_ID_RE.test(record.id)) { skipped++; continue; }
                    for (const c of columns) GenerateLendingClubSchema.#observe(profiles.get(c), record[c]);
                    rowCount++;
                    if (rowCount % 200_000 === 0) {
                        process.stderr.write(`\r  ${rowCount.toLocaleString()} rows profiled`);
                    }
                }
            },
        );
        process.stderr.write("\n");

        const types = new Map(columns.map((c) => [c, GenerateLendingClubSchema.#decideType(profiles.get(c))]));
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        return { columns, types, rowCount, skipped, elapsed };
    }

    #logTypeSummary(types) {
        const typeCounts = new Map();
        for (const { sqlType, coerce } of types.values()) {
            const label = coerce === sqlType ? sqlType : `${sqlType} (${coerce})`;
            typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
        }
        console.log("\nColumn types:");
        for (const [label, n] of [...typeCounts.entries()].toSorted((a, b) => b[1] - a[1])) {
            console.log(`  ${String(n).padStart(3)}  ${label}`);
        }
    }

    #buildSchemaSql(columns, types) {
        const T = GenerateLendingClubSchema.#TABLE;
        const V = GenerateLendingClubSchema.#VIEW;
        const D = GenerateLendingClubSchema.#DERIVED;

        const colDefs = columns.map((c) => {
            const { sqlType } = types.get(c);
            const pk = c === "id" ? " PRIMARY KEY" : "";
            return `\t"${c}" ${sqlType}${pk}`;
        }).join(",\n");

        const indexes = GenerateLendingClubSchema.#INDEXED
            .map((col) => `CREATE INDEX IF NOT EXISTS idx_${T}_${col} ON ${T} ("${col}");`)
            .join("\n");

        const statusList = GenerateLendingClubSchema.#COLLECTIBLE_STATUSES
            .map((s) => `\t'${s.replace(/'/g, "''")}'`)
            .join(",\n");

        return `-- INIT: ${T}
CREATE TABLE IF NOT EXISTS ${T} (
${colDefs}
) STRICT;

-- INIT: ${T}_indexes
${indexes}

-- INIT: ${V}
CREATE VIEW IF NOT EXISTS ${V} AS
SELECT * FROM ${T}
WHERE loan_status IN (
${statusList}
);

-- INIT: ${D}
CREATE TABLE IF NOT EXISTS ${D} (
${colDefs}
) STRICT;
`;
    }

    #buildOperationsSql(columns) {
        const T = GenerateLendingClubSchema.#TABLE;
        const V = GenerateLendingClubSchema.#VIEW;
        const D = GenerateLendingClubSchema.#DERIVED;

        const colList = columns.map((c) => `"${c}"`).join(", ");
        const paramList = columns.map((c) => `$${c}`).join(", ");

        return `-- PREP: accepted_loans_column_info
SELECT name, type FROM pragma_table_info($table_name);

-- PREP: insert_accepted_loan
INSERT OR IGNORE INTO ${T} (
\t${colList}
) VALUES (
\t${paramList}
);

-- PREP: count_accepted_loans
SELECT COUNT(*) AS n FROM ${T};

-- PREP: count_by_status
SELECT loan_status, COUNT(*) AS n
FROM ${T}
GROUP BY loan_status
ORDER BY n DESC;

-- PREP: count_collectible_loans
SELECT COUNT(*) AS n FROM ${D};

-- EXEC: begin_tx
BEGIN;

-- EXEC: commit_tx
COMMIT;

-- EXEC: populate_collectible_loans
INSERT OR IGNORE INTO ${D} SELECT * FROM ${V};
`;
    }

    static #isNullLike(v) {
        if (v == null) return true;
        const s = String(v).trim();
        if (s === "") return true;
        return s.toLowerCase() === "n/a";
    }

    static #freshProfile() {
        return {
            locked: false, nonEmpty: 0, empty: 0,
            intOk: 0, floatIntegerValued: 0, floatFractional: 0,
            percentOk: 0, dateOk: 0, termOk: 0, empLengthOk: 0, other: 0,
        };
    }

    static #observe(p, raw) {
        if (GenerateLendingClubSchema.#isNullLike(raw)) { p.empty++; return; }
        p.nonEmpty++;
        if (p.locked) { p.other++; return; }
        const v = raw;
        if (GenerateLendingClubSchema.#INTEGER_RE.test(v)) { p.intOk++; return; }
        if (GenerateLendingClubSchema.#FLOAT_RE.test(v)) {
            const n = parseFloat(v);
            if (n === Math.trunc(n)) p.floatIntegerValued++;
            else p.floatFractional++;
            return;
        }
        if (GenerateLendingClubSchema.#PERCENT_RE.test(v)) { p.percentOk++; return; }
        if (GenerateLendingClubSchema.#DATE_MON_YYYY_RE.test(v)) { p.dateOk++; return; }
        if (GenerateLendingClubSchema.#TERM_RE.test(v)) { p.termOk++; return; }
        if (GenerateLendingClubSchema.#EMP_LENGTH_RE.test(v.trim())) { p.empLengthOk++; return; }
        p.other++;
        p.locked = true;
    }

    static #decideType(p) {
        if (p.nonEmpty === 0) return { sqlType: "TEXT", coerce: "TEXT" };
        if (p.other > 0) return { sqlType: "TEXT", coerce: "TEXT" };
        if (p.percentOk === p.nonEmpty) return { sqlType: "REAL", coerce: "PERCENT" };
        if (p.termOk === p.nonEmpty) return { sqlType: "INTEGER", coerce: "TERM" };
        if (p.empLengthOk === p.nonEmpty) return { sqlType: "INTEGER", coerce: "EMP_LENGTH" };
        if (p.dateOk === p.nonEmpty) return { sqlType: "TEXT", coerce: "DATE" };
        const numericTotal = p.intOk + p.floatIntegerValued + p.floatFractional;
        if (numericTotal === p.nonEmpty) {
            if (p.floatFractional === 0) return { sqlType: "INTEGER", coerce: "INTEGER" };
            return { sqlType: "REAL", coerce: "REAL" };
        }
        return { sqlType: "TEXT", coerce: "TEXT" };
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..");

    const generator = new GenerateLendingClubSchema({
        csvGzPath: path.join(repoRoot, "data/raw/lending-club/accepted_2007_to_2018Q4.csv.gz"),
        schemaPath: path.join(repoRoot, "migrations/001_initial_schema.sql"),
        operationsPath: path.join(repoRoot, "src/lendingclub/accepted_loans.sql"),
    });

    await generator.run();
}

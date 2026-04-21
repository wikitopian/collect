import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { parse } from "csv-parse";

export default class LendingClubLoader {
    static #INTEGER_RE = /^-?\d+$/;
    static #FLOAT_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    static #PERCENT_RE = /^-?\d+(\.\d+)?\s*%$/;
    static #DATE_MON_YYYY_RE = /^[A-Z][a-z]{2}-\d{4}$/;
    static #TERM_RE = /^\s*\d+\s*months?$/;
    static #EMP_LENGTH_RE = /^(<\s*1\s*year|10\+?\s*years?|\d+\s*years?)$/;
    static #LOAN_ID_RE = /^\d+$/;

    static #MONTHS = Object.freeze({
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    });

    static #COERCERS = Object.freeze({
        TEXT: (v) => v,
        INTEGER: (v) => parseInt(v, 10),
        REAL: (v) => parseFloat(v),
        PERCENT: (v) => parseFloat(v.replace(/\s*%$/, "")),
        DATE: (v) => {
            const [mon, year] = v.split("-");
            return `${year}-${LendingClubLoader.#MONTHS[mon]}-01`;
        },
        TERM: (v) => parseInt(v.match(/\d+/)[0], 10),
        EMP_LENGTH: (v) => {
            const t = v.trim();
            if (t.startsWith("<")) return 0;
            return parseInt(t.match(/\d+/)[0], 10);
        },
    });

    static #INDEXED_COLUMNS = Object.freeze(["loan_status", "issue_d", "addr_state", "grade"]);
    static #TABLE_NAME = "accepted_loans";

    #csvGzPath;
    #dbPath;

    constructor({ csvGzPath, dbPath }) {
        if (!csvGzPath) throw new Error("LendingClubLoader: csvGzPath required");
        if (!dbPath) throw new Error("LendingClubLoader: dbPath required");
        this.#csvGzPath = csvGzPath;
        this.#dbPath = dbPath;
    }

    async run() {
        await mkdir(path.dirname(this.#dbPath), { recursive: true });
        await rm(this.#dbPath, { force: true });

        console.log("Pass 1: profiling columns...");
        const pass1 = await this.#profile();
        console.log(`  ${pass1.rowCount.toLocaleString()} rows profiled (${pass1.skipped} non-loan rows skipped) in ${pass1.elapsed}s`);

        const types = this.#decideTypes(pass1.profiles, pass1.columns);
        this.#logTypeSummary(types);

        console.log("\nPass 2: creating STRICT table and loading...");
        const pass2 = await this.#load(pass1.columns, types);
        console.log(`  ${pass2.rowCount.toLocaleString()} rows loaded (${pass2.skipped} non-loan rows skipped) in ${pass2.elapsed}s`);
        console.log(`\nDone → ${this.#dbPath}`);

        return { pass1, pass2, types };
    }

    #streamCsv(consumer) {
        return pipeline(
            createReadStream(this.#csvGzPath),
            zlib.createGunzip(),
            parse({ columns: true, bom: true }),
            consumer,
        );
    }

    async #profile() {
        const profiles = new Map();
        let columns = null;
        let rowCount = 0;
        let skipped = 0;
        const startedAt = Date.now();

        await this.#streamCsv(async (source) => {
            for await (const record of source) {
                if (!columns) {
                    columns = Object.keys(record);
                    for (const c of columns) profiles.set(c, LendingClubLoader.#freshProfile());
                }
                if (!LendingClubLoader.#LOAN_ID_RE.test(record.id)) { skipped++; continue; }
                for (const c of columns) LendingClubLoader.#observe(profiles.get(c), record[c]);
                rowCount++;
                if (rowCount % 200_000 === 0) {
                    process.stderr.write(`\r  ${rowCount.toLocaleString()} rows profiled`);
                }
            }
        });
        process.stderr.write("\n");

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        return { profiles, columns, rowCount, skipped, elapsed };
    }

    #decideTypes(profiles, columns) {
        return new Map(columns.map((c) => [c, LendingClubLoader.#decideType(profiles.get(c))]));
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

    async #load(columns, types) {
        const db = new DatabaseSync(this.#dbPath);
        this.#configureDb(db);
        this.#createTable(db, columns, types);
        const result = await this.#insertRows(db, columns, types);
        this.#createIndexes(db);
        db.close();
        return result;
    }

    #configureDb(db) {
        db.exec("PRAGMA journal_mode = MEMORY");
        db.exec("PRAGMA synchronous = OFF");
        db.exec("PRAGMA temp_store = MEMORY");
    }

    #createTable(db, columns, types) {
        const colDefs = columns.map((c) => `"${c}" ${types.get(c).sqlType}`).join(", ");
        db.exec(`CREATE TABLE ${LendingClubLoader.#TABLE_NAME} (${colDefs}) STRICT`);
    }

    async #insertRows(db, columns, types) {
        const placeholders = columns.map(() => "?").join(", ");
        const colList = columns.map((c) => `"${c}"`).join(", ");
        const stmt = db.prepare(`INSERT INTO ${LendingClubLoader.#TABLE_NAME} (${colList}) VALUES (${placeholders})`);

        let rowCount = 0;
        let skipped = 0;
        const startedAt = Date.now();
        db.exec("BEGIN");
        await this.#streamCsv(async (source) => {
            for await (const record of source) {
                if (!LendingClubLoader.#LOAN_ID_RE.test(record.id)) { skipped++; continue; }
                const values = columns.map((c) => {
                    const v = record[c];
                    if (LendingClubLoader.#isNullLike(v)) return null;
                    return LendingClubLoader.#COERCERS[types.get(c).coerce](v);
                });
                stmt.run(...values);
                rowCount++;
                if (rowCount % 50_000 === 0) {
                    process.stderr.write(`\r  ${rowCount.toLocaleString()} rows loaded`);
                }
            }
        });
        db.exec("COMMIT");
        process.stderr.write("\n");

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        return { rowCount, skipped, elapsed };
    }

    #createIndexes(db) {
        for (const col of LendingClubLoader.#INDEXED_COLUMNS) {
            db.exec(`CREATE INDEX "idx_${LendingClubLoader.#TABLE_NAME}_${col}" ON ${LendingClubLoader.#TABLE_NAME}("${col}")`);
        }
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
        if (LendingClubLoader.#isNullLike(raw)) { p.empty++; return; }
        p.nonEmpty++;
        if (p.locked) { p.other++; return; }
        const v = raw;
        if (LendingClubLoader.#INTEGER_RE.test(v)) { p.intOk++; return; }
        if (LendingClubLoader.#FLOAT_RE.test(v)) {
            const n = parseFloat(v);
            if (n === Math.trunc(n)) p.floatIntegerValued++;
            else p.floatFractional++;
            return;
        }
        if (LendingClubLoader.#PERCENT_RE.test(v)) { p.percentOk++; return; }
        if (LendingClubLoader.#DATE_MON_YYYY_RE.test(v)) { p.dateOk++; return; }
        if (LendingClubLoader.#TERM_RE.test(v)) { p.termOk++; return; }
        if (LendingClubLoader.#EMP_LENGTH_RE.test(v.trim())) { p.empLengthOk++; return; }
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
    const repoRoot = path.resolve(here, "../..");

    const loader = new LendingClubLoader({
        csvGzPath: path.join(repoRoot, "data/raw/lending-club/accepted_2007_to_2018Q4.csv.gz"),
        dbPath: path.join(repoRoot, "data/lending-club.db"),
    });

    await loader.run();
}

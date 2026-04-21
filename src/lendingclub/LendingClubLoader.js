import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import SqlRite from "@possumtech/sqlrite";
import { parse } from "csv-parse";

export default class LendingClubLoader {
    static #DATE_MON_YYYY_RE = /^[A-Z][a-z]{2}-\d{4}$/;
    static #LOAN_ID_RE = /^\d+$/;
    static #MONTHS = Object.freeze({
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    });
    static #BATCH = 1000;

    #csvGzPath;
    #dbPath;
    #sqlDirs;

    constructor({ csvGzPath, dbPath, sqlDirs }) {
        if (!csvGzPath) throw new Error("LendingClubLoader: csvGzPath required");
        if (!dbPath) throw new Error("LendingClubLoader: dbPath required");
        if (!sqlDirs) throw new Error("LendingClubLoader: sqlDirs required");
        this.#csvGzPath = csvGzPath;
        this.#dbPath = dbPath;
        this.#sqlDirs = sqlDirs;
    }

    async run() {
        const db = await SqlRite.open({
            path: this.#dbPath,
            dir: this.#sqlDirs,
        });

        try {
            const columnTypes = await this.#resolveColumnTypes(db);

            console.log("Loading accepted_loans...");
            const { inserted, skipped, elapsed } = await this.#load(db, columnTypes);
            console.log(`  ${inserted.toLocaleString()} rows attempted (${skipped} non-loan rows skipped) in ${elapsed}s`);

            console.log("\nPopulating collectible_loans from v_collectible_loans...");
            const populateStart = Date.now();
            await db.populate_collectible_loans({});
            console.log(`  done in ${((Date.now() - populateStart) / 1000).toFixed(1)}s`);

            const { n: accepted } = await db.count_accepted_loans.get({});
            const { n: collectible } = await db.count_collectible_loans.get({});
            console.log(`\naccepted_loans:    ${accepted.toLocaleString()}`);
            console.log(`collectible_loans: ${collectible.toLocaleString()}`);
            console.log(`\nDone → ${this.#dbPath}`);
        } finally {
            await db.close();
        }
    }

    async #resolveColumnTypes(db) {
        const rows = await db.accepted_loans_column_info.all({ table_name: "accepted_loans" });
        return new Map(rows.map((r) => [r.name, r.type]));
    }

    async #load(db, columnTypes) {
        let inserted = 0;
        let skipped = 0;
        const startedAt = Date.now();

        await db.begin_tx({});
        await pipeline(
            createReadStream(this.#csvGzPath),
            zlib.createGunzip(),
            parse({ columns: true, bom: true }),
            async (source) => {
                let pending = [];
                for await (const record of source) {
                    if (!LendingClubLoader.#LOAN_ID_RE.test(record.id)) { skipped++; continue; }
                    const row = {};
                    for (const [col, sqlType] of columnTypes) {
                        row[col] = LendingClubLoader.#coerce(record[col], sqlType);
                    }
                    pending.push(db.insert_accepted_loan.run(row));
                    inserted++;
                    if (pending.length >= LendingClubLoader.#BATCH) {
                        await Promise.all(pending);
                        pending = [];
                    }
                    if (inserted % 50_000 === 0) {
                        process.stderr.write(`\r  ${inserted.toLocaleString()} rows attempted`);
                    }
                }
                if (pending.length > 0) await Promise.all(pending);
            },
        );
        await db.commit_tx({});
        process.stderr.write("\n");

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        return { inserted, skipped, elapsed };
    }

    static #coerce(v, sqlType) {
        if (LendingClubLoader.#isNullLike(v)) return null;
        if (typeof v !== "string") return v;
        const s = v.trim();

        if (sqlType === "TEXT") {
            if (LendingClubLoader.#DATE_MON_YYYY_RE.test(s)) return LendingClubLoader.#parseMonYyyy(s);
            return s;
        }
        if (sqlType === "INTEGER") {
            if (s.startsWith("<")) return 0;
            return parseInt(s, 10);
        }
        if (sqlType === "REAL") {
            return parseFloat(s);
        }
        return s;
    }

    static #isNullLike(v) {
        if (v == null) return true;
        const s = String(v).trim();
        if (s === "") return true;
        return s.toLowerCase() === "n/a";
    }

    static #parseMonYyyy(v) {
        const [mon, year] = v.split("-");
        return `${year}-${LendingClubLoader.#MONTHS[mon]}-01`;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../..");

    const loader = new LendingClubLoader({
        csvGzPath: path.join(repoRoot, "data/raw/lending-club/accepted_2007_to_2018Q4.csv.gz"),
        dbPath: path.join(repoRoot, "data/lending-club.db"),
        sqlDirs: [
            path.join(repoRoot, "migrations"),
            path.join(repoRoot, "src"),
        ],
    });

    await loader.run();
}

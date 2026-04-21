import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { parse } from "csv-parse";

export default class LendingClubInspector {
    #csvGzPath;

    constructor({ csvGzPath }) {
        if (!csvGzPath) throw new Error("LendingClubInspector: csvGzPath required");
        this.#csvGzPath = csvGzPath;
    }

    async run({ onProgress } = {}) {
        const statusCounts = new Map();
        let rowCount = 0;
        let columns = null;

        await pipeline(
            createReadStream(this.#csvGzPath),
            zlib.createGunzip(),
            parse({ columns: true, bom: true }),
            async (source) => {
                for await (const record of source) {
                    if (!columns) columns = Object.keys(record);
                    rowCount++;
                    const status = record.loan_status || "(blank)";
                    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
                    onProgress?.({ rowCount });
                }
            },
        );

        return { columns, rowCount, statusCounts };
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../..");
    const csvGzPath = path.join(repoRoot, "data/raw/lending-club/accepted_2007_to_2018Q4.csv.gz");

    const inspector = new LendingClubInspector({ csvGzPath });
    const startedAt = Date.now();

    const { columns, rowCount, statusCounts } = await inspector.run({
        onProgress: ({ rowCount: n }) => {
            if (n % 500_000 === 0) process.stderr.write(`\r${n.toLocaleString()} rows...`);
        },
    });
    process.stderr.write("\n");

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`columns: ${columns.length}`);
    console.log();
    console.log("first 30 columns:");
    columns.slice(0, 30).forEach((c, i) => console.log(`  ${String(i).padStart(3)}  ${c}`));
    console.log(`  ... and ${columns.length - 30} more`);
    console.log();
    console.log(`total rows: ${rowCount.toLocaleString()}  (${elapsed}s)`);
    console.log();
    console.log("loan_status breakdown:");
    const sorted = [...statusCounts.entries()].toSorted((a, b) => b[1] - a[1]);
    for (const [status, count] of sorted) {
        const pct = (100 * count / rowCount).toFixed(1).padStart(5);
        console.log(`  ${count.toLocaleString().padStart(12)} (${pct}%)  ${status}`);
    }
}

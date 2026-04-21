import { createWriteStream } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import yauzl from "yauzl";

export default class LendingClubExtractor {
    #zipPath;
    #destination;

    constructor({ zipPath, destination }) {
        if (!zipPath) throw new Error("LendingClubExtractor: zipPath required");
        if (!destination) throw new Error("LendingClubExtractor: destination required");
        this.#zipPath = zipPath;
        this.#destination = destination;
    }

    async run() {
        await mkdir(this.#destination, { recursive: true });
        const zip = await this.#openZip();
        try {
            const entries = await this.#collectEntries(zip);
            const results = [];
            for (const entry of entries) {
                results.push(await this.#extractEntry(zip, entry));
            }
            return results;
        } finally {
            zip.close();
        }
    }

    #openZip() {
        return new Promise((resolve, reject) => {
            yauzl.open(this.#zipPath, { lazyEntries: true, autoClose: false }, (err, z) => {
                if (err) reject(err);
                else resolve(z);
            });
        });
    }

    #collectEntries(zip) {
        return new Promise((resolve, reject) => {
            const entries = [];
            zip.on("entry", (e) => { entries.push(e); zip.readEntry(); });
            zip.on("end", () => resolve(entries));
            zip.on("error", reject);
            zip.readEntry();
        });
    }

    async #extractEntry(zip, entry) {
        if (!entry.fileName.endsWith(".csv.gz")) {
            return { fileName: entry.fileName, action: "skip" };
        }
        const outName = path.basename(entry.fileName);
        const outPath = path.join(this.#destination, outName);
        const exists = await access(outPath).then(() => true, () => false);
        if (exists) return { fileName: entry.fileName, outPath, action: "have" };
        const src = await new Promise((resolve, reject) => {
            zip.openReadStream(entry, (err, s) => (err ? reject(err) : resolve(s)));
        });
        await pipeline(src, createWriteStream(outPath));
        return { fileName: entry.fileName, outPath, action: "wrote", bytes: entry.uncompressedSize };
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../..");
    const destination = path.join(repoRoot, "data/raw/lending-club");
    const zipPath = path.join(destination, "lending-club.zip");

    const extractor = new LendingClubExtractor({ zipPath, destination });
    const results = await extractor.run();

    for (const r of results) {
        if (r.action === "skip") console.log(`skip   ${r.fileName}`);
        else if (r.action === "have") console.log(`have   ${path.basename(r.outPath)}`);
        else console.log(`wrote  ${path.basename(r.outPath)}  (${r.bytes.toLocaleString()} bytes)`);
    }
}

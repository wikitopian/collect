import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import KaggleClient from "../kaggle/KaggleClient.js";

export default class LendingClubDownloader {
    static #OWNER = "wordsforthewise";
    static #SLUG = "lending-club";

    #client;
    #destination;

    constructor({ client, destination }) {
        if (!client) throw new Error("LendingClubDownloader: client required");
        if (!destination) throw new Error("LendingClubDownloader: destination required");
        this.#client = client;
        this.#destination = destination;
    }

    async run({ onProgress } = {}) {
        return this.#client.downloadDataset({
            owner: LendingClubDownloader.#OWNER,
            slug: LendingClubDownloader.#SLUG,
            destination: this.#destination,
            onProgress,
        });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../..");
    process.loadEnvFile(path.join(repoRoot, ".env"));

    const downloader = new LendingClubDownloader({
        client: KaggleClient.fromEnv(),
        destination: path.join(repoRoot, "data/raw/lending-club"),
    });

    const startedAt = Date.now();
    let lastReport = 0;

    const { filePath, bytes } = await downloader.run({
        onProgress: ({ received, total }) => {
            const now = Date.now();
            if (now - lastReport < 500) return;
            lastReport = now;
            const mb = (received / 1e6).toFixed(1);
            const totalMb = total ? (total / 1e6).toFixed(1) : "?";
            const pct = total ? ((received / total) * 100).toFixed(1) : "?";
            process.stderr.write(`\r${mb}/${totalMb} MB (${pct}%)    `);
        },
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stderr.write("\n");
    console.log(`Downloaded ${bytes.toLocaleString()} bytes → ${filePath} in ${elapsed}s`);
}

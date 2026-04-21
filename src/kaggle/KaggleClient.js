import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export default class KaggleClient {
    #authHeader;

    constructor({ username, key, bearerToken }) {
        if (bearerToken) {
            this.#authHeader = `Bearer ${bearerToken}`;
            return;
        }
        if (!username) throw new Error("KaggleClient: username required");
        if (!key) throw new Error("KaggleClient: key required");
        const basic = Buffer.from(`${username}:${key}`).toString("base64");
        this.#authHeader = `Basic ${basic}`;
    }

    static fromEnv() {
        const raw = process.env.KAGGLE_API_TOKEN?.trim();
        if (!raw) throw new Error("KAGGLE_API_TOKEN missing from env");
        if (raw.startsWith("KGAT_")) {
            return new KaggleClient({ bearerToken: raw });
        }
        if (raw.startsWith("{")) {
            const { username, key } = JSON.parse(raw);
            return new KaggleClient({ username, key });
        }
        if (raw.includes(":")) {
            const [username, key] = raw.split(":", 2);
            return new KaggleClient({ username, key });
        }
        return new KaggleClient({
            username: process.env.KAGGLE_USERNAME,
            key: raw,
        });
    }

    async downloadDataset({ owner, slug, destination, onProgress }) {
        await mkdir(destination, { recursive: true });
        const url = `https://www.kaggle.com/api/v1/datasets/download/${owner}/${slug}`;

        const response = await fetch(url, {
            headers: { Authorization: this.#authHeader },
            redirect: "follow",
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Kaggle ${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
        }

        const disposition = response.headers.get("content-disposition") ?? "";
        const match = /filename="?([^";]+)"?/.exec(disposition);
        const filename = match?.[1] ?? `${slug}.zip`;
        const filePath = path.join(destination, filename);

        const total = Number(response.headers.get("content-length")) || 0;
        let received = 0;
        const progress = new Transform({
            transform(chunk, _enc, cb) {
                received += chunk.length;
                onProgress?.({ received, total });
                cb(null, chunk);
            },
        });

        await pipeline(
            Readable.fromWeb(response.body),
            progress,
            createWriteStream(filePath),
        );

        return { filePath, bytes: received };
    }
}

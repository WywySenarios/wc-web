import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { STATE_DIR } from "@/lib/config";
import { isValidRunId } from "@/lib/session";
import { parseLine, type HarnessEvent, type RunMeta } from "@/lib/types";

function runDir(id: string): string {
  if (!isValidRunId(id)) throw new Error(`invalid run id: ${id}`);
  return join(STATE_DIR, id);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

export async function writeMeta(meta: RunMeta): Promise<void> {
  const dir = runDir(meta.id);
  await ensureDir(dir);
  const target = join(dir, "meta.json");
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, target);
}

export async function readMeta(id: string): Promise<RunMeta | null> {
  try {
    return JSON.parse(
      await readFile(join(runDir(id), "meta.json"), "utf8"),
    ) as RunMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listRuns(): Promise<RunMeta[]> {
  await ensureDir(STATE_DIR);
  const entries = await readdir(STATE_DIR, { withFileTypes: true });
  const runs: RunMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidRunId(entry.name)) continue;
    const meta = await readMeta(entry.name);
    if (meta) runs.push(meta);
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendEvent(
  id: string,
  event: HarnessEvent,
): Promise<void> {
  const dir = runDir(id);
  await ensureDir(dir);
  await appendFile(
    join(dir, "transcript.jsonl"),
    `${JSON.stringify(event)}\n`,
    { mode: 0o600 },
  );
}

export async function readEvents(id: string): Promise<HarnessEvent[]> {
  try {
    const data = await readFile(join(runDir(id), "transcript.jsonl"), "utf8");
    return data.split("\n").flatMap((line) => {
      const event = parseLine(line);
      return event ? [event] : [];
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

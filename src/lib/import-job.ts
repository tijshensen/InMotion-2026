import { formatServerImportError } from "./import-error";

export const GROK_IMPORT_TIMEOUT_MS = 300_000;

type JobStatus = "running" | "ok" | "error";

export type ImportJob = {
  id: string;
  userId: string;
  status: JobStatus;
  error?: string;
  result?: unknown;
  startedAt: number;
};

const jobs = new Map<string, ImportJob>();
const TTL_MS = 30 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.startedAt > TTL_MS) jobs.delete(id);
  }
}

export function startImportJob<T>(userId: string, run: () => Promise<T>): string {
  sweep();
  const id = crypto.randomUUID();
  jobs.set(id, { id, userId, status: "running", startedAt: Date.now() });
  void run()
    .then((result) => {
      const cur = jobs.get(id);
      if (cur) jobs.set(id, { ...cur, status: "ok", result });
    })
    .catch((e) => {
      const cur = jobs.get(id);
      if (cur) {
        jobs.set(id, {
          ...cur,
          status: "error",
          error: formatServerImportError(e),
        });
      }
    });
  return id;
}

export function getImportJob(id: string, userId: string): ImportJob | null {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}

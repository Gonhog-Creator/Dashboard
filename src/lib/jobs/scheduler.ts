import cron from "node-cron";
import { prisma, ensureWal } from "@/lib/db";

export type JobHandler = () => Promise<string>;

interface JobDef {
  key: string;
  name: string;
  defaultSchedule: string;
  handler: JobHandler;
}

const registry = new Map<string, JobDef>();
const tasks = new Map<string, ReturnType<typeof cron.schedule>>();
let started = false;

export function registerJob(def: JobDef) {
  registry.set(def.key, def);
}

export async function runJob(key: string): Promise<{ ok: boolean; message: string }> {
  const def = registry.get(key);
  if (!def) return { ok: false, message: `unknown job ${key}` };

  await ensureWal();
  const job = await prisma.job.upsert({
    where: { key },
    update: {},
    create: { key, name: def.name, schedule: def.defaultSchedule },
  });

  const run = await prisma.jobRun.create({
    data: { jobId: job.id, status: "running" },
  });

  try {
    const message = await def.handler();
    await prisma.$transaction([
      prisma.jobRun.update({
        where: { id: run.id },
        data: { status: "ok", message, finishedAt: new Date() },
      }),
      prisma.job.update({
        where: { id: job.id },
        data: { lastRunAt: new Date(), lastStatus: "ok", lastMessage: message },
      }),
    ]);
    return { ok: true, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.$transaction([
      prisma.jobRun.update({
        where: { id: run.id },
        data: { status: "error", message, finishedAt: new Date() },
      }),
      prisma.job.update({
        where: { id: job.id },
        data: { lastRunAt: new Date(), lastStatus: "error", lastMessage: message },
      }),
    ]);
    return { ok: false, message };
  }
}

export async function startScheduler() {
  if (started) return;
  started = true;
  await ensureWal();

  for (const def of registry.values()) {
    const job = await prisma.job.upsert({
      where: { key: def.key },
      update: {},
      create: { key: def.key, name: def.name, schedule: def.defaultSchedule },
    });
    if (!job.enabled) continue;
    if (!cron.validate(job.schedule)) {
      console.error(`[jobs] invalid cron for ${def.key}: ${job.schedule}`);
      continue;
    }
    const t = cron.schedule(job.schedule, () => {
      runJob(def.key).then((r) =>
        console.log(`[jobs] ${def.key}: ${r.ok ? "ok" : "error"} — ${r.message}`)
      );
    });
    tasks.set(def.key, t);
    console.log(`[jobs] scheduled ${def.key} (${job.schedule})`);
  }
}

export function listRegisteredJobs() {
  return [...registry.values()].map((d) => ({
    key: d.key,
    name: d.name,
    defaultSchedule: d.defaultSchedule,
  }));
}

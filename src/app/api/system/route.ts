import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

async function cpuPercent(): Promise<number> {
  const a = cpuTimes();
  await new Promise((r) => setTimeout(r, 400));
  const b = cpuTimes();
  const dTotal = b.total - a.total;
  const dIdle = b.idle - a.idle;
  return dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 100) : 0;
}

interface GpuInfo {
  name: string;
  util: number;
  temp: number;
  memUsed: number;
  memTotal: number;
}

async function gpuInfo(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execFileP("nvidia-smi", [
      "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
      "--format=csv,noheader,nounits",
    ]);
    const [name, util, temp, memUsed, memTotal] = stdout
      .trim()
      .split(",")
      .map((s) => s.trim());
    return {
      name,
      util: parseInt(util, 10) || 0,
      temp: parseInt(temp, 10) || 0,
      memUsed: parseInt(memUsed, 10) || 0,
      memTotal: parseInt(memTotal, 10) || 0,
    };
  } catch {
    return null;
  }
}

function diskInfo(drive: string) {
  try {
    const s = fs.statfsSync(drive);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { drive, total, free, usedPct: Math.round((1 - free / total) * 100) };
  } catch {
    return null;
  }
}

export async function GET() {
  const [cpu, gpu] = await Promise.all([cpuPercent(), gpuInfo()]);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return Response.json({
    cpu,
    cores: os.cpus().length,
    mem: {
      total: totalMem,
      used: totalMem - freeMem,
      usedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    disks: [diskInfo("C:\\"), diskInfo("F:\\")].filter(Boolean),
    gpu,
    uptimeSec: Math.floor(os.uptime()),
    hostname: os.hostname(),
    fetchedAt: new Date().toISOString(),
  });
}

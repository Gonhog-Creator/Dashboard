import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

export interface SysData {
  cpu: number;
  cores: number;
  mem: { total: number; used: number; usedPct: number };
  disks: { drive: string; total: number; free: number; usedPct: number }[];
  gpu: {
    name: string;
    util: number;
    temp: number;
    memUsed: number;
    memTotal: number;
  } | null;
  uptimeSec: number;
  hostname: string;
  fetchedAt: string;
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

// Rolling sample: each call diffs against the previous one, so requests after
// the first are instant instead of sleeping to measure a delta.
let lastCpu: { idle: number; total: number } | null = null;

async function cpuPercent(): Promise<number> {
  const b = cpuTimes();
  if (!lastCpu) {
    // No baseline yet — take a short sample once.
    await new Promise((r) => setTimeout(r, 150));
    const c = cpuTimes();
    lastCpu = c;
    const dTotal = c.total - b.total;
    const dIdle = c.idle - b.idle;
    return dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 100) : 0;
  }
  const a = lastCpu;
  lastCpu = b;
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

function allDisks() {
  const disks = [];
  for (let i = 65; i <= 90; i++) {
    const d = diskInfo(String.fromCharCode(i) + ":\\");
    if (d) disks.push(d);
  }
  return disks;
}

export async function getSystemInfo(): Promise<SysData> {
  const [cpu, gpu] = await Promise.all([cpuPercent(), gpuInfo()]);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    cpu,
    cores: os.cpus().length,
    mem: {
      total: totalMem,
      used: totalMem - freeMem,
      usedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    disks: allDisks(),
    gpu,
    uptimeSec: Math.floor(os.uptime()),
    hostname: os.hostname(),
    fetchedAt: new Date().toISOString(),
  };
}

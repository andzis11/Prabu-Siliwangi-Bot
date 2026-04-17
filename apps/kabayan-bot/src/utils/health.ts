export interface RuntimeHealthInput {
  aiConfigured: boolean;
  rustEngineOk: boolean;
  schedulerActive: boolean;
  startedAt?: string;
}

export interface RuntimeHealthStatus {
  aiConfigured: boolean;
  rustEngineOk: boolean;
  schedulerActive: boolean;
  memoryMb: number;
  uptimeSeconds: number;
  uptime: string;
  startedAt?: string;
  checkedAt: string;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }

  parts.push(`${minutes}m`);

  return parts.join(" ");
}

export function getRuntimeHealth(
  input: RuntimeHealthInput,
): RuntimeHealthStatus {
  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = Math.round(process.uptime());

  return {
    aiConfigured: input.aiConfigured,
    rustEngineOk: input.rustEngineOk,
    schedulerActive: input.schedulerActive,
    memoryMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    uptimeSeconds,
    uptime: formatUptime(uptimeSeconds),
    startedAt: input.startedAt,
    checkedAt: new Date().toISOString(),
  };
}

export function formatRuntimeHealth(status: RuntimeHealthStatus): string {
  return [
    "🩺 HEALTH CHECK",
    "",
    `• AI Router: ${status.aiConfigured ? "✅ Ready" : "❌ Not Ready"}`,
    `• Rust Engine: ${status.rustEngineOk ? "✅ Reachable" : "⚠️ Placeholder"}`,
    `• Scheduler: ${status.schedulerActive ? "✅ Active" : "❌ Inactive"}`,
    `• Memory: ${status.memoryMb} MB`,
    `• Uptime: ${status.uptime}`,
    `• Started At: ${status.startedAt || "-"}`,
    `• Checked At: ${status.checkedAt}`,
  ].join("\n");
}

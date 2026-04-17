export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerMeta = unknown;

function formatMeta(meta?: LoggerMeta): string {
  if (meta === undefined) {
    return "";
  }

  try {
    return " " + JSON.stringify(meta);
  } catch {
    return " [unserializable-meta]";
  }
}

function write(level: LogLevel, message: string, meta?: LoggerMeta): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${formatMeta(meta)}`;

  switch (level) {
    case "debug":
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export const logger = {
  debug(message: string, meta?: LoggerMeta): void {
    write("debug", message, meta);
  },

  info(message: string, meta?: LoggerMeta): void {
    write("info", message, meta);
  },

  warn(message: string, meta?: LoggerMeta): void {
    write("warn", message, meta);
  },

  error(message: string, meta?: LoggerMeta): void {
    write("error", message, meta);
  },
};

export default logger;

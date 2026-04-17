import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    // Filter out sensitive data
    const safeMetadata = { ...metadata };
    
    // Remove private keys and sensitive wallet info
    const sensitiveKeys = ['secretKey', 'privateKey', 'pk', 'walletSecretKey', 'keypair'];
    sensitiveKeys.forEach(key => {
      if (safeMetadata[key]) {
        safeMetadata[key] = '[REDACTED]';
      }
    });
    
    // Truncate long addresses
    Object.keys(safeMetadata).forEach(key => {
      const value = safeMetadata[key];
      if (typeof value === 'string' && value.length > 50) {
        if (value.match(/^[1-9A-HJ-NP-Za-km-z]{32,}$/)) {
          safeMetadata[key] = `${value.slice(0, 8)}...${value.slice(-4)}`;
        }
      }
    });
    
    msg += ` ${JSON.stringify(safeMetadata)}`;
  }
  
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    colorize(),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: "logs/meteora.log",
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Log unhandled exceptions
logger.exceptions.handle(
  new winston.transports.File({ filename: "logs/meteora-exceptions.log" })
);

// Log unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
});
const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'logs');
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'antis.log');

function append(message) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function logInfo(message) {
  const entry = `[INFO] ${message}`;
  console.log(entry);
  append(entry);
}

function logWarn(message) {
  const entry = `[WARN] ${message}`;
  console.warn(entry);
  append(entry);
}

function logError(message, error) {
  const errorText = error instanceof Error ? `${message} ${error.stack || error.message}` : `${message} ${String(error)}`;
  const entry = `[ERROR] ${errorText}`;
  console.error(entry);
  append(entry);
}

module.exports = {
  append,
  logFile,
  logInfo,
  logWarn,
  logError
};

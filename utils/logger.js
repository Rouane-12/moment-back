const fs = require('fs').promises;
const path = require('path');

const logFile = path.join(__dirname, '../routes/payment-debug.log');

const logToFile = async (message) => {
  const timestamp = new Date().toISOString();
  try {
    await fs.appendFile(logFile, `[${timestamp}] ${message}\n`);
  } catch (err) {
    console.error('Logging error:', err);
  }
};

module.exports = { logToFile };

import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'storage', 'logs');
const paymentLogPath = path.join(logDir, 'payments.log');
const webhookLogPath = path.join(logDir, 'webhooks.log');

const ensureLogDir = () => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

const redactKeys = [
  'authorization',
  'card',
  'cvv',
  'secret',
  'token',
  'signature',
  'hash',
  'key',
  'password',
  'pin',
];

const maskEmail = (email: string) => {
  const [user, domain] = email.split('@');
  if (!domain) {
    return '***';
  }
  const maskedUser = user.length <= 2 ? `${user[0] || ''}*` : `${user.slice(0, 2)}***`;
  return `${maskedUser}@${domain}`;
};

const maskValue = (value: string) => {
  if (value.length <= 4) {
    return '***';
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const maskSensitive = (input: unknown, depth = 0): unknown => {
  if (depth > 6) {
    return '[Truncated]';
  }
  if (Array.isArray(input)) {
    return input.map((item) => maskSensitive(item, depth + 1));
  }
  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>);
    return entries.reduce<Record<string, unknown>>((acc, [key, value]) => {
      const lowered = key.toLowerCase();
      if (redactKeys.some((needle) => lowered.includes(needle))) {
        acc[key] = '[REDACTED]';
      } else if (lowered.includes('email') && typeof value === 'string') {
        acc[key] = maskEmail(value);
      } else if (typeof value === 'string' && lowered.includes('phone')) {
        acc[key] = maskValue(value);
      } else {
        acc[key] = maskSensitive(value, depth + 1);
      }
      return acc;
    }, {});
  }
  return input;
};

const writeLog = async (filePath: string, entry: Record<string, unknown>) => {
  ensureLogDir();
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await fs.promises.appendFile(filePath, `${JSON.stringify(payload)}\n`);
};

export const logPayment = async (message: string, context: Record<string, unknown> = {}) => {
  try {
    await writeLog(paymentLogPath, {
      level: 'info',
      message,
      context: maskSensitive(context),
    });
  } catch (error) {
    console.error('Payment log failure:', error);
  }
};

export const logPaymentError = async (message: string, context: Record<string, unknown> = {}) => {
  try {
    await writeLog(paymentLogPath, {
      level: 'error',
      message,
      context: maskSensitive(context),
    });
  } catch (error) {
    console.error('Payment error log failure:', error);
  }
};

export const logWebhook = async (message: string, context: Record<string, unknown> = {}) => {
  try {
    await writeLog(webhookLogPath, {
      level: 'info',
      message,
      context: maskSensitive(context),
    });
  } catch (error) {
    console.error('Webhook log failure:', error);
  }
};

export const logWebhookError = async (message: string, context: Record<string, unknown> = {}) => {
  try {
    await writeLog(webhookLogPath, {
      level: 'error',
      message,
      context: maskSensitive(context),
    });
  } catch (error) {
    console.error('Webhook error log failure:', error);
  }
};

import nodemailer from 'nodemailer';
import { getEnv } from './env.js';
import { logger } from './logger.js';

const env = getEnv();

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER
    ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
    : undefined,
});

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const subject = 'Tu código de verificación de Cifra';
  const text = [
    'Hola,',
    '',
    `Tu código de verificación es: ${code}`,
    '',
    'Este código expira en 10 minutos. Si no fuiste vos, podés ignorar este mensaje.',
    '',
    '— Cifra',
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<p>Hola,</p>
<p>Tu código de verificación es:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;background:#f4f4f5;padding:16px 24px;border-radius:8px;text-align:center">${code}</p>
<p style="color:#666;font-size:14px">Este código expira en 10 minutos. Si no fuiste vos, podés ignorar este mensaje.</p>
<p style="color:#666;font-size:14px">— Cifra</p>
</body></html>`;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });

  logger.info({ event: 'verification_code_sent' }, 'verification code dispatched');
}

export async function verifySmtp(): Promise<boolean> {
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    logger.warn({ err }, 'smtp verification failed');
    return false;
  }
}

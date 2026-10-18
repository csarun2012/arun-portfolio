import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const aad = Buffer.from('arun-portfolio/private-resume/v1');
export function parseKey(value) {
  if (!/^[a-f0-9]{64}$/i.test(value || '')) throw new Error('Resume encryption key must contain 64 hexadecimal characters.');
  return Buffer.from(value, 'hex');
}
export function validatePdf(pdf) {
  if (!Buffer.isBuffer(pdf) || pdf.length < 8 || pdf.length >= 25 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-' || !pdf.subarray(-2048).includes(Buffer.from('%%EOF'))) {
    throw new Error('Resume must be a complete PDF smaller than 25 MiB.');
  }
}
export function encryptPdf(pdf, key) {
  validatePdf(pdf);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(pdf), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }) + '\n';
}
export function decryptPdf(envelope, key) {
  const data = JSON.parse(envelope);
  if (data.version !== 1) throw new Error('Unsupported encrypted resume version.');
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted resume.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const pdf = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]);
  validatePdf(pdf);
  return pdf;
}

import crypto from 'node:crypto';

export function hashSource(source, reference = '') {
  return crypto.createHash('sha256').update(`${source}\0${reference}`, 'utf8').digest('hex');
}

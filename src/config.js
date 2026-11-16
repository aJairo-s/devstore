const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH === ':memory:'
  ? ':memory:'
  : path.resolve(process.env.DB_PATH || path.join(ROOT, 'devstore.db'));

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const VIDEO_DIR = path.join(UPLOAD_DIR, 'videos');
const QR_DIR = path.join(UPLOAD_DIR, 'qr');
const VIDEO_MAX_MB = Math.max(1, Number(process.env.VIDEO_MAX_MB || 200));

module.exports = { ROOT, DB_PATH, UPLOAD_DIR, VIDEO_DIR, QR_DIR, VIDEO_MAX_MB };

/**
 * Side-effect module: memuat file .env SEBELUM modul lain di-import
 * (decorator seperti @WebSocketGateway membaca process.env saat import).
 * Urutan: backend/.env, lalu ../.env (root project). Nilai yang sudah ada tidak ditimpa.
 */
import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';

const backendRoot = path.resolve(__dirname, '..', '..');
loadDotenv({ path: path.join(backendRoot, '.env'), quiet: true });
loadDotenv({ path: path.join(backendRoot, '..', '.env'), quiet: true });

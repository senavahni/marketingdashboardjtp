/**
 * Side-effect module: memuat file .env di ROOT project (satu .env untuk backend & frontend)
 * SEBELUM modul lain di-import (decorator seperti @WebSocketGateway membaca process.env saat import).
 * Variabel yang sudah ada di environment (mis. dari docker compose) tidak ditimpa.
 */
import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';

// dist/config/load-env.js atau src/config/load-env.ts → naik 3 level ke root project
loadDotenv({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

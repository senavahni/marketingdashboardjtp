# Menjalankan Project dengan Tool Portable (PC Kantor, Tanpa Admin)

Panduan ini untuk kondisi: **tidak bisa install aplikasi** (tanpa hak admin, tanpa Docker/WSL), hanya punya
**Node.js portable** dan **PostgreSQL portable**. Untuk panduan umum lihat [`README.md`](README.md).

---

## 0. Apa saja yang dibutuhkan

| Komponen | Wajib? | Versi | Portable? | Keterangan |
|---|---|---|---|---|
| Node.js | Ya | **24+** | ✅ zip `node-v24.x-win-x64.zip` dari nodejs.org | Sudah punya |
| PostgreSQL | Ya | 14+ | ✅ zip "binaries" dari EnterpriseDB | Sudah punya |
| Redis | Ya (lihat §3) | 6.2+ disarankan | ✅ zip dari GitHub `redis-windows/redis-windows` | Perlu diunduh |
| React | — | — | — | **Tidak perlu di-install terpisah.** React, Vite, dll. adalah paket npm, otomatis terpasang saat `npm install` di folder `frontend/` |
| Git, OpenSSL, Docker | Tidak | — | — | Tidak dibutuhkan untuk mode ini |

Contoh struktur folder yang dipakai di panduan ini (sesuaikan dengan punya kamu):

```
D:\Data.Fahrul\Documents\PortableDev\
├── node\            # isi zip Node.js (ada node.exe, npm.cmd)
├── pgsql\           # isi zip PostgreSQL (ada bin\, lib\, share\)
├── pgdata\          # folder data PostgreSQL (dibuat oleh initdb)
├── redis\           # isi zip Redis for Windows (ada redis-server.exe)
└── projects\marketingdashboardjtp\
```

---

## 1. Siapkan Node.js portable di terminal

Node portable tidak terdaftar di PATH, jadi tambahkan **di setiap terminal baru** (PowerShell):

```powershell
$env:Path = "D:\Data.Fahrul\Documents\PortableDev\node;$env:Path"
node -v      # harus v24.x atau lebih baru
npm -v
```

> **Tip PC kantor**
> - Jika muncul error *"running scripts is disabled on this system"* saat menjalankan `npm`, pakai `npm.cmd` sebagai
>   ganti `npm` (contoh: `npm.cmd install`), atau jalankan sekali `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
>   (tidak butuh admin).
> - Jika `npm install` gagal karena proxy kantor:
>   `npm config set proxy http://proxy.kantor:port` dan `npm config set https-proxy http://proxy.kantor:port`.
> - Jika gagal karena sertifikat SSL kantor (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`), minta file sertifikat root CA
>   kantor ke IT lalu `npm config set cafile "D:\path\ke\ca-kantor.pem"`.

---

## 2. Jalankan PostgreSQL portable

Lewati langkah yang sudah pernah kamu lakukan.

```powershell
$PG = "D:\Data.Fahrul\Documents\PortableDev\pgsql\bin"

# (sekali saja) inisialisasi folder data, user superuser "postgres"
& "$PG\initdb.exe" -D "D:\Data.Fahrul\Documents\PortableDev\pgdata" -U postgres -W -E UTF8 --locale=C

# jalankan server (port 5432, log ke file)
& "$PG\pg_ctl.exe" -D "D:\Data.Fahrul\Documents\PortableDev\pgdata" -l "D:\Data.Fahrul\Documents\PortableDev\pgdata\server.log" -o "-p 5432" start

# cek
& "$PG\psql.exe" -U postgres -h localhost -c "select version();"
```

Menghentikan: `& "$PG\pg_ctl.exe" -D "D:\Data.Fahrul\Documents\PortableDev\pgdata" stop`

Database `marketing_dashboard` **tidak perlu dibuat manual** — dibuat otomatis oleh `npm run db:setup`.

---

## 3. Redis — pakai Redis portable (disarankan)

### Kenapa Redis wajib?

Backend memakai Redis untuk 4 hal:

| Fitur | Jika Redis mati |
|---|---|
| Antrian BullMQ untuk memanggil MCP / AI Agent ([`mcp-queue.service.ts`](backend/src/modules/agent-runs/mcp-queue.service.ts)) | ❌ **Assign task ke agent / mention `@Agent_...` macet** (BullMQ menunggu Redis tanpa batas) |
| Socket.IO adapter / realtime ([`redis-io.adapter.ts`](backend/src/modules/realtime/redis-io.adapter.ts)) | ⚠️ Realtime tidak andal, log penuh error |
| Rate limit ([`rate-limit.guard.ts`](backend/src/common/guards/rate-limit.guard.ts)) | ✅ Dilewati otomatis (fail-open), tapi tiap request jadi lebih lambat |
| Cache keanggotaan workspace & throttle activity | ✅ Dilewati otomatis, jatuh ke database |

Jadi **tanpa Redis aplikasi bisa terbuka dan sebagian besar fitur CRUD jalan**, tetapi fitur AI Agent tidak, dan
`/health` akan selalu `503 degraded`. Cara paling aman: pakai Redis portable di bawah ini.

### Opsi A (disarankan): Redis for Windows — zip, tanpa install, tanpa admin

1. Buka https://github.com/redis-windows/redis-windows/releases
2. Unduh file **`Redis-<versi>-Windows-x64-msys2.zip`** (atau `-cygwin.zip`) — pilih versi 7.x atau lebih baru.
3. Ekstrak ke `D:\Data.Fahrul\Documents\PortableDev\redis\`.
4. Jalankan (biarkan terminal ini terbuka):

   ```powershell
   cd D:\Data.Fahrul\Documents\PortableDev\redis
   .\redis-server.exe --bind 127.0.0.1 --port 6379
   ```

5. Cek dari terminal lain:

   ```powershell
   D:\Data.Fahrul\Documents\PortableDev\redis\redis-cli.exe ping    # balasan: PONG
   ```

> - `--bind 127.0.0.1` membuat Redis hanya bisa diakses dari PC sendiri. Jika muncul pop-up Windows Firewall,
>   boleh klik **Cancel** — akses localhost tetap jalan.
> - Tanpa password ini aman untuk development lokal. Di `.env` kosongkan `REDIS_USERNAME` dan `REDIS_PASSWORD`.
> - Jika file `.exe` diblokir antivirus/kebijakan kantor, coba opsi B atau C, atau minta IT meng-whitelist.

### Opsi B: Redis 5 for Windows (tporadowski) — cadangan

https://github.com/tporadowski/redis/releases → `Redis-x64-5.0.14.1.zip`, ekstrak, jalankan `redis-server.exe`.
Versinya lama (Redis 5): tidak mendukung username/ACL, dan BullMQ versi baru bisa menolak atau memberi peringatan
versi. Pakai hanya jika opsi A tidak bisa dijalankan.

### Opsi C: Microsoft Garnet — alternatif kompatibel-Redis

https://github.com/microsoft/garnet/releases → unduh zip `win-x64`, jalankan `GarnetServer.exe --port 6379 --lua`.
Garnet bicara protokol Redis dan dikembangkan Microsoft (biasanya lebih mudah lolos kebijakan kantor), tetapi
kompatibilitas penuh dengan BullMQ **belum dijamin** — jika antrian agent bermasalah, kembali ke opsi A.

> Memurai (Redis untuk Windows) **tidak** cocok: perlu installer MSI dan hak admin.

### Opsi D: Tanpa Redis sama sekali

Jika semua opsi di atas tidak bisa dipakai, project masih bisa dijalankan dalam mode terbatas:

1. Di `.env` set:
   ```ini
   RATE_LIMIT_ENABLED=false   # hindari jeda tiap request menunggu Redis
   RUN_WORKERS=false          # matikan worker BullMQ
   ```
2. Jalankan seperti biasa (§5). Abaikan log `Redis (...) error: connect ECONNREFUSED`.
3. **Jangan** assign task ke AI Agent atau mention `@Agent_...` — request tersebut akan menggantung.

Untuk benar-benar bebas Redis (agent & realtime tetap jalan dalam satu proses), backend perlu diubah agar punya
mode `REDIS_ENABLED=false` dengan pengganti in-memory (antrian di memori, Socket.IO adapter bawaan, rate limit di
memori). Perubahan ini belum ada di kode saat ini.

---

## 4. Konfigurasi `.env`

Di root project:

```powershell
cd D:\Data.Fahrul\Documents\PortableDev\projects\marketingdashboardjtp
Copy-Item .env.example .env
```

Isi minimal di `.env`:

```ini
NODE_ENV=development

POSTGRES_USER=postgres
POSTGRES_PASSWORD=<password saat initdb>
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=marketing_dashboard

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0

JWT_ACCESS_SECRET=<secret acak>
MCP_SERVER_API_KEY=<secret acak>
MCP_WEBHOOK_SECRET=<secret acak>
MCP_SERVICE_TOKEN=<secret acak>
```

Tidak punya `openssl`? Buat secret acak dengan Node (jalankan 4x, satu untuk tiap secret):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

## 5. Jalankan aplikasi

Butuh 3–4 terminal. Di **setiap** terminal, set PATH Node dulu (§1).

```powershell
# Terminal 1 — Redis (jika pakai opsi A)
cd D:\Data.Fahrul\Documents\PortableDev\redis
.\redis-server.exe --bind 127.0.0.1 --port 6379
```

```powershell
# Terminal 2 — backend (http://localhost:3000)
cd D:\Data.Fahrul\Documents\PortableDev\projects\marketingdashboardjtp\backend
npm install            # sekali / saat dependency berubah (sekaligus prisma generate)
npm run db:setup       # sekali: build → buat database → migrasi → seed data demo
npm run dev
```

```powershell
# Terminal 3 — frontend (http://localhost:5173)
cd D:\Data.Fahrul\Documents\PortableDev\projects\marketingdashboardjtp\frontend
npm install            # sekali (React, Vite, dll. terpasang di sini)
npm run dev
```

PostgreSQL berjalan di background setelah `pg_ctl start` (§2), tidak perlu terminal khusus.

Buka **http://localhost:5173**, login dengan `owner@demo.local` / `Demo12345!` (akun lain lihat
[`README.md` §4](README.md#4-akun-demo-hasil-seed)).

Cek kesehatan: http://localhost:3000/health → `{"status":"ok","checks":{"database":"up","redis":"up"}}`

---

## 6. Start & stop sekali klik

Setelah setup awal (§1–§5) selesai, cukup **double-click** file di root project:

| File | Urutan |
|---|---|
| [`start-all.bat`](start-all.bat) | PostgreSQL → Redis (jendela *Marketing Redis*) → Backend (jendela *Marketing Backend*, menunggu port 3000 siap) → Frontend (jendela *Marketing Frontend*) → membuka browser ke http://localhost:5173 |
| [`stop-all.bat`](stop-all.bat) | Frontend → Backend → Redis (`redis-cli shutdown`) → PostgreSQL (`pg_ctl stop -m fast`) |

- Layanan yang **sudah berjalan dilewati**, jadi `start-all.bat` aman diklik ulang.
- Path diambil relatif dari lokasi project: `PortableDev\node`, `PortableDev\postgres\pgsql`, `PortableDev\pgdata`,
  `PortableDev\redis`. Jika foldermu berbeda, ubah variabel di bagian atas kedua file.
- `stop-all.bat` menutup jendela yang dibuka `start-all.bat`, lalu menghentikan proses apa pun yang masih memakai port
  3000 / 5173 / 6379 (termasuk yang kamu jalankan manual).

---

## 7. Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| `'node' is not recognized` | PATH belum di-set di terminal itu (§1) |
| `running scripts is disabled` | Pakai `npm.cmd`, atau `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm install` timeout / `ECONNRESET` | Proxy kantor — set `npm config set proxy ...` (§1) |
| Error `argon2` / `prisma` saat install | Pastikan Node 24+ 64-bit; hapus `node_modules` lalu `npm install` ulang. Prisma mengunduh engine saat install, jadi butuh akses internet/proxy |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL belum jalan — cek `pgdata\server.log` |
| `password authentication failed` | `POSTGRES_USER`/`POSTGRES_PASSWORD` di `.env` tidak sesuai user saat `initdb` |
| Log `Redis (app) error: connect ECONNREFUSED` | Redis belum jalan (§3) |
| `/health` → `503 degraded`, `redis: down` | Sama, Redis belum jalan |
| Port 5432 / 6379 / 3000 / 5173 sudah dipakai | Ganti `POSTGRES_PORT`, `REDIS_PORT`, `PORT`, `FRONTEND_PORT` di `.env` (dan port saat menjalankan server) |
| Task agent berstatus **Gagal** | Normal jika MCP Server (`MCP_SERVER_URL`) belum ada — lihat [`README.md` §5](README.md#5-cara-pakai-singkat-ala-notion) |

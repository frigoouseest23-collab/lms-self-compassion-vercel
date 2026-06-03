# LMS Self-Compassion — Deploy Vercel + Google Apps Script API

Project ini memindahkan frontend LMS ke Vercel, tetapi database tetap memakai Google Sheet melalui Google Apps Script.

## Struktur alur

Vercel Frontend → Vercel API Proxy `/api/apps-script` → Google Apps Script Web App API → Google Sheet

## File penting

- `index.html` → frontend LMS untuk Vercel.
- `api/apps-script.js` → proxy Vercel yang meneruskan request ke Apps Script.
- `apps-script/Code.gs` → Code.gs Apps Script versi full + API `doPost(e)`.
- `apps-script/Setup.gs` → Setup.gs database.
- `apps-script/API_BRIDGE_ONLY.gs` → potongan kode API saja, jika ingin menambahkan manual ke Code.gs lama.
- `.env.example` → contoh environment variable Vercel.

## Langkah 1 — Update Apps Script

1. Buka project Google Apps Script LMS.
2. Buka file `Code.gs`.
3. Backup dulu kode lama.
4. Ganti isi `Code.gs` dengan isi file:

   `apps-script/Code.gs`

5. Buka file `Setup.gs`.
6. Ganti isi `Setup.gs` dengan isi file:

   `apps-script/Setup.gs`

7. Simpan semua file.
8. Jalankan fungsi:

   `setupDatabase()`

9. Jalankan satu fungsi yang memerlukan authorization, misalnya:

   `testModulesForPage()`

   Jika diminta izin Google, klik authorize.

## Langkah 2 — Deploy Apps Script sebagai API

1. Klik **Deploy**.
2. Pilih **New deployment**.
3. Type: **Web app**.
4. Description: `Vercel API Backend`.
5. Execute as: **Me**.
6. Who has access: **Anyone**.
7. Klik **Deploy**.
8. Copy URL Web App yang bentuknya seperti:

   `https://script.google.com/macros/s/AKfycbxxxxxxx/exec`

URL ini dipakai sebagai `APPS_SCRIPT_API_URL` di Vercel.

## Langkah 3 — Upload project ke GitHub

1. Buat repository baru di GitHub, misalnya:

   `lms-self-compassion-vercel`

2. Upload semua isi folder project ini ke repository tersebut.

Struktur yang harus masuk ke GitHub:

```text
index.html
package.json
vercel.json
api/apps-script.js
apps-script/Code.gs
apps-script/Setup.gs
apps-script/API_BRIDGE_ONLY.gs
.env.example
README_DEPLOY.md
```

Jangan upload file `.env` asli jika nanti dibuat.

## Langkah 4 — Deploy di Vercel lewat GitHub

1. Buka Vercel.
2. Klik **Add New Project**.
3. Import repository GitHub.
4. Pada bagian environment variables, tambahkan:

```text
APPS_SCRIPT_API_URL = https://script.google.com/macros/s/AKfycbxxxxxxx/exec
```

5. Klik **Deploy**.

## Langkah 5 — Test aplikasi Vercel

Setelah deploy selesai:

1. Buka URL Vercel.
2. Login dengan akun siswa.
3. Cek modul.
4. Klik modul berjalan.
5. Klik **Selesai**.
6. Pastikan data masuk ke sheet `USER_PROGRESS`.
7. Refresh halaman Vercel.
8. Pastikan progress tetap terbaca.

## Catatan penting

- Jangan memakai `google.script.run` langsung di Vercel. Di project ini sudah ada polyfill yang mengubah panggilan lama menjadi `fetch('/api/apps-script')`.
- Database tetap Google Sheet.
- Kalau Apps Script URL diganti atau redeploy baru, update `APPS_SCRIPT_API_URL` di Vercel lalu redeploy.
- Untuk keamanan awal penelitian, Apps Script Web App harus **Execute as: Me** dan **Who has access: Anyone** agar proxy Vercel bisa memanggilnya.
- Jika login gagal di Vercel tetapi jalan di Apps Script, cek Environment Variable `APPS_SCRIPT_API_URL`.

# Koperasi Jadi

Bot WhatsApp koperasi menggunakan:

- Node.js
- Baileys
- Google Sheets
- Gemini Vision

## 1. Instalasi

Masuk ke folder project:

cd D:\koperasi-jadi

Install dependency:

npm install

## 2. File .env

Copy:

.env.example

menjadi:

.env

Kemudian isi:

GEMINI_API_KEY=API_KEY_GEMINI_ANDA

Jangan membagikan API key kepada orang lain.

## 3. Google Service Account

Letakkan file kredensial Google di:

credentials/google-service-account.json

Spreadsheet harus dibagikan kepada email service account sebagai Editor.

## 4. Struktur Google Sheets

### ANGGOTA

USER ID | NAMA | NO WA | ALAMAT | TGL DAFTAR | KELOMPOK ID | HARI TAGIHAN | STATUS

Contoh:

AGT001 | Khoirul | 628123456789 | ... | ... | KLP001 | SENIN | AKTIF

### PINJAMAN

PINJAMAN ID | USER ID | TGL PINJAMAN | POKOK | TENOR | BUNGA | TOTAL TAGIHAN | STATUS

### ANGSURAN

ANGSURAN ID | PINJAMAN ID | USER ID | MINGGU | JATUH TEMPO | TAGIHAN | DIBAYAR | SISA | STATUS

### PEMBAYARAN

PAYMENT ID | USER ID | PINJAMAN ID | MINGGU | NOMINAL | TANGGAL | METODE | STATUS | KETERANGAN

### KELOMPOK_HARI

KELOMPOK ID | HARI | JAM BROADCAST | STATUS | KETERANGAN

## 5. Menjalankan Bot

Jalankan:

npm start

QR WhatsApp akan muncul di terminal.

Scan menggunakan WhatsApp.

Session login akan tersimpan di:

auth/baileys/

## 6. Alur Bot

WhatsApp
↓
Baileys
↓
Login
↓
Cek nomor WhatsApp
↓
Google Sheets - ANGGOTA
↓
Anggota aktif
↓
Kirim foto bukti transfer
↓
Download gambar
↓
Gemini Vision
↓
Baca detail bukti
↓
Google Sheets - PINJAMAN
↓
Google Sheets - ANGSURAN
↓
Ambil tagihan berikutnya
↓
Bandingkan nominal

## 7. Data yang Dibaca Gemini

Gemini hanya membaca informasi yang terlihat pada gambar:

- Nominal
- Tanggal
- Jam
- Nama pengirim
- Nama penerima
- Bank
- Rekening pengirim
- Rekening penerima
- Nomor referensi

Gemini tidak menentukan:

- Pinjaman anggota
- Minggu angsuran
- Besarnya tagihan
- Status pembayaran

Semua data tersebut berasal dari Google Sheets.

## 8. Status Versi Saat Ini

Versi awal ini:

- Sudah menggunakan WhatsApp
- Sudah mengecek nomor anggota
- Sudah mengecek status anggota
- Sudah membaca gambar
- Sudah menggunakan Gemini Vision
- Sudah mengambil pinjaman aktif
- Sudah mengambil angsuran berikutnya
- Sudah membandingkan nominal dengan tagihan

Belum:

- Mengubah data PEMBAYARAN otomatis
- Mengubah ANGSURAN otomatis
- Verifikasi transaksi ke API bank
- Broadcast tagihan
- Dashboard admin

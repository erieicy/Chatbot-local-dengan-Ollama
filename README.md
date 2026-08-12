# 🤖 Chatbot AI Lokal (Ollama + FastAPI Studio)

![Python](https://img.shields.io/badge/Python-3.9%2B-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=for-the-badge&logo=fastapi)
![Ollama](https://img.shields.io/badge/Ollama-Local_AI-black?style=for-the-badge&logo=ollama)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

Aplikasi Web Chatbot AI berbasis lokal yang cepat, interaktif, dan modern. Berjalan **100% di komputer lokal Anda** menggunakan **Ollama** dan **FastAPI**. Tidak memerlukan API Key, tanpa biaya token, dan menjamin **privasi data penuh**.

---

## ✨ Fitur Unggulan

- ⚡ **Real-Time Token Streaming**: Menggunakan *Server-Sent Events* (SSE) untuk menampilkan jawaban AI huruf per huruf seperti ChatGPT.
- 🎨 **Antarmuka Premium Dark Studio**: Desain UI modern dengan sentuhan *glassmorphism*, responsif di desktop maupun perangkat seluler.
- 📝 **Full Markdown & Syntax Highlighting**: Jawaban AI mendukung format teks tebal, tabel, daftar, serta balok kode dengan *syntax highlighting* otomatis dan tombol **Salin Kode**.
- 🔄 **Multi-Model Support**: Deteksi otomatis dan pilihan model Ollama yang terinstall di perangkat lokal (seperti `llama3.2:1b`, `gemma2`, `mistral`, dll).
- ⚙️ **Custom System Prompt**: Sesuaikan persona AI langsung dari antarmuka web (contoh: Pakar Coding, Guru, Penerjemah).
- ⏹️ **Stop & Regenerate**: Kemampuan untuk menghentikan respon yang sedang berjalan atau meminta AI membuat ulang jawaban.
- 🔒 **100% Privasi & Offline**: Bebas dari pelacakan dan dapat bekerja sepenuhnya tanpa koneksi internet.

---

## 📁 Struktur Proyek

```text
Chatbot local dengan Ollama/
├── chat.py         # Backend API (FastAPI, Ollama integration & Streaming)
├── index.html      # Antarmuka Web Utama (UI Components & Layout)
├── style.css       # Styling UI (Dark Theme, Animations & Responsive Design)
├── script.js       # Logika Frontend (SSE Streaming, Markdown & Interaktivitas)
└── README.md       # Dokumentasi Lengkap Proyek
```

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Prasyarat Sistem
- **Python 3.9+** terinstall di komputer.
- **Ollama** terinstall. Download melalui [Ollama Official Download](https://ollama.com/download).

### 2. Persiapan Ollama & Download Model
Buka terminal / Command Prompt (CMD), lalu jalankan perintah berikut:

```bash
# Jalankan service Ollama (jika belum berjalan otomatis)
ollama serve

# Unduh model AI lokal (Contoh: Llama 3.2 1B yang ringan & cepat)
ollama run llama3.2:1b
```

> **Tips:** Anda juga bisa mengunduh model lain sesuai spesifikasi hardware komputer Anda:
> - `ollama run llama3.2:3b`
> - `ollama run gemma:2b`
> - `ollama run qwen2.5:1.5b`

### 3. Instalasi Dependency Python
Buka terminal di folder proyek ini dan jalankan perintah:

```bash
pip install fastapi uvicorn ollama pydantic
```

### 4. Menjalankan Server Backend FastAPI
Jalankan perintah berikut di terminal proyek:

```bash
uvicorn chat:app --reload
```

Server backend akan aktif di: `http://127.0.0.1:8000`

### 5. Membuka Aplikasi Web
Buka browser favorit Anda (Chrome, Edge, Firefox) dan akses:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🔌 Dokumentasi REST API

Backend FastAPI menyediakan beberapa endpoint publik:

| HTTP Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/` | Menyajikan antarmuka utama `index.html` |
| `GET` | `/api/health` | Mengecek status koneksi Ollama dan ketersediaan model |
| `GET` | `/api/models` | Mengambil daftar seluruh model AI yang terinstall di Ollama |
| `POST` | `/api/chat` | Mengirim pesan ke AI (Respon sekaligus / JSON standar) |
| `POST` | `/api/chat/stream` | Mengirim pesan ke AI dengan respon streaming real-time (SSE) |

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>1. Mengapa muncul error "Gagal terhubung ke Ollama"?</b></summary>
Pastikan aplikasi <code>ollama</code> sudah berjalan di sistem Anda. Anda bisa mengetik perintah <code>ollama serve</code> di terminal atau memastikan ikon Ollama aktif di taskbar.
</details>

<details>
<summary><b>2. Bagaimana cara menambahkan model baru?</b></summary>
Jalankan perintah <code>ollama run nama_model</code> di terminal (contoh: <code>ollama run mistral</code>). Setelah selesai, refresh halaman web dan pilih model baru dari dropdown di sidebar.
</details>

<details>
<summary><b>3. Apakah aplikasi ini membutuhkan internet?</b></summary>
Tidak. Setelah model diunduh oleh Ollama dan halaman web dimuat, seluruh proses inferensi AI berjalan 100% secara offline di prosesor/VRAM komputer Anda.
</details>

---

## 📜 Lisensi
Proyek ini dibuat untuk keperluan pembelajaran dan penggunaan pribadi secara gratis di bawah lisensi MIT.
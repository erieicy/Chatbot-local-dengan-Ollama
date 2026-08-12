from typing import List, Optional
import json
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import ollama

app = FastAPI(
    title="Ollama Local AI Chatbot Studio",
    description="Backend API untuk Chatbot AI Lokal yang cepat, pintar, dan mendukung kode C++",
    version="1.2.0"
)

# Mengizinkan akses CORS dari browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_MODEL = 'llama3.2:1b'

SYSTEM_PROMPT_CONCISE = (
    "Kamu adalah asisten AI lokal yang cerdas, efisien, dan serba bisa. "
    "SELALU berikan jawaban yang SINGKAT, PADAT, dan LANGSUNG KE INTI PERTANYAAN.\n\n"
    "ATURAN UTAMA PEMROGRAMAN & KODE:\n"
    "1. Jika user meminta kode (C++, Python, Java, JS, dll), KAMU WAJIB MENAMPILKAN BALOK KODE MARKDOWN (contoh: ```cpp ... ```).\n"
    "2. Untuk C++, SELALU sertakan #include <iostream>, int main(), std::cout, dan return 0;\n"
    "3. Jangan pernah mengosongkan kode atau hanya memberikan teks tanpa contoh kodenya. Berikan kode sederhana yang langsung bisa di-run."
)

class MessageItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = DEFAULT_MODEL
    history: List[MessageItem] = []
    system_prompt: Optional[str] = None
    response_mode: Optional[str] = "concise" # "concise", "bullet", "code", "detailed"
    temperature: Optional[float] = 0.5
    max_tokens: Optional[int] = 4096

def build_system_prompt(req: ChatRequest) -> str:
    if req.system_prompt and req.system_prompt.strip():
        base = req.system_prompt.strip()
    else:
        base = SYSTEM_PROMPT_CONCISE

    msg_lower = req.message.lower()
    is_coding_request = any(k in msg_lower for k in ['cpp', 'c++', 'c ', 'code', 'kode', 'script', 'python', 'java', 'bikin', 'buatkan', 'fungsi', 'program'])

    if req.response_mode == "code" or is_coding_request:
        return base + " [Instruksi Khusus: Tampilkan langsung balok kode ```cpp / ```python / dll yang lengkap, sederhana, dan dapat dijalankan!]"
    elif req.response_mode == "concise":
        return base + " [Instruksi Khusus: Jawab secara singkat 2-4 kalimat atau berikan kode ringkas jika diminta.]"
    elif req.response_mode == "bullet":
        return base + " [Instruksi Khusus: Format jawaban HANYA berupa daftar poin-poin (bullet points) yang ringkas.]"
    elif req.response_mode == "detailed":
        return base + " [Instruksi Khusus: Berikan penjelasan yang terstruktur dan rinci.]"
    return base

def estimate_required_tokens(req: ChatRequest) -> int:
    """
    Estimasi jumlah token yang dibutuhkan SEBELUM eksekusi,
    sehingga AI tidak berhenti di tengah jalan karena token habis.
    Analisa dilakukan berdasarkan: tipe request, panjang pesan, dan mode respons.
    """
    msg_lower = req.message.lower()
    user_max = req.max_tokens or 4096

    # --- Kata kunci penanda kebutuhan token tinggi ---
    code_keywords = [
        'cpp', 'c++', 'python', 'java', 'javascript', 'js', 'typescript', 'ts',
        'golang', 'rust', 'kotlin', 'swift', 'php', 'ruby', 'code', 'kode',
        'script', 'buatkan', 'bikin', 'buat', 'program', 'fungsi', 'function',
        'class', 'method', 'implementasi', 'implement', 'algoritma', 'algorithm',
        'sort', 'search', 'linked list', 'binary tree', 'database', 'query',
        'api', 'web', 'html', 'css', 'fetch', 'loop', 'rekursi', 'recursion'
    ]
    long_keywords = [
        'jelaskan', 'explain', 'rinci', 'detail', 'lengkap', 'complete', 'full',
        'tutorial', 'step by step', 'langkah demi langkah', 'cara', 'bagaimana',
        'perbedaan', 'bandingkan', 'compare', 'dokumentasi', 'semua', 'seluruh',
        'komprehensif', 'mendalam', 'in depth'
    ]
    complex_keywords = [
        'proyek', 'project', 'aplikasi', 'application', 'app', 'sistem', 'system',
        'framework', 'arsitektur', 'architecture', 'desain', 'design pattern',
        'seluruh fitur', 'semua fitur', 'full stack', 'end to end'
    ]

    is_code    = any(k in msg_lower for k in code_keywords)
    is_long    = any(k in msg_lower for k in long_keywords)
    is_complex = any(k in msg_lower for k in complex_keywords)
    msg_words  = len(req.message.split())

    # --- Tabel estimasi token berdasarkan kompleksitas ---
    if is_complex or (is_code and is_long):
        # Proyek besar / kode + penjelasan panjang
        estimated = 8192
    elif is_code and msg_words > 20:
        # Kode sedang-kompleks dengan konteks cukup panjang
        estimated = 6144
    elif is_code:
        # Kode sederhana / snippet
        estimated = 4096
    elif is_long or req.response_mode == 'detailed':
        # Penjelasan rinci
        estimated = 3072
    elif req.response_mode == 'bullet':
        # Poin-poin — biasanya sedang
        estimated = 2048
    elif msg_words > 40:
        # Pesan panjang dari user → respon kemungkinan panjang
        estimated = 2048
    else:
        # Jawaban singkat / concise
        estimated = 2048

    # Selalu pakai yang LEBIH BESAR antara estimasi dan permintaan user
    final = max(estimated, user_max)
    return final

@app.get("/")
def read_root():
    """Menampilkan antarmuka utama index.html"""
    return FileResponse("index.html")

@app.get("/style.css")
def get_css():
    """Menyajikan stylesheet CSS"""
    return FileResponse("style.css")

@app.get("/script.js")
def get_js():
    """Menyajikan skrip JavaScript"""
    return FileResponse("script.js")

@app.get("/api/health")
def health_check():
    """Mengecek apakah Ollama server siap dan aktif."""
    try:
        models_response = ollama.list()
        models_list = []
        if isinstance(models_response, dict) and "models" in models_response:
            models_list = [m.get("name", "") for m in models_response["models"]]
        elif hasattr(models_response, "models"):
            models_list = [getattr(m, "model", getattr(m, "name", str(m))) for m in models_response.models]
        
        return {
            "status": "online",
            "ollama": "connected",
            "available_models": models_list
        }
    except Exception as e:
        return {
            "status": "warning",
            "ollama": "disconnected",
            "error": str(e),
            "available_models": []
        }

@app.get("/api/models")
def get_models():
    """Mengambil daftar model yang terinstall di Ollama."""
    try:
        models_response = ollama.list()
        models = []
        if isinstance(models_response, dict) and "models" in models_response:
            for item in models_response["models"]:
                models.append({
                    "name": item.get("name") or item.get("model"),
                    "size": item.get("size", 0)
                })
        elif hasattr(models_response, "models"):
            for m in models_response.models:
                models.append({
                    "name": getattr(m, "model", getattr(m, "name", str(m))),
                    "size": getattr(m, "size", 0)
                })
        if not models:
            models = [{"name": DEFAULT_MODEL, "size": 0}]
        return {"models": models}
    except Exception as e:
        return {"models": [{"name": DEFAULT_MODEL, "size": 0}], "error": str(e)}

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    """Endpoint chat standar (non-stream)."""
    try:
        sys_prompt = build_system_prompt(req)
        messages = [{'role': 'system', 'content': sys_prompt}]
        for msg in req.history:
            messages.append({'role': msg.role, 'content': msg.content})
        messages.append({'role': 'user', 'content': req.message})

        target_model = req.model or DEFAULT_MODEL
        token_budget = estimate_required_tokens(req)
        options = {
            "temperature": req.temperature or 0.4,
            "num_predict": token_budget
        }

        response = ollama.chat(model=target_model, messages=messages, options=options)
        
        if isinstance(response, dict):
            bot_reply = response.get('message', {}).get('content', '')
        else:
            bot_reply = response.message.content

        return {"reply": bot_reply, "model": target_model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama error: {str(e)}")

@app.post("/api/chat/stream")
def chat_stream_endpoint(req: ChatRequest):
    """Endpoint chat dengan streaming respon (Server-Sent Events / SSE)."""
    def event_stream():
        try:
            sys_prompt = build_system_prompt(req)
            messages = [{'role': 'system', 'content': sys_prompt}]
            for msg in req.history:
                messages.append({'role': msg.role, 'content': msg.content})
            messages.append({'role': 'user', 'content': req.message})

            target_model = req.model or DEFAULT_MODEL
            token_budget = estimate_required_tokens(req)
            options = {
                "temperature": req.temperature or 0.4,
                "num_predict": token_budget
            }

            stream = ollama.chat(model=target_model, messages=messages, stream=True, options=options)
            
            for chunk in stream:
                if isinstance(chunk, dict):
                    content = chunk.get('message', {}).get('content', '')
                else:
                    content = chunk.message.content
                
                if content:
                    yield f"data: {json.dumps({'content': content})}\n\n"
            yield f"data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


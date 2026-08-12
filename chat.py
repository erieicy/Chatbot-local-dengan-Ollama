from typing import List, Optional
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import ollama

app = FastAPI(
    title="Ollama Local AI Chatbot Studio",
    description="Backend API untuk Chatbot AI Lokal yang cepat dan hemat kata",
    version="1.1.0"
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
    "Kamu adalah asisten AI lokal yang cerdas, efisien, dan efektif. "
    "SELALU berikan jawaban yang SINGKAT, PADAT, dan LANGSUNG KE INTI PERTANYAAN. "
    "Hindari kalimat pembuka/penutup basa-basi (seperti 'Tentu, ini jawabannya' atau 'Semoga membantu'). "
    "Fokus pada poin-poin utama dan berikan jawaban yang ringkas namun lengkap."
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
    max_tokens: Optional[int] = 1024

def build_system_prompt(req: ChatRequest) -> str:
    if req.system_prompt and req.system_prompt.strip():
        base = req.system_prompt.strip()
    else:
        base = SYSTEM_PROMPT_CONCISE

    if req.response_mode == "concise":
        return base + " [Instruksi Khusus: Jawab secara singkat 2-4 kalimat atau poin inti saja tanpa basa-basi.]"
    elif req.response_mode == "bullet":
        return base + " [Instruksi Khusus: Format jawaban HANYA berupa daftar poin-poin (bullet points) yang ringkas.]"
    elif req.response_mode == "code":
        return base + " [Instruksi Khusus: Utamakan balok kode dan penjelasan singkat per baris.]"
    elif req.response_mode == "detailed":
        return base + " [Instruksi Khusus: Berikan penjelasan yang terstruktur dan rinci.]"
    return base

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
        options = {
            "temperature": req.temperature or 0.5,
            "num_predict": req.max_tokens or 1024
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
            options = {
                "temperature": req.temperature or 0.5,
                "num_predict": req.max_tokens or 1024
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

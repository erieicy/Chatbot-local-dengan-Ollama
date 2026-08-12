from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import ollama

app = FastAPI()

# Mengizinkan akses dari browser (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = 'llama3.2:1b'

# Format data request dari frontend
class ChatRequest(BaseModel):
    message: str
    history: list = []

@app.get("/")
def read_root():
    # Menampilkan file index.html pas URL dibuka di browser
    return FileResponse("index.html")

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    try:
        # Susun riwayat pesan + pesan baru dari user
        messages = [{'role': 'system', 'content': 'Kamu adalah asisten AI yang ramah dan membantu.'}]
        
        # Masukkan riwayat sebelumnya
        for msg in req.history:
            messages.append(msg)
            
        # Masukkan pesan baru
        messages.append({'role': 'user', 'content': req.message})

        # Kirim ke Ollama
        response = ollama.chat(model=MODEL_NAME, messages=messages)
        bot_reply = response['message']['content']

        return {"reply": bot_reply}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
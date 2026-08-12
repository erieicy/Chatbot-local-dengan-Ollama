import ollama

# Pilihan model ringan yang udah lu pull
MODEL_NAME = 'llama3.2:1b'

# Inisialisasi riwayat chat
# Lu bisa atur 'system' prompt di sini buat nentuin kepribadian/peran AI-nya
messages_history = [
    {
        'role': 'system',
        'content': 'Kamu adalah asisten AI yang ramah, santai, dan memberikan jawaban yang singkat serta relevan.'
    }
]

print("=== CHATBOT AI LOKAL (Ketik 'exit' atau 'quit' buat keluar) ===")

while True:
    try:
        # Mengambil input dari lu
        user_input = input("\nLu: ").strip()

        # Cek kalo mau keluar dari program
        if user_input.lower() in ['exit', 'quit']:
            print("Chatbot ditutup. Bye!")
            break

        # Kalo input kosong, abaikan
        if not user_input:
            continue

        # Masukkan pesan user ke riwayat chat
        messages_history.append({
            'role': 'user',
            'content': user_input
        })

        print("AI lagi mikir...", end="\r", flush=True)

        # Kirim seluruh riwayat chat ke Ollama
        response = ollama.chat(
            model=MODEL_NAME,
            messages=messages_history
        )

        bot_reply = response['message']['content']

        # Masukkan balasan AI ke riwayat chat biar inget konteks
        messages_history.append({
            'role': 'assistant',
            'content': bot_reply
        })

        # Tampilkan balasan
        print(f"AI: {bot_reply}")

    except KeyboardInterrupt:
        print("\nProgram dihentikan.")
        break
    except Exception as e:
        print(f"\nError: {e}")
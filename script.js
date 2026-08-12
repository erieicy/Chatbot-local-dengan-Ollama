let history = [];

    async function sendMessage() {
        const inputField = document.getElementById('userInput');
        const chatBox = document.getElementById('chatBox');
        const text = inputField.value.trim();

        if (!text) return;

        // Tampilkan pesan user di UI
        chatBox.innerHTML += `<div class="msg user">${text}</div>`;
        inputField.value = '';
        chatBox.scrollTop = chatBox.scrollHeight;

        // Indikator loading
        const loadingId = 'loading-' + Date.now();
        chatBox.innerHTML += `<div class="msg bot" id="${loadingId}"><i>Lagi mikir...</i></div>`;
        chatBox.scrollTop = chatBox.scrollHeight;

        try {
            // Request ke Backend FastAPI
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: history })
            });

            const data = await res.json();
            document.getElementById(loadingId).remove();

            if (res.ok) {
                // Tampilkan balasan AI
                chatBox.innerHTML += `<div class="msg bot">${data.reply}</div>`;
                
                // Simpan ke riwayat lokal browser
                history.push({ role: 'user', content: text });
                history.push({ role: 'assistant', content: data.reply });
            } else {
                chatBox.innerHTML += `<div class="msg bot">Error: ${data.detail}</div>`;
            }
        } catch (err) {
            document.getElementById(loadingId).remove();
            chatBox.innerHTML += `<div class="msg bot">Gagal terhubung ke server backend!</div>`;
        }

        chatBox.scrollTop = chatBox.scrollHeight;
    }
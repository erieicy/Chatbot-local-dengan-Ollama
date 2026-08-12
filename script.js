// Global State
let chatHistory = [];
let isGenerating = false;
let abortController = null;

// DOM Elements
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const chatForm = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const modelSelect = document.getElementById('modelSelect');
const activeModelBadge = document.getElementById('activeModelBadge');
const systemPromptInput = document.getElementById('systemPrompt');
const streamToggle = document.getElementById('streamToggle');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const newChatBtn = document.getElementById('newChatBtn');
const clearChatHeaderBtn = document.getElementById('clearChatHeaderBtn');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');

// Initialize Marked Renderer with Syntax Highlighting & Copy Button
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    breaks: true
});

// Custom Renderer for Marked to wrap code blocks with Copy header
const renderer = new marked.Renderer();
renderer.code = function(code, language) {
    const validLang = hljs.getLanguage(language) ? language : 'text';
    const highlightedCode = hljs.getLanguage(validLang) 
        ? hljs.highlight(code, { language: validLang }).value 
        : marked.parseInline(code);

    const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
    
    return `
        <div class="code-block-wrapper">
            <div class="code-header">
                <span><i class="fa-solid fa-code"></i> ${validLang.toUpperCase()}</span>
                <button class="copy-code-btn" onclick="copyCode('${codeId}')">
                    <i class="fa-regular fa-copy"></i> Salin Kode
                </button>
            </div>
            <pre><code id="${codeId}" class="hljs language-${validLang}">${highlightedCode}</code></pre>
        </div>
    `;
};
marked.use({ renderer });

// On Document Ready
document.addEventListener('DOMContentLoaded', () => {
    checkOllamaHealth();
    fetchAvailableModels();

    // Auto-resize textarea
    userInput.addEventListener('input', autoResizeTextarea);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Sidebar Toggles
    toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('active'));
    closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));
    
    // Model Select Listener
    modelSelect.addEventListener('change', (e) => {
        activeModelBadge.textContent = e.target.value;
    });

    // New Chat & Clear Chat
    newChatBtn.addEventListener('click', resetChat);
    clearChatHeaderBtn.addEventListener('click', resetChat);

    // Scroll listener for scroll-to-bottom button
    chatBox.addEventListener('scroll', () => {
        const isNearBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 120;
        if (!isNearBottom && chatHistory.length > 0) {
            scrollBottomBtn.classList.remove('hidden');
        } else {
            scrollBottomBtn.classList.add('hidden');
        }
    });

    scrollBottomBtn.addEventListener('click', () => {
        chatBox.scrollTop = chatBox.scrollHeight;
    });
});

function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
}

// Health Check
async function checkOllamaHealth() {
    try {
        const res = await fetch('/api/health');
        const data = await res.json();
        
        if (data.status === 'online') {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Ollama Terhubung';
        } else {
            statusDot.className = 'status-dot warning';
            statusText.textContent = 'Ollama Offline / Standby';
        }
    } catch (err) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Gagal Koneksi Server';
    }
}

// Fetch Available Models
async function fetchAvailableModels() {
    try {
        const res = await fetch('/api/models');
        const data = await res.json();
        
        if (data.models && data.models.length > 0) {
            modelSelect.innerHTML = '';
            data.models.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model.name;
                opt.textContent = model.name;
                modelSelect.appendChild(opt);
            });
            activeModelBadge.textContent = modelSelect.value;
        }
    } catch (err) {
        console.warn('Gagal memuat daftar model:', err);
    }
}

// Use Quick Prompt
function usePrompt(text) {
    userInput.value = text;
    autoResizeTextarea();
    userInput.focus();
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('active');
    }
}

// Reset / Clear Chat
function resetChat() {
    chatHistory = [];
    chatBox.innerHTML = '';
    chatBox.appendChild(welcomeScreen);
    welcomeScreen.classList.remove('hidden');
}

// Handle Form Submit
async function handleSend(e) {
    if (e) e.preventDefault();
    const text = userInput.value.trim();
    if (!text || isGenerating) return;

    // Hide welcome screen
    if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
        welcomeScreen.classList.add('hidden');
    }

    // Append User Message
    appendMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';

    // UI state for generating
    setGeneratingState(true);

    const model = modelSelect.value;
    const systemPrompt = systemPromptInput.value.trim();
    const isStream = streamToggle.checked;

    // Create Bot Message Shell with Typing Indicator
    const botMsgObj = appendBotSkeleton();
    const { bubbleEl, messageId } = botMsgObj;

    abortController = new AbortController();

    try {
        if (isStream) {
            await handleStreamingChat(text, model, systemPrompt, bubbleEl, messageId);
        } else {
            await handleStandardChat(text, model, systemPrompt, bubbleEl, messageId);
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            bubbleEl.innerHTML += '<p><i>[Generasi dihentikan oleh pengguna]</i></p>';
        } else {
            bubbleEl.innerHTML = `<p style="color: var(--danger-color);"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${err.message || 'Gagal terhubung ke Ollama.'}</p>`;
        }
    } finally {
        setGeneratingState(false);
        abortController = null;
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Handle Standard Non-Stream Chat
async function handleStandardChat(message, model, systemPrompt, bubbleEl, messageId) {
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: message,
            model: model,
            history: chatHistory,
            system_prompt: systemPrompt
        }),
        signal: abortController.signal
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Terjadi kesalahan pada server');
    }

    const data = await res.json();
    const replyText = data.reply;

    // Render parsed Markdown
    bubbleEl.innerHTML = marked.parse(replyText);
    
    // Save to history
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: replyText });
    
    // Add action buttons (copy, regenerate)
    addMessageActions(messageId, replyText);
}

// Handle Streaming SSE Chat
async function handleStreamingChat(message, model, systemPrompt, bubbleEl, messageId) {
    const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: message,
            model: model,
            history: chatHistory,
            system_prompt: systemPrompt
        }),
        signal: abortController.signal
    });

    if (!res.ok) {
        throw new Error('Gagal melakukan koneksi streaming SSE');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let isFirstChunk = true;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.replace('data: ', '').trim();
                if (dataStr === '[DONE]') {
                    break;
                }

                try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.error) {
                        throw new Error(parsed.error);
                    }
                    if (parsed.content) {
                        if (isFirstChunk) {
                            bubbleEl.innerHTML = '';
                            isFirstChunk = false;
                        }
                        fullText += parsed.content;
                        // Render formatted Markdown on the fly
                        bubbleEl.innerHTML = marked.parse(fullText);
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                } catch (e) {
                    // Ignore JSON parse errors for incomplete stream frames
                }
            }
        }
    }

    if (!fullText) {
        bubbleEl.innerHTML = '<i>(Respons kosong)</i>';
    }

    // Save to local history
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: fullText });

    addMessageActions(messageId, fullText);
}

// Append User Message to DOM
function appendMessage(role, text) {
    const msgId = 'msg-' + Date.now();
    const rowEl = document.createElement('div');
    rowEl.className = `message-row ${role}-row`;
    rowEl.id = msgId;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'avatar';
    avatarEl.innerHTML = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    bubbleEl.textContent = text;

    contentEl.appendChild(bubbleEl);
    rowEl.appendChild(avatarEl);
    rowEl.appendChild(contentEl);

    chatBox.appendChild(rowEl);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Append Bot Skeleton Loading Bubble
function appendBotSkeleton() {
    const messageId = 'bot-msg-' + Date.now();
    const rowEl = document.createElement('div');
    rowEl.className = 'message-row bot-row';
    rowEl.id = messageId;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'avatar';
    avatarEl.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    bubbleEl.innerHTML = `
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;

    contentEl.appendChild(bubbleEl);
    rowEl.appendChild(avatarEl);
    rowEl.appendChild(contentEl);

    chatBox.appendChild(rowEl);
    chatBox.scrollTop = chatBox.scrollHeight;

    return { bubbleEl, messageId };
}

// Add Action Buttons under Bot Response
function addMessageActions(messageId, fullText) {
    const rowEl = document.getElementById(messageId);
    if (!rowEl) return;

    const contentEl = rowEl.querySelector('.message-content');
    if (!contentEl) return;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'message-actions';
    
    // Create copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Salin';
    copyBtn.onclick = () => copyText(copyBtn, fullText);

    // Create regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.className = 'msg-action-btn';
    regenBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Regenerate';
    regenBtn.onclick = () => regenerateLastResponse();

    actionsEl.appendChild(copyBtn);
    actionsEl.appendChild(regenBtn);

    contentEl.appendChild(actionsEl);
}

// Copy Code Block Content
function copyCode(codeId) {
    const codeEl = document.getElementById(codeId);
    if (!codeEl) return;
    
    navigator.clipboard.writeText(codeEl.innerText).then(() => {
        const btn = codeEl.closest('.code-block-wrapper').querySelector('.copy-code-btn');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check" style="color: var(--success-color);"></i> Tersalin!';
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-regular fa-copy"></i> Salin Kode';
            }, 2000);
        }
    });
}

// Copy Full Message Text
function copyText(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '<i class="fa-solid fa-check" style="color: var(--success-color);"></i> Tersalin!';
        setTimeout(() => {
            btn.innerHTML = '<i class="fa-regular fa-copy"></i> Salin';
        }, 2000);
    });
}

// Regenerate Last Response
function regenerateLastResponse() {
    if (chatHistory.length < 2 || isGenerating) return;
    
    // Pop last assistant response and last user message
    const lastAssistant = chatHistory.pop();
    const lastUser = chatHistory.pop();

    if (lastUser && lastUser.role === 'user') {
        // Remove last 2 message rows from DOM
        const rows = chatBox.querySelectorAll('.message-row');
        if (rows.length >= 2) {
            rows[rows.length - 1].remove();
            rows[rows.length - 2].remove();
        }
        userInput.value = lastUser.content;
        autoResizeTextarea();
        handleSend();
    }
}

// Stop AI Generation
function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}

// UI State Manager
function setGeneratingState(generating) {
    isGenerating = generating;
    if (generating) {
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}
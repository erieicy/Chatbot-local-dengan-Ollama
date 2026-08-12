// Global State
let chatHistory = [];
let isGenerating = false;
let abortController = null;
let currentResponseMode = 'concise'; // 'concise', 'bullet', 'code', 'detailed'

// DOM Elements
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const chatForm = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const modelSelect = document.getElementById('modelSelect');
const activeModelBadge = document.getElementById('activeModelBadge');
const activeModeBadge = document.getElementById('activeModeBadge');
const systemPromptInput = document.getElementById('systemPrompt');
const streamToggle = document.getElementById('streamToggle');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
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
// Note: marked v5+ passes a single token object { text, lang, escaped }
const renderer = new marked.Renderer();
renderer.code = function(token) {
    // Support both old API (code, lang) and new API (token object)
    const code = (typeof token === 'object' && token !== null) ? (token.text || '') : (token || '');
    const language = (typeof token === 'object' && token !== null) ? (token.lang || '') : (arguments[1] || '');

    const validLang = hljs.getLanguage(language) ? language : 'text';
    let highlightedCode;
    try {
        highlightedCode = hljs.getLanguage(validLang)
            ? hljs.highlight(code, { language: validLang }).value
            : hljs.highlightAuto(code).value;
    } catch (e) {
        highlightedCode = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

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

/**
 * Preprocess Markdown to prevent HTML DOM from swallowing un-fenced C++ include headers like <iostream>
 */
function renderMarkdownSafely(text) {
    if (!text) return '';

    let formatted = text;

    // Pisahkan code blocks yang sudah ada agar tidak ikut diproses
    const codeBlockPattern = /(```[\s\S]*?```|`[^`]+`)/g;
    const codePlaceholders = [];
    formatted = formatted.replace(codeBlockPattern, (match) => {
        const idx = codePlaceholders.length;
        codePlaceholders.push(match);
        return `\x00CODE${idx}\x00`;
    });

    // Escape standalone C++ headers di luar code blocks agar tidak dianggap tag HTML
    formatted = formatted.replace(/(^|\s)#include\s*<([a-zA-Z0-9_\.]+)>/g, '$1`#include <$2>`');

    // Kembalikan code blocks yang sudah dipisahkan
    formatted = formatted.replace(/\x00CODE(\d+)\x00/g, (_, idx) => codePlaceholders[parseInt(idx)]);

    // Jika tidak ada code fence sama sekali tapi ada #include, wrap sebagai cpp
    if (formatted.includes('#include') && !formatted.includes('```')) {
        formatted = '```cpp\n' + formatted + '\n```';
    }

    return marked.parse(formatted);
}

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

    // Sidebar Buka / Tutup Toggle Listeners (Desktop & Mobile)
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

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

// Sidebar Toggle Function (Handles Desktop Collapse & Mobile Slide Overlay)
function toggleSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('active');
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('active');
        }
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

function closeSidebar() {
    sidebar.classList.remove('active');
    sidebar.classList.add('collapsed');
    if (sidebarOverlay) {
        sidebarOverlay.classList.remove('active');
    }
}

function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
}

// Select Response Mode Pill
function selectMode(mode, btnElement) {
    currentResponseMode = mode;
    document.querySelectorAll('.mode-pill').forEach(btn => btn.classList.remove('active'));
    if (btnElement) {
        btnElement.classList.add('active');
    }

    const modeLabels = {
        'concise': '🎯 Mode: Singkat & Inti',
        'bullet': '📋 Mode: Poin-Poin',
        'code': '💻 Mode: Kode Tech',
        'detailed': '📚 Mode: Rinci'
    };
    activeModeBadge.textContent = modeLabels[mode] || '🎯 Mode: Singkat & Inti';
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
        closeSidebar();
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
        let success = false;
        if (isStream) {
            try {
                success = await handleStreamingChat(text, model, systemPrompt, bubbleEl, messageId);
            } catch (err) {
                console.warn('Streaming gagal, beralih ke mode standar:', err);
            }
        }
        
        // Fallback jika stream tidak jalan atau tidak mengembalikan teks
        if (!success) {
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
            system_prompt: systemPrompt,
            response_mode: currentResponseMode
        }),
        signal: abortController.signal
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Terjadi kesalahan pada server');
    }

    const data = await res.json();
    const replyText = data.reply;

    // Render parsed Markdown safely
    bubbleEl.innerHTML = renderMarkdownSafely(replyText);
    
    // Save to history
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: replyText });
    
    // Add action buttons (copy, speak, regenerate)
    addMessageActions(messageId, replyText);
    return true;
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
            system_prompt: systemPrompt,
            response_mode: currentResponseMode
        }),
        signal: abortController.signal
    });

    if (!res.ok) {
        return false;
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
                        // Render formatted Markdown safely on the fly
                        bubbleEl.innerHTML = renderMarkdownSafely(fullText);
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                } catch (e) {
                    // Ignore JSON parse errors for incomplete stream frames
                }
            }
        }
    }

    if (!fullText) {
        return false;
    }

    // Save to local history
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: fullText });

    addMessageActions(messageId, fullText);
    return true;
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
    
    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Salin';
    copyBtn.onclick = () => copyText(copyBtn, fullText);

    // Speak Audio button (Text To Speech)
    const speakBtn = document.createElement('button');
    speakBtn.className = 'msg-action-btn';
    speakBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Baca';
    speakBtn.onclick = () => speakText(speakBtn, fullText);

    // Regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.className = 'msg-action-btn';
    regenBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Regenerate';
    regenBtn.onclick = () => regenerateLastResponse();

    actionsEl.appendChild(copyBtn);
    actionsEl.appendChild(speakBtn);
    actionsEl.appendChild(regenBtn);

    contentEl.appendChild(actionsEl);
}

// Text-To-Speech (Suara AI)
function speakText(btn, text) {
    if (!('speechSynthesis' in window)) {
        alert('Browser Anda tidak mendukung Text-to-Speech');
        return;
    }

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Baca';
        return;
    }

    // Strip Markdown symbols for clean audio reading
    const cleanText = text.replace(/[*_#`~-]/g, '').replace(/\[.*?\]\(.*?\)/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;

    btn.innerHTML = '<i class="fa-solid fa-square" style="color: var(--danger-color);"></i> Stop';

    utterance.onend = () => {
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Baca';
    };

    window.speechSynthesis.speak(utterance);
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
/**
 * Chat Module — текстовые сообщения через WebRTC Data Channel
 */

class ChatManager {
  constructor(webrtcManager) {
    this.webrtcManager = webrtcManager;
    this.username = '';
    this.messages = [];

    // DOM elements
    this.messagesArea = document.getElementById('messages-area');
    this.messageInput = document.getElementById('message-input');
    this.sendBtn = document.getElementById('send-btn');
    this.chatTitle = document.getElementById('chat-title');

    this.setupListeners();
  }

  setUsername(username) {
    this.username = username;
  }

  setupListeners() {
    // Send message
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    // Listen for incoming messages via WebRTC
    this.webrtcManager.onMessage = (text, username) => {
      this.displayMessage({ text, username, isOwn: false });
    };
  }

  sendMessage() {
    const text = this.messageInput.value.trim();
    if (!text) return;

    const sent = this.webrtcManager.sendMessage(text, this.username);
    if (sent) {
      this.displayMessage({ text, username: this.username, isOwn: true });
      this.messageInput.value = '';
      this.messageInput.focus();
    } else {
      alert('Нет подключения к собеседнику');
    }
  }

  displayMessage(data) {
    const div = document.createElement('div');
    div.className = `message ${data.isOwn ? 'own' : 'other'}`;

    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    div.innerHTML = `
      ${!data.isOwn ? `<div class="msg-user">${this.escapeHtml(data.username)}</div>` : ''}
      <div>${this.escapeHtml(data.text)}</div>
      <div class="msg-time">${time}</div>
    `;

    this.messagesArea.appendChild(div);
    this.scrollToBottom();
  }

  appendSystemMessage(text) {
    const div = document.createElement('div');
    div.style.cssText = `
      text-align: center;
      color: var(--text-secondary);
      font-size: 12px;
      padding: 8px 0;
    `;
    div.textContent = text;
    this.messagesArea.appendChild(div);
    this.scrollToBottom();
  }

  clearMessages() {
    this.messagesArea.innerHTML = '';
  }

  scrollToBottom() {
    this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
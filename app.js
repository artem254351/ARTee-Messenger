/**
 * ARTee Messenger — Main Application (P2P via WebRTC)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const loginScreen = document.getElementById('login-screen');
  const mainApp = document.getElementById('main-app');
  const usernameInput = document.getElementById('username-input');
  const loginBtn = document.getElementById('login-btn');
  const createOfferBtn = document.getElementById('create-offer-btn');
  const remoteOfferInput = document.getElementById('remote-offer-input');
  const connectBtn = document.getElementById('connect-btn');
  const currentUsernameSpan = document.getElementById('current-username');
  const peerNameSpan = document.getElementById('peer-name');
  const peerStatus = document.getElementById('peer-status');
  const peerInfo = document.getElementById('peer-info');
  const connectionBadge = document.getElementById('connection-badge');
  const voiceCallBtn = document.getElementById('voice-call-btn');
  const videoCallBtn = document.getElementById('video-call-btn');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');

  // Signaling modal
  const signalingModal = document.getElementById('signaling-modal');
  const signalingCode = document.getElementById('signaling-code');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');

  let webrtcManager, chatManager;
  let username = '';
  let peerUsername = '';
  let isInitiator = false;
  let signalingStep = 'idle'; // idle | waiting-answer | connected

  // --- Login ---
  loginBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) {
      alert('Введите имя пользователя');
      return;
    }
    username = name;
    currentUsernameSpan.textContent = username;
    loginScreen.style.display = 'none';
    mainApp.style.display = 'block';

    // Initialize managers
    webrtcManager = new WebRTCManager();
    chatManager = new ChatManager(webrtcManager);
    chatManager.setUsername(username);

    setupAppListeners();
  });

  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  function setupAppListeners() {
    // --- Create room (initiator) ---
    createOfferBtn.addEventListener('click', async () => {
      if (webrtcManager.isConnected) {
        if (!confirm('Вы уже подключены. Создать новое подключение?')) return;
        webrtcManager.destroy();
        resetConnection();
      }

      try {
        isInitiator = true;
        signalingStep = 'waiting-answer';
        updateConnectionState('Ожидание ответа...');

        await webrtcManager.createOffer();

        // Wait for ICE candidates to gather
        await waitForIceGathering(webrtcManager);

        // Collect all ICE candidates
        const iceCandidates = webrtcManager.getPendingIceCandidates();

        // Create signaling data
        const signalData = {
          type: 'offer',
          sdp: webrtcManager.peerConnection.localDescription.sdp,
          iceCandidates: iceCandidates.map((c) => ({
            candidate: c.candidate,
            sdpMid: c.sdpMid,
            sdpMLineIndex: c.sdpMLineIndex,
          })),
          username: username,
        };

        signalingCode.value = JSON.stringify(signalData, null, 2);
        signalingModal.style.display = 'flex';

        chatManager.appendSystemMessage('🔗 Комната создана. Отправьте код собеседнику.');
      } catch (err) {
        console.error(err);
        alert('Ошибка при создании комнаты');
        resetConnection();
      }
    });

    // --- Единый обработчик для кнопки "Подключиться" ---
    connectBtn.addEventListener('click', async () => {
      const code = remoteOfferInput.value.trim();
      if (!code) {
        alert('Вставьте код приглашения');
        return;
      }

      let signalData;
      try {
        signalData = JSON.parse(code);
      } catch (err) {
        alert('Неверный формат кода. Скопируйте код полностью.');
        return;
      }

      // Если мы инициатор и ждём ответ — обрабатываем answer
      if (isInitiator && signalingStep === 'waiting-answer' && signalData.type === 'answer') {
        await handleAnswerData(signalData);
        return;
      }

      // Иначе — обрабатываем как подключение по offer (мы receiver)
      if (signalData.type === 'offer') {
        await handleOfferData(signalData);
        return;
      }

      alert('Неверный формат кода. Ожидается offer или answer.');
    });

    async function handleOfferData(signalData) {
      if (webrtcManager.isConnected) {
        if (!confirm('Вы уже подключены. Создать новое подключение?')) return;
        webrtcManager.destroy();
        resetConnection();
      }

      try {
        isInitiator = false;
        signalingStep = 'waiting-answer';
        updateConnectionState('Подключение...');

        peerUsername = signalData.username || 'Собеседник';
        peerNameSpan.textContent = peerUsername;

        // Handle offer
        const answer = await webrtcManager.handleOffer({
          type: 'offer',
          sdp: signalData.sdp,
        });

        // Add remote ICE candidates
        if (signalData.iceCandidates) {
          for (const c of signalData.iceCandidates) {
            await webrtcManager.addIceCandidate(c);
          }
        }

        // Wait for local ICE candidates
        await waitForIceGathering(webrtcManager);

        // Collect ICE candidates
        const iceCandidates = webrtcManager.getPendingIceCandidates();

        // Create answer signaling data
        const answerData = {
          type: 'answer',
          sdp: answer.sdp,
          iceCandidates: iceCandidates.map((c) => ({
            candidate: c.candidate,
            sdpMid: c.sdpMid,
            sdpMLineIndex: c.sdpMLineIndex,
          })),
          username: username,
        };

        signalingCode.value = JSON.stringify(answerData, null, 2);
        signalingModal.style.display = 'flex';

        chatManager.appendSystemMessage('📤 Отправьте этот код обратно собеседнику для завершения подключения.');
      } catch (err) {
        console.error(err);
        alert('Ошибка при подключении. Проверьте код.');
        resetConnection();
      }
    }

    async function handleAnswerData(data) {
      try {
        peerUsername = data.username || 'Собеседник';
        peerNameSpan.textContent = peerUsername;

        await webrtcManager.handleAnswer({
          type: 'answer',
          sdp: data.sdp,
        });

        // Add remote ICE candidates
        if (data.iceCandidates) {
          for (const c of data.iceCandidates) {
            await webrtcManager.addIceCandidate(c);
          }
        }

        chatManager.appendSystemMessage('🔄 Подключение устанавливается...');
        remoteOfferInput.value = '';
      } catch (err) {
        console.error(err);
        alert('Ошибка при обработке ответа');
      }
    }

    // --- Peer connection events ---
    webrtcManager.onPeerConnected = () => {
      signalingStep = 'connected';
      updateConnectionState('Подключено');
      peerStatus.innerHTML = `
        <span class="user-status" style="display:inline-block;margin-right:4px;"></span>
        <span style="color:var(--success);">В сети</span>
      `;
      peerInfo.style.display = 'block';
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
      chatManager.appendSystemMessage('✅ Собеседник подключился! Можете общаться.');
    };

    webrtcManager.onPeerDisconnected = () => {
      signalingStep = 'idle';
      updateConnectionState('Отключено');
      peerStatus.innerHTML = 'Собеседник отключился';
      peerInfo.style.display = 'none';
      messageInput.disabled = true;
      sendBtn.disabled = true;
      chatManager.appendSystemMessage('❌ Собеседник отключился.');
    };

    // --- Call buttons ---
    voiceCallBtn.addEventListener('click', () => {
      if (!webrtcManager.isConnected) {
        alert('Сначала подключитесь к собеседнику');
        return;
      }
      webrtcManager.startCall('voice');
    });

    videoCallBtn.addEventListener('click', () => {
      if (!webrtcManager.isConnected) {
        alert('Сначала подключитесь к собеседнику');
        return;
      }
      webrtcManager.startCall('video');
    });

    // --- Signaling modal ---
    copyCodeBtn.addEventListener('click', () => {
      signalingCode.select();
      navigator.clipboard.writeText(signalingCode.value)
        .then(() => {
          copyCodeBtn.textContent = '✅ Скопировано!';
          setTimeout(() => { copyCodeBtn.textContent = '📋 Копировать'; }, 2000);
        })
        .catch(() => {
          document.execCommand('copy');
          copyCodeBtn.textContent = '✅ Скопировано!';
          setTimeout(() => { copyCodeBtn.textContent = '📋 Копировать'; }, 2000);
        });
    });

    closeModalBtn.addEventListener('click', () => {
      signalingModal.style.display = 'none';
    });

    signalingModal.addEventListener('click', (e) => {
      if (e.target === signalingModal) {
        signalingModal.style.display = 'none';
      }
    });
  }

  function updateConnectionState(text) {
    connectionBadge.textContent = text;
  }

  function resetConnection() {
    signalingStep = 'idle';
    isInitiator = false;
    peerUsername = '';
    peerNameSpan.textContent = '—';
    peerStatus.innerHTML = 'Ожидание подключения...';
    peerInfo.style.display = 'none';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    updateConnectionState('Не подключено');
  }

  function waitForIceGathering(manager) {
    return new Promise((resolve) => {
      const pc = manager.peerConnection;
      if (!pc) {
        resolve();
        return;
      }

      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        }
      };
    });
  }
});
/**
 * WebRTC Module — P2P голосовые/видеозвонки + Data Channels для чата
 */

class WebRTCManager {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
    this.currentCall = null; // { type: 'voice'|'video' }
    this.isMuted = false;
    this.isCallActive = false;
    this.isConnected = false;

    // Callbacks
    this.onMessage = null; // (text) => {}
    this.onPeerConnected = null; // () => {}
    this.onPeerDisconnected = null; // () => {}
    this.onCallStateChange = null; // (active) => {}

    // DOM elements
    this.callOverlay = document.getElementById('call-overlay');
    this.callUsername = document.getElementById('call-username');
    this.callStatus = document.getElementById('call-status');
    this.callTimer = document.getElementById('call-timer');
    this.muteBtn = document.getElementById('mute-btn');
    this.endCallBtn = document.getElementById('end-call-btn');
    this.remoteVideo = document.getElementById('remote-video');
    this.localVideo = document.getElementById('local-video');

    this.timerInterval = null;
    this.callStartTime = null;

    this.setupUIListeners();
  }

  setupUIListeners() {
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.endCallBtn.addEventListener('click', () => this.endCall());
  }

  // --- Create offer (initiator) ---
  async createOffer() {
    try {
      this.peerConnection = this.createPeerConnection();

      // Create data channel for chat
      this.dataChannel = this.peerConnection.createDataChannel('chat');
      this.setupDataChannel();

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      return { type: 'offer', sdp: offer.sdp };
    } catch (err) {
      console.error('Error creating offer:', err);
      throw err;
    }
  }

  // --- Handle incoming offer (receiver) ---
  async handleOffer(offerData) {
    try {
      this.peerConnection = this.createPeerConnection();

      // Listen for data channel from initiator
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      return { type: 'answer', sdp: answer.sdp };
    } catch (err) {
      console.error('Error handling offer:', err);
      throw err;
    }
  }

  // --- Handle answer ---
  async handleAnswer(answerData) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerData));
    } catch (err) {
      console.error('Error handling answer:', err);
      throw err;
    }
  }

  // --- Handle ICE candidate ---
  async addIceCandidate(candidate) {
    try {
      if (this.peerConnection && candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }

  // --- Create peer connection ---
  createPeerConnection() {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._pendingIceCandidates.push(event.candidate);
        this._notifyIceCandidate();
      }
    };

    pc.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.currentCall && this.currentCall.type === 'video') {
        this.remoteVideo.srcObject = this.remoteStream;
        this.remoteVideo.style.display = 'block';
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.isConnected = true;
        if (this.onPeerConnected) this.onPeerConnected();
      } else if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        this.isConnected = false;
        this.cleanupCall();
        if (this.onPeerDisconnected) this.onPeerDisconnected();
      }
    };

    // Store pending ICE candidates for signaling
    this._pendingIceCandidates = [];
    this._iceCandidateCallback = null;

    return pc;
  }

  // --- Data channel setup ---
  setupDataChannel() {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.isConnected = true;
      if (this.onPeerConnected) this.onPeerConnected();
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.isConnected = false;
      if (this.onPeerDisconnected) this.onPeerDisconnected();
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && this.onMessage) {
          this.onMessage(data.text, data.username);
        }
      } catch (err) {
        console.error('Error parsing data channel message:', err);
      }
    };
  }

  // --- Send text message via data channel ---
  sendMessage(text, username) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'message', text, username }));
      return true;
    }
    return false;
  }

  // --- ICE candidate signaling ---
  getPendingIceCandidates() {
    const candidates = [...this._pendingIceCandidates];
    this._pendingIceCandidates = [];
    return candidates;
  }

  _notifyIceCandidate() {
    if (this._iceCandidateCallback) {
      this._iceCandidateCallback();
    }
  }

  onIceCandidate(callback) {
    this._iceCandidateCallback = callback;
  }

  // --- Voice/Video call ---
  async startCall(type = 'voice') {
    try {
      this.currentCall = { type };
      this.isCallActive = true;

      const constraints = {
        audio: true,
        video: type === 'video',
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (type === 'video') {
        this.localVideo.srcObject = this.localStream;
        this.localVideo.style.display = 'block';
      }

      // Add tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream);
        }
      });

      this.showCallOverlay('Собеседник', 'Установка соединения...');
    } catch (err) {
      console.error('Error starting call:', err);
      alert('Не удалось начать звонок. Проверьте доступ к микрофону/камере.');
      this.cleanupCall();
    }
  }

  showCallOverlay(username, status) {
    this.callUsername.textContent = username;
    this.callStatus.textContent = status;
    this.callOverlay.classList.add('active');
    this.callStartTime = Date.now();
    this.startTimer();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      this.callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  toggleMute() {
    if (this.localStream) {
      this.isMuted = !this.isMuted;
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
      this.muteBtn.classList.toggle('active');
      this.muteBtn.textContent = this.isMuted ? '🔇' : '🎤';
    }
  }

  endCall() {
    this.cleanupCall();
  }

  cleanupCall() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.callOverlay.classList.remove('active');
    this.callTimer.textContent = '00:00';
    this.muteBtn.classList.remove('active');
    this.muteBtn.textContent = '🎤';

    this.localVideo.style.display = 'none';
    this.remoteVideo.style.display = 'none';
    this.localVideo.srcObject = null;
    this.remoteVideo.srcObject = null;

    this.isCallActive = false;
    this.currentCall = null;

    if (this.onCallStateChange) this.onCallStateChange(false);
  }

  // --- Full cleanup ---
  destroy() {
    this.cleanupCall();

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isConnected = false;
  }
}
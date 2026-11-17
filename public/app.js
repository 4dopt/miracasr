(() => {
  // ============================================================================
  // DOM ELEMENTS
  // ============================================================================
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  const connectionBanner = document.getElementById('connectionBanner');
  const connectionBannerText = document.getElementById('connectionBannerText');
  const roomPinDisplay = document.getElementById('roomPinDisplay');
  const btnCopyLink = document.getElementById('btnCopyLink');
  const btnNewRoomPin = document.getElementById('btnNewRoomPin');
  const joinPinInput = document.getElementById('joinPinInput');
  const btnJoinPin = document.getElementById('btnJoinPin');
  const qrBox = document.getElementById('qrBox');

  // Live Receiver Stage
  const liveReceiverStage = document.getElementById('liveReceiverStage');
  const videoStageContainer = document.getElementById('videoStageContainer');
  const liveStreamTitle = document.getElementById('liveStreamTitle');
  const liveStagePinLabel = document.getElementById('liveStagePinLabel');
  const stageVideo = document.getElementById('stageVideo');
  const stageImage = document.getElementById('stageImage');
  const btnUnmuteOverlay = document.getElementById('btnUnmuteOverlay');

  const btnStageMute = document.getElementById('btnStageMute');
  const btnStageRotate = document.getElementById('btnStageRotate');
  const btnStageFit = document.getElementById('btnStageFit');
  const btnStageMirror = document.getElementById('btnStageMirror');
  const btnStageSnapshot = document.getElementById('btnStageSnapshot');
  const btnStageFullscreen = document.getElementById('btnStageFullscreen');
  const btnStageClose = document.getElementById('btnStageClose');

  // Active Sender Panel
  const activeSenderPanel = document.getElementById('activeSenderPanel');
  const activeSenderStatusTitle = document.getElementById('activeSenderStatusTitle');
  const btnFlipCamera = document.getElementById('btnFlipCamera');
  const btnClearBoard = document.getElementById('btnClearBoard');
  const btnStopSending = document.getElementById('btnStopSending');
  const senderPreviewVideo = document.getElementById('senderPreviewVideo');
  const senderWhiteboardCanvas = document.getElementById('senderWhiteboardCanvas');

  // Cast Action Buttons
  const btnActionCastScreen = document.getElementById('btnActionCastScreen');
  const btnActionCastCamera = document.getElementById('btnActionCastCamera');
  const btnActionCastFile = document.getElementById('btnActionCastFile');
  const btnActionCastWhiteboard = document.getElementById('btnActionCastWhiteboard');
  const mediaFileInput = document.getElementById('mediaFileInput');

  const toastStack = document.getElementById('toastStack');

  // ============================================================================
  // STATE
  // ============================================================================
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  };

  const myClientId = `mc_${Math.random().toString(36).slice(2, 10)}`;
  let myPeer = null;
  let myPeerJsId = null;

  let lanBaseUrl = null;
  let currentPin = null;

  // Cloud WSS Room Bus (MQTT over WebSockets — works on Netlify & behind firewalls)
  let mqttClient = null;
  let currentMqttTopic = null;

  // Optional Local WebSocket (when running `node server.js` locally)
  let localWs = null;
  let myLocalWsPeerId = null;

  // Discovered devices in the same 4-digit PIN room:
  // Map<clientId, { clientId, deviceName, peerJsId, lastSeen, webrtcConfirmed }>
  const roomPeers = new Map();
  const activeMediaCalls = new Map();

  // Sender state
  let activeLocalStream = null;
  let activeCastType = null; // 'screen' | 'camera' | 'file' | 'whiteboard' | 'photo'
  let activeCastTitle = '';
  let currentCameraFacing = 'environment';
  let frameRelayInterval = null;
  let whiteboardClockReq = null;
  let currentPhotoDataUrl = null;

  // Receiver state
  let webrtcPlayingOnStage = false;
  let stageRotation = 0;
  let stageFill = false;
  let stageMirrored = false;

  // ============================================================================
  // HELPERS
  // ============================================================================
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function getDeviceLabel() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'Android Phone';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone / iPad';
    if (/mac/i.test(ua)) return 'Mac';
    if (/win/i.test(ua)) return 'Windows PC';
    return 'Wireless Screen';
  }

  function randomPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function getInviteUrl(pin) {
    const base = lanBaseUrl || `${location.origin}${location.pathname}`;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/?pin=${encodeURIComponent(pin)}`;
  }

  function renderQr(url) {
    qrBox.innerHTML = '';
    if (typeof window.qrcode === 'function') {
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 1, scalable: true });
        return;
      } catch (_) {}
    }
    const img = document.createElement('img');
    img.alt = 'Scan QR Code';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(
      url
    )}`;
    qrBox.appendChild(img);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================================
  // 1. INITIALIZE PEERJS (RANDOM ID — ZERO STALE COLLISIONS!)
  // ============================================================================
  function initPeerJs() {
    if (typeof window.Peer !== 'function') {
      setTimeout(initPeerJs, 400);
      return;
    }

    const peer = new window.Peer({ config: RTC_CONFIG });
    myPeer = peer;

    peer.on('open', (id) => {
      myPeerJsId = id;
      announcePresenceInRoom();
    });

    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (remoteStream) => {
        showIncomingWebRtcStream(remoteStream);
      });
      call.on('close', () => {
        closeReceiverStage();
      });
    });

    peer.on('error', (err) => {
      console.warn('PeerJS notice:', err);
    });
  }

  // ============================================================================
  // 2. INITIALIZE CLOUD WSS ROOM BUS (MQTT OVER WSS FOR NETLIFY & EVERYWHERE)
  // ============================================================================
  const MQTT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
  ];
  let brokerIndex = 0;

  function initCloudRoomBus() {
    if (typeof window.mqtt === 'undefined') {
      setTimeout(initCloudRoomBus, 400);
      return;
    }

    const brokerUrl = MQTT_BROKERS[brokerIndex % MQTT_BROKERS.length];
    const client = window.mqtt.connect(brokerUrl, {
      clientId: `${myClientId}_${Date.now()}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2000,
    });
    mqttClient = client;

    client.on('connect', () => {
      statusDot.className = 'dot ready';
      statusText.textContent = `Room ${currentPin} Ready`;
      if (currentPin) {
        subscribeMqttRoom(currentPin);
      }
    });

    client.on('error', () => {
      brokerIndex++;
    });

    client.on('message', (topic, payload) => {
      if (topic !== currentMqttTopic) return;
      let msg;
      try {
        msg = JSON.parse(payload.toString());
      } catch (_) {
        return;
      }
      if (!msg || msg.senderId === myClientId) return;
      handleRoomMessage(msg);
    });
  }

  function subscribeMqttRoom(pin) {
    if (!mqttClient || !mqttClient.connected) return;
    const newTopic = `miracasr/room/v4/${pin}`;
    if (currentMqttTopic && currentMqttTopic !== newTopic) {
      try {
        mqttClient.unsubscribe(currentMqttTopic);
      } catch (_) {}
    }
    currentMqttTopic = newTopic;
    mqttClient.subscribe(newTopic, { qos: 0 }, () => {
      announcePresenceInRoom();
    });
  }

  function publishToRoom(payload) {
    const packet = {
      ...payload,
      senderId: myClientId,
      senderName: getDeviceLabel(),
      peerJsId: myPeerJsId,
      pin: currentPin,
      ts: Date.now(),
    };

    // 1. Send via Cloud WSS Room Bus (works on Netlify and everywhere)
    if (mqttClient && mqttClient.connected && currentMqttTopic) {
      try {
        mqttClient.publish(currentMqttTopic, JSON.stringify(packet), { qos: 0 });
      } catch (_) {}
    }

    // 2. Also send via Local Server WebSocket if running `node server.js`
    if (localWs && localWs.readyState === WebSocket.OPEN) {
      if (payload.type === 'cast-start') {
        localWs.send(JSON.stringify({ type: 'start-broadcast', streamMode: 'canvas' }));
      } else if (payload.type === 'cast-frame') {
        localWs.send(
          JSON.stringify({
            type: 'canvas-frame',
            dataUrl: payload.dataUrl,
            timestamp: Date.now(),
          })
        );
      } else if (payload.type === 'cast-stop') {
        localWs.send(JSON.stringify({ type: 'stop-broadcast' }));
      }
    }
  }

  // ============================================================================
  // 3. OPTIONAL LOCAL SERVER WEBSOCKET (For Offline LAN Support)
  // ============================================================================
  async function detectLocalServer() {
    connectLocalWebSocket();
    try {
      const res = await fetch('/api/info');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const info = await res.json();
        if (info && info.primaryIp && info.httpPort) {
          if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            lanBaseUrl = `http://${info.primaryIp}:${info.httpPort}`;
            if (currentPin) renderQr(getInviteUrl(currentPin));
          }
        }
      }
    } catch (_) {}
  }

  function connectLocalWebSocket() {
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      localWs = new WebSocket(`${proto}//${location.host}`);

      localWs.addEventListener('open', () => {
        statusDot.className = 'dot ready';
        statusText.textContent = `Room ${currentPin} Ready`;
        if (currentPin) {
          localWs.send(
            JSON.stringify({
              type: 'create-or-join',
              pin: currentPin,
              name: getDeviceLabel(),
              deviceType: 'desktop',
            })
          );
        }
      });

      localWs.addEventListener('message', (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch (_) {
          return;
        }
        if (msg.type === 'welcome' || msg.type === 'joined-room') {
          if (msg.peerId) myLocalWsPeerId = msg.peerId;
        } else if (msg.type === 'room-state' && Array.isArray(msg.peers)) {
          for (const k of Array.from(roomPeers.keys())) {
            if (k.startsWith('local_')) roomPeers.delete(k);
          }
          msg.peers.forEach((p) => {
            if (p.id && p.id !== myLocalWsPeerId) {
              roomPeers.set(`local_${p.id}`, {
                clientId: `local_${p.id}`,
                deviceName: p.name || 'Linked Device',
                peerJsId: null,
                lastSeen: Date.now(),
                webrtcConfirmed: false,
              });
            }
          });
          updateConnectionBannerUI();
        } else if (msg.type === 'canvas-frame' && msg.dataUrl) {
          handleIncomingFrame({
            title: 'Live Wireless Stream',
            dataUrl: msg.dataUrl,
          });
        } else if (msg.type === 'broadcaster-stopped') {
          closeReceiverStage();
        }
      });
    } catch (_) {}
  }

  // ============================================================================
  // 4. ROOM PRESENCE, PAIRING & MESSAGE HANDLING
  // ============================================================================
  function setRoomPin(pin) {
    const cleanPin = /^\d{4}$/.test(String(pin || '').trim())
      ? String(pin).trim()
      : randomPin();

    currentPin = cleanPin;
    roomPinDisplay.textContent = cleanPin;
    liveStagePinLabel.textContent = cleanPin;
    joinPinInput.value = cleanPin;
    renderQr(getInviteUrl(cleanPin));

    roomPeers.clear();
    updateConnectionBannerUI();

    subscribeMqttRoom(cleanPin);

    if (localWs && localWs.readyState === WebSocket.OPEN) {
      localWs.send(
        JSON.stringify({
          type: 'create-or-join',
          pin: cleanPin,
          name: getDeviceLabel(),
          deviceType: 'desktop',
        })
      );
    }

    announcePresenceInRoom();
  }

  function announcePresenceInRoom() {
    publishToRoom({ type: 'hello' });
  }

  // Periodic heartbeat so devices in the room stay synced
  setInterval(() => {
    if (currentPin) {
      publishToRoom({ type: 'heartbeat' });
      // Prune peers silent for >12s
      const now = Date.now();
      let changed = false;
      for (const [id, p] of roomPeers.entries()) {
        if (now - p.lastSeen > 12000) {
          roomPeers.delete(id);
          changed = true;
        }
      }
      if (changed) updateConnectionBannerUI();
    }
  }, 3500);

  function handleRoomMessage(msg) {
    const isNewPeer = !roomPeers.has(msg.senderId);
    const peerEntry = roomPeers.get(msg.senderId) || {
      clientId: msg.senderId,
      deviceName: msg.senderName || 'Wireless Device',
      peerJsId: msg.peerJsId || null,
      lastSeen: Date.now(),
      webrtcConfirmed: false,
    };

    peerEntry.deviceName = msg.senderName || peerEntry.deviceName;
    if (msg.peerJsId) peerEntry.peerJsId = msg.peerJsId;
    peerEntry.lastSeen = Date.now();
    roomPeers.set(msg.senderId, peerEntry);

    if (isNewPeer) {
      updateConnectionBannerUI();
      toast(`🔗 Linked with ${peerEntry.deviceName}!`);
      // Reply immediately so the new peer knows we are here too!
      publishToRoom({ type: 'hello-ack' });

      // If we are ALREADY casting, immediately call/stream to this newly joined device!
      if (activeCastType) {
        initiateStreamToPeer(peerEntry);
      }
    }

    switch (msg.type) {
      case 'hello': {
        updateConnectionBannerUI();
        if (activeCastType) {
          initiateStreamToPeer(peerEntry);
        }
        break;
      }

      case 'hello-ack': {
        updateConnectionBannerUI();
        break;
      }

      case 'cast-start': {
        if (activeCastType) {
          // Another device started casting; stop our own cast and switch to viewing
          stopSendingCast(false);
        }
        peerEntry.webrtcConfirmed = false;
        webrtcPlayingOnStage = false;
        openReceiverStage(msg.title || `${peerEntry.deviceName} Mirroring`);
        break;
      }

      case 'cast-frame': {
        handleIncomingFrame(msg);
        break;
      }

      case 'webrtc-confirmed': {
        peerEntry.webrtcConfirmed = true;
        break;
      }

      case 'cast-stop': {
        toast(`${peerEntry.deviceName} stopped casting.`);
        closeReceiverStage();
        break;
      }
    }
  }

  function updateConnectionBannerUI() {
    const peers = Array.from(roomPeers.values());
    if (peers.length > 0) {
      const names = peers.map((p) => p.deviceName).join(', ');
      connectionBanner.className = 'connection-banner connected';
      connectionBannerText.innerHTML = `🟢 <strong>Connected with ${escapeHtml(
        names
      )} in Room ${currentPin}!</strong> Tap any Cast button below on either device to start mirroring.`;
      statusDot.className = 'dot ready';
      statusText.textContent = `Linked (${peers.length + 1} Devices)`;
    } else {
      connectionBanner.className = 'connection-banner waiting';
      connectionBannerText.innerHTML = `📲 <strong>Room ${currentPin} Ready:</strong> Scan the QR code with your phone (or enter code <strong>${currentPin}</strong> on your other device) to link them!`;
    }
  }

  // UI Pairing Controls
  btnNewRoomPin.addEventListener('click', () => {
    if (activeCastType) stopSendingCast(true);
    const nextPin = randomPin();
    window.history.replaceState({}, '', `${location.pathname}?pin=${nextPin}`);
    setRoomPin(nextPin);
    toast(`Switched to new Room Code: ${nextPin}`);
  });

  btnCopyLink.addEventListener('click', async () => {
    const url = getInviteUrl(currentPin);
    try {
      await navigator.clipboard.writeText(url);
      toast('Copied room invite link!');
    } catch (_) {
      toast('Invite link: ' + url);
    }
  });

  btnJoinPin.addEventListener('click', () => {
    const val = joinPinInput.value.trim();
    if (!/^\d{4}$/.test(val)) {
      toast('Please enter a 4-digit numeric Room Code.');
      joinPinInput.focus();
      return;
    }
    window.history.replaceState({}, '', `${location.pathname}?pin=${val}`);
    setRoomPin(val);
    toast(`Joined Room ${val}!`);
  });

  joinPinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoinPin.click();
  });

  // ============================================================================
  // 5. RECEIVING STREAM ENGINE (WebRTC + Automatic Live Frame Stream)
  // ============================================================================
  function openReceiverStage(title) {
    liveReceiverStage.classList.remove('hidden');
    liveStreamTitle.textContent = title || 'Live Mirroring';
    statusDot.className = 'dot live';
    statusText.textContent = 'Live Mirroring';
  }

  function showIncomingWebRtcStream(stream) {
    openReceiverStage(liveStreamTitle.textContent || 'Live Mirroring');
    stageImage.classList.add('hidden');
    stageVideo.classList.remove('hidden');

    stageVideo.srcObject = stream;
    stageVideo.muted = false;

    const p = stageVideo.play();
    if (p !== undefined) {
      p.then(() => {
        btnUnmuteOverlay.classList.add('hidden');
        updateStageMuteLabel();
      }).catch(() => {
        stageVideo.muted = true;
        stageVideo.play().catch(() => {});
        btnUnmuteOverlay.classList.remove('hidden');
        updateStageMuteLabel();
      });
    }

    stageVideo.onloadedmetadata = () => {
      if (stageVideo.videoWidth > 0) {
        webrtcPlayingOnStage = true;
        publishToRoom({ type: 'webrtc-confirmed' });
      }
    };
  }

  function handleIncomingFrame(msg) {
    if (!msg || !msg.dataUrl) return;
    if (
      webrtcPlayingOnStage &&
      !stageVideo.classList.contains('hidden') &&
      stageVideo.videoWidth > 0
    ) {
      publishToRoom({ type: 'webrtc-confirmed' });
      return;
    }

    openReceiverStage(msg.title || 'Live Mirroring');
    stageVideo.classList.add('hidden');
    stageImage.classList.remove('hidden');
    stageImage.src = msg.dataUrl;
  }

  function closeReceiverStage() {
    webrtcPlayingOnStage = false;
    stageVideo.pause();
    stageVideo.srcObject = null;
    stageImage.src = '';
    liveReceiverStage.classList.add('hidden');
    statusDot.className = 'dot ready';
    statusText.textContent = `Room ${currentPin} Ready`;
  }

  // Stage Controls
  function updateStageMuteLabel() {
    btnStageMute.textContent = stageVideo.muted ? '🔇 Muted' : '🔊 Audio On';
  }

  btnUnmuteOverlay.addEventListener('click', () => {
    stageVideo.muted = false;
    stageVideo.play().catch(() => {});
    btnUnmuteOverlay.classList.add('hidden');
    updateStageMuteLabel();
  });

  btnStageMute.addEventListener('click', () => {
    stageVideo.muted = !stageVideo.muted;
    if (!stageVideo.muted) {
      stageVideo.play().catch(() => {});
      btnUnmuteOverlay.classList.add('hidden');
    }
    updateStageMuteLabel();
  });

  function applyStageTransform() {
    const flip = stageMirrored ? -1 : 1;
    const t = `rotate(${stageRotation}deg) scaleX(${flip})`;
    stageVideo.style.transform = t;
    stageImage.style.transform = t;

    const fit = stageFill ? 'cover' : 'contain';
    stageVideo.style.objectFit = fit;
    stageImage.style.objectFit = fit;
  }

  btnStageRotate.addEventListener('click', () => {
    stageRotation = (stageRotation + 90) % 360;
    applyStageTransform();
  });

  btnStageFit.addEventListener('click', () => {
    stageFill = !stageFill;
    btnStageFit.textContent = stageFill ? '📐 Fill' : '📐 Fit';
    applyStageTransform();
  });

  btnStageMirror.addEventListener('click', () => {
    stageMirrored = !stageMirrored;
    applyStageTransform();
  });

  btnStageSnapshot.addEventListener('click', () => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!stageVideo.classList.contains('hidden') && stageVideo.videoWidth) {
      c.width = stageVideo.videoWidth;
      c.height = stageVideo.videoHeight;
      ctx.drawImage(stageVideo, 0, 0);
    } else if (!stageImage.classList.contains('hidden') && stageImage.naturalWidth) {
      c.width = stageImage.naturalWidth;
      c.height = stageImage.naturalHeight;
      ctx.drawImage(stageImage, 0, 0);
    } else {
      toast('No active stream to capture.');
      return;
    }
    const a = document.createElement('a');
    a.download = `miracastr-${currentPin}-${Date.now()}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
    toast('📸 Screenshot saved!');
  });

  btnStageFullscreen.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await videoStageContainer.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {}
  });

  btnStageClose.addEventListener('click', closeReceiverStage);

  // ============================================================================
  // 6. SENDING / BROADCASTING ENGINE
  // ============================================================================
  function initiateStreamToPeer(peerEntry) {
    if (!activeCastType) return;

    publishToRoom({
      type: 'cast-start',
      title: activeCastTitle,
    });

    if (activeCastType === 'photo' && currentPhotoDataUrl) {
      publishToRoom({
        type: 'cast-frame',
        title: activeCastTitle,
        dataUrl: currentPhotoDataUrl,
      });
    }

    if (activeLocalStream && myPeer && peerEntry.peerJsId) {
      try {
        const call = myPeer.call(peerEntry.peerJsId, activeLocalStream);
        if (call) activeMediaCalls.set(peerEntry.clientId, call);
      } catch (_) {}
    }
  }

  function startBroadcastSession(stream, castType, title) {
    closeReceiverStage();
    activeLocalStream = stream;
    activeCastType = castType;
    activeCastTitle = title;

    activeSenderPanel.classList.remove('hidden');
    activeSenderStatusTitle.textContent = `🔴 LIVE — ${title} (Room ${currentPin})`;
    btnFlipCamera.classList.toggle('hidden', castType !== 'camera');
    btnClearBoard.classList.toggle('hidden', castType !== 'whiteboard');

    if (castType === 'whiteboard' || castType === 'photo') {
      senderPreviewVideo.classList.add('hidden');
      senderWhiteboardCanvas.classList.remove('hidden');
    } else {
      senderWhiteboardCanvas.classList.add('hidden');
      senderPreviewVideo.classList.remove('hidden');
      if (stream) {
        senderPreviewVideo.srcObject = stream;
        senderPreviewVideo.muted = true;
        senderPreviewVideo.play().catch(() => {});
      }
    }

    publishToRoom({
      type: 'cast-start',
      title,
    });

    for (const peerEntry of roomPeers.values()) {
      peerEntry.webrtcConfirmed = false;
      initiateStreamToPeer(peerEntry);
    }

    startContinuousFrameBackup();

    if (stream) {
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          stopSendingCast(true);
        });
      }
    }

    activeSenderPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (roomPeers.size === 0) {
      toast(
        `Casting started! Scan the QR code or enter code ${currentPin} on your other device to watch.`
      );
    } else {
      toast(`Started casting: ${title}`);
    }
  }

  function startContinuousFrameBackup() {
    if (frameRelayInterval) clearInterval(frameRelayInterval);
    const scratch = document.createElement('canvas');
    scratch.width = 854;
    scratch.height = 480;
    const ctx = scratch.getContext('2d');

    frameRelayInterval = setInterval(() => {
      if (!activeCastType) return;

      // Check if all connected peers already confirmed native WebRTC video playback
      const allConfirmed =
        roomPeers.size > 0 &&
        Array.from(roomPeers.values()).every((p) => p.webrtcConfirmed) &&
        activeCastType !== 'whiteboard' &&
        activeCastType !== 'photo';

      if (allConfirmed) return;

      let dataUrl = null;
      if (activeCastType === 'whiteboard' || activeCastType === 'photo') {
        dataUrl = senderWhiteboardCanvas.toDataURL('image/jpeg', 0.65);
      } else if (
        !senderPreviewVideo.classList.contains('hidden') &&
        senderPreviewVideo.readyState >= 2 &&
        senderPreviewVideo.videoWidth > 0
      ) {
        scratch.width = Math.min(854, senderPreviewVideo.videoWidth);
        scratch.height = Math.min(
          480,
          Math.round(
            (scratch.width / senderPreviewVideo.videoWidth) *
              senderPreviewVideo.videoHeight
          )
        );
        ctx.drawImage(senderPreviewVideo, 0, 0, scratch.width, scratch.height);
        dataUrl = scratch.toDataURL('image/jpeg', 0.6);
      }

      if (!dataUrl) return;

      publishToRoom({
        type: 'cast-frame',
        title: activeCastTitle,
        dataUrl,
      });
    }, 140);
  }

  function stopSendingCast(notifyRoom = true) {
    activeCastType = null;
    currentPhotoDataUrl = null;

    if (frameRelayInterval) {
      clearInterval(frameRelayInterval);
      frameRelayInterval = null;
    }
    if (whiteboardClockReq) {
      cancelAnimationFrame(whiteboardClockReq);
      whiteboardClockReq = null;
    }
    if (activeLocalStream) {
      activeLocalStream.getTracks().forEach((t) => t.stop());
      activeLocalStream = null;
    }
    for (const call of activeMediaCalls.values()) {
      try {
        call.close();
      } catch (_) {}
    }
    activeMediaCalls.clear();

    senderPreviewVideo.pause();
    senderPreviewVideo.srcObject = null;
    senderPreviewVideo.src = '';
    activeSenderPanel.classList.add('hidden');

    if (notifyRoom) {
      publishToRoom({ type: 'cast-stop' });
      toast('Stopped casting.');
    }
  }

  btnStopSending.addEventListener('click', () => stopSendingCast(true));

  // ============================================================================
  // 4 CAST BUTTON HANDLERS
  // ============================================================================

  // 1. Share Screen / Window
  btnActionCastScreen.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast(
        'Mobile browsers restrict full-screen tab capture — tap "Share Camera" or "Cast Video/Photo" on mobile!'
      );
      return;
    }
    try {
      stopSendingCast(false);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: true,
      });
      startBroadcastSession(stream, 'screen', `${getDeviceLabel()} Screen`);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        toast('Could not share screen: ' + err.message);
      }
    }
  });

  // 2. Share Camera & Mic
  async function startCameraShare(facing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Camera access requires HTTPS or localhost.');
      return;
    }
    try {
      stopSendingCast(false);
      currentCameraFacing = facing || currentCameraFacing;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentCameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      startBroadcastSession(stream, 'camera', `${getDeviceLabel()} Camera`);
    } catch (err) {
      toast('Camera error: ' + err.message);
    }
  }

  btnActionCastCamera.addEventListener('click', () => startCameraShare(currentCameraFacing));

  btnFlipCamera.addEventListener('click', () => {
    const next = currentCameraFacing === 'environment' ? 'user' : 'environment';
    startCameraShare(next);
  });

  // 3. Cast Video or Photo File
  btnActionCastFile.addEventListener('click', () => {
    mediaFileInput.click();
  });

  mediaFileInput.addEventListener('change', () => {
    const file = mediaFileInput.files && mediaFileInput.files[0];
    if (!file) return;

    stopSendingCast(false);
    const url = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        const ctx = senderWhiteboardCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1280, 720);
        const scale = Math.min(1280 / img.width, 720 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (1280 - w) / 2, (720 - h) / 2, w, h);

        currentPhotoDataUrl = senderWhiteboardCanvas.toDataURL('image/jpeg', 0.8);
        startBroadcastSession(null, 'photo', `Photo: ${file.name}`);
      };
      img.src = url;
    } else if (file.type.startsWith('video/')) {
      senderPreviewVideo.srcObject = null;
      senderPreviewVideo.src = url;
      senderPreviewVideo.muted = false;
      senderPreviewVideo.play().catch(() => {});

      let captured = null;
      if (typeof senderPreviewVideo.captureStream === 'function') {
        try {
          captured = senderPreviewVideo.captureStream();
        } catch (_) {}
      }
      startBroadcastSession(captured, 'file', `Video: ${file.name}`);
      senderPreviewVideo.srcObject = null;
      senderPreviewVideo.src = url;
      senderPreviewVideo.play().catch(() => {});
    }
  });

  // 4. Live Interactive Whiteboard / Test Stream
  let drawing = false;
  let prevX = 0;
  let prevY = 0;

  function clearWhiteboardPad() {
    const ctx = senderWhiteboardCanvas.getContext('2d');
    const w = senderWhiteboardCanvas.width;
    const h = senderWhiteboardCanvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('MiraCastR Live Wireless Stream', 50, 130);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '26px sans-serif';
    ctx.fillText('Draw below with your finger or mouse to mirror in real time!', 50, 180);
  }

  btnActionCastWhiteboard.addEventListener('click', () => {
    stopSendingCast(false);
    clearWhiteboardPad();

    let stream = null;
    if (typeof senderWhiteboardCanvas.captureStream === 'function') {
      try {
        stream = senderWhiteboardCanvas.captureStream(30);
      } catch (_) {}
    }

    startBroadcastSession(stream, 'whiteboard', 'Live Interactive Draw');

    const ctx = senderWhiteboardCanvas.getContext('2d');
    const tick = () => {
      if (activeCastType !== 'whiteboard') return;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(50, 24, 420, 52);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`LIVE ROOM ${currentPin} • ${new Date().toLocaleTimeString()}`, 66, 58);
      whiteboardClockReq = requestAnimationFrame(tick);
    };
    whiteboardClockReq = requestAnimationFrame(tick);
  });

  btnClearBoard.addEventListener('click', clearWhiteboardPad);

  function getPadCoords(e) {
    const rect = senderWhiteboardCanvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((cx - rect.left) / rect.width) * senderWhiteboardCanvas.width,
      y: ((cy - rect.top) / rect.height) * senderWhiteboardCanvas.height,
    };
  }

  senderWhiteboardCanvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    const pt = getPadCoords(e);
    prevX = pt.x;
    prevY = pt.y;
  });

  senderWhiteboardCanvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const pt = getPadCoords(e);
    const ctx = senderWhiteboardCanvas.getContext('2d');
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    prevX = pt.x;
    prevY = pt.y;
  });

  window.addEventListener('pointerup', () => {
    drawing = false;
  });

  // ============================================================================
  // BOOTSTRAP
  // ============================================================================
  const params = new URLSearchParams(location.search);
  const urlPin = params.get('pin');
  const startPin = urlPin && /^\d{4}$/.test(urlPin) ? urlPin : randomPin();

  setRoomPin(startPin);
  initPeerJs();
  initCloudRoomBus();
  detectLocalServer();
})();

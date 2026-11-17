(() => {
  // DOM Elements
  const connDot = document.getElementById('connDot');
  const connStatusText = document.getElementById('connStatusText');
  const headerRoomPin = document.getElementById('headerRoomPin');
  const stagePinValue = document.getElementById('stagePinValue');
  const castCardPinLabel = document.getElementById('castCardPinLabel');
  const deviceNameInput = document.getElementById('deviceNameInput');

  const stageViewport = document.getElementById('stageViewport');
  const stagePlaceholder = document.getElementById('stagePlaceholder');
  const remoteVideo = document.getElementById('remoteVideo');
  const remoteCanvasImg = document.getElementById('remoteCanvasImg');
  const pointerOverlay = document.getElementById('pointerOverlay');

  const streamSourceBadge = document.getElementById('streamSourceBadge');
  const hudBroadcasterText = document.getElementById('hudBroadcasterText');
  const hudStatsBadge = document.getElementById('hudStatsBadge');
  const hudResolution = document.getElementById('hudResolution');
  const hudFps = document.getElementById('hudFps');
  const hudBitrate = document.getElementById('hudBitrate');

  const btnReconnectStream = document.getElementById('btnReconnectStream');
  const btnStopBroadcastTop = document.getElementById('btnStopBroadcastTop');
  const btnStopBroadcastBottom = document.getElementById('btnStopBroadcastBottom');
  const btnQuickCastScreen = document.getElementById('btnQuickCastScreen');
  const btnQuickCastTest = document.getElementById('btnQuickCastTest');

  const btnToggleMute = document.getElementById('btnToggleMute');
  const btnRotate = document.getElementById('btnRotate');
  const btnScaleMode = document.getElementById('btnScaleMode');
  const btnFlipMirror = document.getElementById('btnFlipMirror');
  const btnTogglePointer = document.getElementById('btnTogglePointer');
  const btnScreenshot = document.getElementById('btnScreenshot');
  const btnPip = document.getElementById('btnPip');
  const btnFullscreen = document.getElementById('btnFullscreen');

  const httpsNoticeBanner = document.getElementById('httpsNoticeBanner');
  const btnSwitchToHttps = document.getElementById('btnSwitchToHttps');
  const selectQuality = document.getElementById('selectQuality');
  const selectCameraFacing = document.getElementById('selectCameraFacing');
  const chkIncludeAudio = document.getElementById('chkIncludeAudio');

  const btnCastScreen = document.getElementById('btnCastScreen');
  const btnCastCamera = document.getElementById('btnCastCamera');
  const btnCastFileTrigger = document.getElementById('btnCastFileTrigger');
  const btnCastWhiteboard = document.getElementById('btnCastWhiteboard');
  const fileCastInput = document.getElementById('fileCastInput');

  const localCanvasBox = document.getElementById('localCanvasBox');
  const localCastCanvas = document.getElementById('localCastCanvas');
  const localFileVideo = document.getElementById('localFileVideo');
  const btnClearWhiteboard = document.getElementById('btnClearWhiteboard');

  const pinInput = document.getElementById('pinInput');
  const btnJoinPin = document.getElementById('btnJoinPin');
  const btnNewPin = document.getElementById('btnNewPin');
  const lanIpRow = document.getElementById('lanIpRow');
  const qrProtocolRow = document.getElementById('qrProtocolRow');
  const selectLanIp = document.getElementById('selectLanIp');
  const selectQrProtocol = document.getElementById('selectQrProtocol');
  const qrImage = document.getElementById('qrImage');
  const shareUrlText = document.getElementById('shareUrlText');
  const btnCopyUrl = document.getElementById('btnCopyUrl');

  const peerCountBadge = document.getElementById('peerCountBadge');
  const peerList = document.getElementById('peerList');
  const lobbyRoomList = document.getElementById('lobbyRoomList');

  const clipboardInput = document.getElementById('clipboardInput');
  const btnSendClipboard = document.getElementById('btnSendClipboard');
  const clipboardHistory = document.getElementById('clipboardHistory');

  const winMiracastCard = document.getElementById('winMiracastCard');
  const btnWinConnect = document.getElementById('btnWinConnect');
  const btnWinProject = document.getElementById('btnWinProject');
  const toastContainer = document.getElementById('toastContainer');

  // Application State
  let backendMode = 'detecting'; // 'local-ws' | 'cloud-p2p'
  let ws = null;
  let myPeerId = `peer_${Math.random().toString(36).slice(2, 10)}`;
  let currentPin = null;
  let serverInfo = null;
  let isBroadcaster = false;
  let activeStreamMode = null; // 'webrtc' | 'canvas'
  let localMediaStream = null;
  let canvasInterval = null;

  // Cloud P2P (Netlify / Static Host) PeerJS State
  let peerJsInstance = null;
  let peerJsClientConn = null;
  let isCloudRoomHost = false;
  const cloudHubRoom = {
    pin: null,
    broadcasterId: null,
    broadcasterName: null,
    streamMode: null,
    peers: new Map(), // peerId -> { id, name, deviceType, role, conn (null for host itself) }
  };

  // WebRTC PeerConnections: Map<remotePeerId, RTCPeerConnection>
  const peerConnections = new Map();
  let viewerPc = null;
  let statsTimer = null;
  let lastBytesReceived = 0;
  let lastStatsTimestamp = 0;

  // Stage Transform State
  let rotationDeg = 0;
  let isFillMode = false;
  let isMirrored = false;
  let isPointerMode = false;

  // Remote Laser Pointers: Map<peerId, { x, y, name, updatedAt, click }>
  const remotePointers = new Map();

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  };

  function showToast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3600);
  }

  function detectDeviceInfo() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return { type: 'mobile', name: 'Android Phone' };
    if (/ipad|iphone|ipod/i.test(ua)) return { type: 'mobile', name: 'iPhone / iPad' };
    if (/macintosh|mac os x/i.test(ua)) return { type: 'desktop', name: 'Mac Desktop' };
    if (/windows/i.test(ua)) return { type: 'desktop', name: 'Windows PC' };
    return { type: 'desktop', name: 'Wireless Display' };
  }

  const deviceInfo = detectDeviceInfo();
  const savedName = localStorage.getItem('miracastr_device_name') || deviceInfo.name;
  deviceNameInput.value = savedName;

  deviceNameInput.addEventListener('change', () => {
    const val = deviceNameInput.value.trim() || deviceInfo.name;
    localStorage.setItem('miracastr_device_name', val);
    if (currentPin) joinRoom(currentPin);
  });

  function checkSecureContextNotice() {
    const isLocalhost =
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      httpsNoticeBanner.classList.remove('hidden');
      updateHttpsUpgradeLink();
    } else {
      httpsNoticeBanner.classList.add('hidden');
    }

    if (!isLocalhost) {
      winMiracastCard.classList.add('hidden');
    }
  }

  function updateHttpsUpgradeLink() {
    const httpsPort = serverInfo ? serverInfo.httpsPort : 3443;
    const pinParam = currentPin ? `?pin=${encodeURIComponent(currentPin)}` : '';
    btnSwitchToHttps.href = `https://${location.hostname}:${httpsPort}/${pinParam}`;
  }

  // ============================================================================
  // DUAL-ENGINE INITIALIZATION: LOCAL NODE SERVER vs NETLIFY CLOUD P2P
  // ============================================================================
  async function initializeBackend() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('/api/info', { signal: controller.signal });
      clearTimeout(timeout);

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        serverInfo = await res.json();
        if (serverInfo && serverInfo.httpPort) {
          backendMode = 'local-ws';
          setupLocalServerUi();
          connectLocalWebSocket();
          return;
        }
      }
    } catch (_) {
      // /api/info not available -> running on Netlify or static host
    }

    // Fallback to Cloud P2P Mode (Netlify / Static Hosting)
    backendMode = 'cloud-p2p';
    setupCloudP2pUi();
    const params = new URLSearchParams(location.search);
    const initialPin =
      params.get('pin') || String(Math.floor(1000 + Math.random() * 9000));
    joinRoom(initialPin);
  }

  function setupLocalServerUi() {
    selectLanIp.innerHTML = '';
    if (serverInfo.addresses && serverInfo.addresses.length > 0) {
      serverInfo.addresses.forEach((addr) => {
        const opt = document.createElement('option');
        opt.value = addr.address;
        opt.textContent = `${addr.address} (${addr.name})`;
        selectLanIp.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = location.hostname;
      opt.textContent = location.hostname;
      selectLanIp.appendChild(opt);
    }

    updatePairingQrAndUrl();
    updateHttpsUpgradeLink();
    renderLobbyRooms(serverInfo.rooms || []);
  }

  function setupCloudP2pUi() {
    if (lanIpRow) lanIpRow.classList.add('hidden');
    if (qrProtocolRow) qrProtocolRow.classList.add('hidden');
    winMiracastCard.classList.add('hidden');
    httpsNoticeBanner.classList.add('hidden');
    lobbyRoomList.innerHTML = `<div class="card-desc">Cloud P2P Mode active — enter any 4-digit PIN above or scan the QR code to pair devices anywhere.</div>`;
  }

  function updatePairingQrAndUrl() {
    const pinSuffix = currentPin ? `?pin=${encodeURIComponent(currentPin)}` : '';

    if (backendMode === 'local-ws' && serverInfo) {
      const ip = selectLanIp.value || serverInfo.primaryIp || location.hostname;
      const proto = selectQrProtocol.value || 'http';
      const port = proto === 'https' ? serverInfo.httpsPort : serverInfo.httpPort;
      const fullUrl = `${proto}://${ip}:${port}/${pinSuffix}`;

      shareUrlText.textContent = fullUrl;
      qrImage.src = `/api/qr?url=${encodeURIComponent(fullUrl)}`;
    } else {
      const fullUrl = `${location.origin}${location.pathname}${pinSuffix}`;
      shareUrlText.textContent = fullUrl;
      qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
        fullUrl
      )}`;
    }
  }

  selectLanIp.addEventListener('change', updatePairingQrAndUrl);
  selectQrProtocol.addEventListener('change', updatePairingQrAndUrl);

  btnCopyUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrlText.textContent);
      showToast('Pairing link copied to clipboard!');
    } catch (_) {
      showToast('Copy URL: ' + shareUrlText.textContent);
    }
  });

  // ============================================================================
  // SIGNALING TRANSPORT LAYER (Supports both Local WS and Netlify PeerJS P2P)
  // ============================================================================
  function connectLocalWebSocket() {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProto}//${location.host}`);

    ws.addEventListener('open', () => {
      connDot.className = 'status-dot online';
      connStatusText.textContent = 'Wi-Fi Ready';

      const params = new URLSearchParams(location.search);
      const urlPin = params.get('pin');
      joinRoom(urlPin || currentPin || '');
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      handleSignalingMessage(msg);
    });

    ws.addEventListener('close', () => {
      connDot.className = 'status-dot';
      connStatusText.textContent = 'Reconnecting...';
      setTimeout(connectLocalWebSocket, 1800);
    });
  }

  function sendWs(payload) {
    if (backendMode === 'local-ws') {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    } else if (backendMode === 'cloud-p2p') {
      sendCloudP2pSignal(payload);
    }
  }

  function joinRoom(pin) {
    const cleanPin =
      pin && /^\d{4,6}$/.test(String(pin).trim())
        ? String(pin).trim()
        : String(Math.floor(1000 + Math.random() * 9000));

    if (backendMode === 'local-ws') {
      sendWs({
        type: 'create-or-join',
        pin: cleanPin,
        name: deviceNameInput.value.trim() || deviceInfo.name,
        deviceType: deviceInfo.type,
      });
    } else if (backendMode === 'cloud-p2p') {
      joinCloudP2pRoom(cleanPin);
    }
  }

  // ============================================================================
  // NETLIFY / CLOUD P2P ROOM COORDINATOR (PeerJS Deterministic PIN Hub)
  // ============================================================================
  function cleanupCloudPeer() {
    if (peerJsClientConn) {
      try {
        peerJsClientConn.close();
      } catch (_) {}
      peerJsClientConn = null;
    }
    if (peerJsInstance) {
      try {
        peerJsInstance.destroy();
      } catch (_) {}
      peerJsInstance = null;
    }
    isCloudRoomHost = false;
    cloudHubRoom.peers.clear();
    cloudHubRoom.broadcasterId = null;
    cloudHubRoom.broadcasterName = null;
    cloudHubRoom.streamMode = null;
  }

  function joinCloudP2pRoom(pin) {
    if (typeof window.Peer !== 'function') {
      connStatusText.textContent = 'Loading P2P Engine...';
      setTimeout(() => joinCloudP2pRoom(pin), 500);
      return;
    }

    cleanupCloudPeer();
    connDot.className = 'status-dot';
    connStatusText.textContent = `Joining PIN ${pin}...`;

    const hubPeerId = `miracasr-hub-v1-${pin}`;
    const myName = deviceNameInput.value.trim() || deviceInfo.name;

    // Attempt to become the Room Host for this 4-digit PIN
    const candidateHost = new window.Peer(hubPeerId, { config: RTC_CONFIG });

    candidateHost.on('open', () => {
      // We are the first device in this PIN room -> act as Room Host
      peerJsInstance = candidateHost;
      isCloudRoomHost = true;
      myPeerId = hubPeerId;
      cloudHubRoom.pin = pin;

      cloudHubRoom.peers.set(myPeerId, {
        id: myPeerId,
        name: myName,
        deviceType: deviceInfo.type,
        role: 'viewer',
        conn: null,
      });

      connDot.className = 'status-dot online';
      connStatusText.textContent = 'Cloud P2P Ready';

      handleSignalingMessage({
        type: 'joined-room',
        pin,
        peerId: myPeerId,
        broadcasterId: null,
        broadcasterName: null,
        streamMode: null,
      });

      broadcastCloudHubState();

      // Accept incoming PeerJS DataConnections from other devices joining this PIN
      candidateHost.on('connection', (conn) => {
        setupCloudHostClientConnection(conn);
      });
    });

    candidateHost.on('error', (err) => {
      if (err && err.type === 'unavailable-id') {
        // Another device is already hosting this PIN room -> connect to it as a Client!
        try {
          candidateHost.destroy();
        } catch (_) {}
        connectAsCloudRoomClient(pin, hubPeerId);
      } else {
        console.warn('PeerJS notice:', err);
      }
    });
  }

  function connectAsCloudRoomClient(pin, hubPeerId) {
    isCloudRoomHost = false;
    const clientPeer = new window.Peer({ config: RTC_CONFIG });
    peerJsInstance = clientPeer;

    clientPeer.on('open', (assignedId) => {
      myPeerId = assignedId;
      const conn = clientPeer.connect(hubPeerId, { reliable: true });
      peerJsClientConn = conn;

      conn.on('open', () => {
        connDot.className = 'status-dot online';
        connStatusText.textContent = 'Cloud P2P Connected';

        conn.send({
          type: 'create-or-join',
          pin,
          name: deviceNameInput.value.trim() || deviceInfo.name,
          deviceType: deviceInfo.type,
        });
      });

      conn.on('data', (data) => {
        if (data && typeof data === 'object') {
          handleSignalingMessage(data);
        }
      });

      conn.on('close', () => {
        showToast('Room host disconnected — re-establishing room...');
        setTimeout(() => joinCloudP2pRoom(pin), 1000);
      });
    });
  }

  function setupCloudHostClientConnection(conn) {
    const remoteId = conn.peer;

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      processCloudHubMessage(remoteId, msg, conn);
    });

    conn.on('close', () => {
      cloudHubRoom.peers.delete(remoteId);
      if (cloudHubRoom.broadcasterId === remoteId) {
        cloudHubRoom.broadcasterId = null;
        cloudHubRoom.broadcasterName = null;
        cloudHubRoom.streamMode = null;
        sendToAllCloudPeers(null, {
          type: 'broadcaster-stopped',
          broadcasterId: remoteId,
        });
      }
      broadcastCloudHubState();
    });
  }

  function sendCloudP2pSignal(payload) {
    if (isCloudRoomHost) {
      processCloudHubMessage(myPeerId, payload, null);
    } else if (peerJsClientConn && peerJsClientConn.open) {
      peerJsClientConn.send(payload);
    }
  }

  function sendToCloudPeer(targetId, payload) {
    if (targetId === myPeerId) {
      handleSignalingMessage(payload);
      return;
    }
    const peer = cloudHubRoom.peers.get(targetId);
    if (peer && peer.conn && peer.conn.open) {
      peer.conn.send(payload);
    }
  }

  function sendToAllCloudPeers(excludeId, payload) {
    for (const [id, peer] of cloudHubRoom.peers.entries()) {
      if (id === excludeId) continue;
      sendToCloudPeer(id, payload);
    }
  }

  function broadcastCloudHubState() {
    const peersList = Array.from(cloudHubRoom.peers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      deviceType: p.deviceType,
      role: p.role,
    }));

    sendToAllCloudPeers(null, {
      type: 'room-state',
      pin: cloudHubRoom.pin,
      broadcasterId: cloudHubRoom.broadcasterId,
      broadcasterName: cloudHubRoom.broadcasterName,
      streamMode: cloudHubRoom.streamMode,
      peers: peersList,
    });
  }

  function processCloudHubMessage(senderId, msg, senderConn) {
    switch (msg.type) {
      case 'create-or-join': {
        const peerObj = {
          id: senderId,
          name: (msg.name || 'Wireless Device').slice(0, 40),
          deviceType: msg.deviceType || 'desktop',
          role: 'viewer',
          conn: senderConn,
        };
        cloudHubRoom.peers.set(senderId, peerObj);

        sendToCloudPeer(senderId, {
          type: 'joined-room',
          pin: cloudHubRoom.pin,
          peerId: senderId,
          broadcasterId: cloudHubRoom.broadcasterId,
          broadcasterName: cloudHubRoom.broadcasterName,
          streamMode: cloudHubRoom.streamMode,
        });

        if (cloudHubRoom.broadcasterId && cloudHubRoom.broadcasterId !== senderId) {
          sendToCloudPeer(cloudHubRoom.broadcasterId, {
            type: 'viewer-ready',
            viewerId: senderId,
            viewerName: peerObj.name,
            viewerDeviceType: peerObj.deviceType,
          });
        }

        broadcastCloudHubState();
        break;
      }

      case 'start-broadcast': {
        const sender = cloudHubRoom.peers.get(senderId);
        if (!sender) break;

        if (cloudHubRoom.broadcasterId && cloudHubRoom.broadcasterId !== senderId) {
          const prev = cloudHubRoom.peers.get(cloudHubRoom.broadcasterId);
          if (prev) prev.role = 'viewer';
          sendToCloudPeer(cloudHubRoom.broadcasterId, {
            type: 'broadcast-superseded',
            byName: sender.name,
          });
        }

        sender.role = 'broadcaster';
        cloudHubRoom.broadcasterId = senderId;
        cloudHubRoom.broadcasterName = sender.name;
        cloudHubRoom.streamMode = msg.streamMode || 'webrtc';

        broadcastCloudHubState();

        for (const [otherId, otherPeer] of cloudHubRoom.peers.entries()) {
          if (otherId !== senderId) {
            otherPeer.role = 'viewer';
            sendToCloudPeer(otherId, {
              type: 'broadcaster-started',
              broadcasterId: senderId,
              broadcasterName: sender.name,
              streamMode: cloudHubRoom.streamMode,
            });
            sendToCloudPeer(senderId, {
              type: 'viewer-ready',
              viewerId: otherId,
              viewerName: otherPeer.name,
              viewerDeviceType: otherPeer.deviceType,
            });
          }
        }
        break;
      }

      case 'stop-broadcast': {
        if (cloudHubRoom.broadcasterId === senderId) {
          const sender = cloudHubRoom.peers.get(senderId);
          if (sender) sender.role = 'viewer';
          cloudHubRoom.broadcasterId = null;
          cloudHubRoom.broadcasterName = null;
          cloudHubRoom.streamMode = null;

          sendToAllCloudPeers(senderId, {
            type: 'broadcaster-stopped',
            broadcasterId: senderId,
          });
          broadcastCloudHubState();
        }
        break;
      }

      case 'webrtc-signal': {
        const sender = cloudHubRoom.peers.get(senderId);
        sendToCloudPeer(msg.targetId, {
          type: 'webrtc-signal',
          fromId: senderId,
          fromName: sender ? sender.name : 'Peer',
          signal: msg.signal,
        });
        break;
      }

      case 'request-stream': {
        const viewer = cloudHubRoom.peers.get(senderId);
        if (cloudHubRoom.broadcasterId && viewer) {
          sendToCloudPeer(cloudHubRoom.broadcasterId, {
            type: 'viewer-ready',
            viewerId: senderId,
            viewerName: viewer.name,
            viewerDeviceType: viewer.deviceType,
          });
        }
        break;
      }

      case 'canvas-frame': {
        if (cloudHubRoom.broadcasterId !== senderId) break;
        sendToAllCloudPeers(senderId, {
          type: 'canvas-frame',
          fromId: senderId,
          dataUrl: msg.dataUrl,
          width: msg.width,
          height: msg.height,
          timestamp: msg.timestamp,
        });
        break;
      }

      case 'pointer-event': {
        const sender = cloudHubRoom.peers.get(senderId);
        sendToAllCloudPeers(senderId, {
          type: 'pointer-event',
          fromId: senderId,
          fromName: sender ? sender.name : 'Viewer',
          x: msg.x,
          y: msg.y,
          active: Boolean(msg.active),
          click: Boolean(msg.click),
        });
        break;
      }

      case 'clipboard-share': {
        const sender = cloudHubRoom.peers.get(senderId);
        sendToAllCloudPeers(senderId, {
          type: 'clipboard-share',
          fromId: senderId,
          fromName: sender ? sender.name : 'Device',
          text: String(msg.text || '').slice(0, 10000),
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  btnJoinPin.addEventListener('click', () => {
    const val = pinInput.value.trim();
    if (!/^\d{4,6}$/.test(val)) {
      showToast('Please enter a 4-to-6 digit numeric PIN');
      return;
    }
    joinRoom(val);
  });

  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoinPin.click();
  });

  btnNewPin.addEventListener('click', () => {
    if (isBroadcaster) stopBroadcasting();
    const randomPin = String(Math.floor(1000 + Math.random() * 9000));
    joinRoom(randomPin);
    showToast(`Switched to new Room PIN: ${randomPin}`);
  });

  function handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'welcome': {
        myPeerId = msg.peerId;
        if (msg.rooms) renderLobbyRooms(msg.rooms);
        break;
      }

      case 'joined-room': {
        currentPin = msg.pin;
        myPeerId = msg.peerId;
        headerRoomPin.textContent = currentPin;
        stagePinValue.textContent = currentPin;
        castCardPinLabel.textContent = currentPin;
        pinInput.value = currentPin;

        const newUrl = `${location.pathname}?pin=${encodeURIComponent(currentPin)}`;
        window.history.replaceState({}, '', newUrl);
        updatePairingQrAndUrl();
        updateHttpsUpgradeLink();

        if (msg.broadcasterId && msg.broadcasterId !== myPeerId) {
          hudBroadcasterText.textContent = `Receiving from ${msg.broadcasterName || 'Caster'}`;
          streamSourceBadge.textContent = 'Live Receiver';
          streamSourceBadge.className = 'role-tag broadcaster';
        } else if (!isBroadcaster) {
          resetReceiverStage();
        }
        break;
      }

      case 'room-state': {
        renderRoomPeers(msg.peers || [], msg.broadcasterId);
        if (!msg.broadcasterId && !isBroadcaster) {
          resetReceiverStage();
        }
        break;
      }

      case 'lobby-rooms': {
        renderLobbyRooms(msg.rooms || []);
        break;
      }

      case 'viewer-ready': {
        if (isBroadcaster && activeStreamMode === 'webrtc' && localMediaStream) {
          createOfferForViewer(msg.viewerId);
        }
        break;
      }

      case 'broadcaster-started': {
        if (isBroadcaster && msg.broadcasterId !== myPeerId) {
          stopBroadcasting(false);
        }
        hudBroadcasterText.textContent = `Live: ${msg.broadcasterName}`;
        streamSourceBadge.textContent = 'Live Stream';
        streamSourceBadge.className = 'role-tag broadcaster';
        connDot.className = 'status-dot live';
        break;
      }

      case 'broadcaster-stopped': {
        if (!isBroadcaster) {
          showToast('Broadcaster ended the stream.');
          resetReceiverStage();
        }
        break;
      }

      case 'broadcast-superseded': {
        stopBroadcasting(false);
        showToast(`${msg.byName} took over broadcasting in this room.`);
        break;
      }

      case 'webrtc-signal': {
        handleWebRtcSignal(msg.fromId, msg.fromName, msg.signal);
        break;
      }

      case 'canvas-frame': {
        if (isBroadcaster) break;
        stagePlaceholder.classList.add('hidden');
        remoteVideo.classList.add('hidden');
        remoteCanvasImg.classList.remove('hidden');
        remoteCanvasImg.src = msg.dataUrl;
        if (msg.width && msg.height) {
          hudStatsBadge.classList.remove('hidden');
          hudResolution.textContent = `${msg.width}x${msg.height}`;
          hudFps.textContent = 'Live Frame';
          hudBitrate.textContent = 'Relay';
        }
        break;
      }

      case 'pointer-event': {
        if (!msg.active) {
          remotePointers.delete(msg.fromId);
        } else {
          remotePointers.set(msg.fromId, {
            x: msg.x,
            y: msg.y,
            name: msg.fromName,
            click: msg.click,
            updatedAt: Date.now(),
          });
        }
        break;
      }

      case 'clipboard-share': {
        addClipboardItem(msg.fromName, msg.text);
        showToast(`📋 New text beamed from ${msg.fromName}`);
        break;
      }
    }
  }

  // Render Connected Peers in Current Room
  function renderRoomPeers(peers, broadcasterId) {
    peerCountBadge.textContent = String(peers.length);
    peerList.innerHTML = '';

    peers.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'peer-item';

      const icon = p.deviceType === 'mobile' ? '📱' : '💻';
      const isMe = p.id === myPeerId ? ' (You)' : '';
      const roleClass = p.id === broadcasterId ? 'broadcaster' : 'viewer';
      const roleLabel = p.id === broadcasterId ? 'Casting' : 'Viewer';

      row.innerHTML = `
        <div class="peer-meta">
          <span>${icon}</span>
          <strong>${escapeHtml(p.name)}${isMe}</strong>
        </div>
        <span class="role-tag ${roleClass}">${roleLabel}</span>
      `;
      peerList.appendChild(row);
    });
  }

  // Render Active Wi-Fi Rooms for 1-Tap Discovery
  function renderLobbyRooms(rooms) {
    if (backendMode === 'cloud-p2p') return;
    lobbyRoomList.innerHTML = '';
    if (!rooms || rooms.length === 0) {
      lobbyRoomList.innerHTML = `<div class="card-desc">No active rooms yet.</div>`;
      return;
    }

    rooms.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'room-item';
      const isCurrent = r.pin === currentPin;
      const statusText = r.broadcasterName
        ? `🔴 Casting: ${escapeHtml(r.broadcasterName)}`
        : `🟢 Waiting (${r.peerCount} device${r.peerCount === 1 ? '' : 's'})`;

      row.innerHTML = `
        <div>
          <strong style="color: #38bdf8; font-family: monospace; font-size: 0.95rem;">PIN ${escapeHtml(r.pin)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${statusText}</div>
        </div>
      `;

      const btn = document.createElement('button');
      btn.className = isCurrent ? 'btn active' : 'btn btn-primary';
      btn.style.padding = '5px 10px';
      btn.style.fontSize = '0.75rem';
      btn.textContent = isCurrent ? 'Connected' : 'Join';
      btn.disabled = isCurrent;
      btn.addEventListener('click', () => joinRoom(r.pin));

      row.appendChild(btn);
      lobbyRoomList.appendChild(row);
    });
  }

  // ============================================================================
  // WEBRTC P2P BROADCASTER & VIEWER ENGINE
  // ============================================================================
  async function createOfferForViewer(viewerId) {
    if (!localMediaStream) return;

    if (peerConnections.has(viewerId)) {
      peerConnections.get(viewerId).close();
      peerConnections.delete(viewerId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.set(viewerId, pc);

    localMediaStream.getTracks().forEach((track) => {
      if (track.kind === 'video' && 'contentHint' in track) {
        track.contentHint = 'detail';
      }
      const sender = pc.addTrack(track, localMediaStream);

      if (track.kind === 'video' && sender.getParameters) {
        try {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = 10_000_000;
          params.encodings[0].maxFramerate = 60;
          sender.setParameters(params).catch(() => {});
        } catch (_) {}
      }
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendWs({
          type: 'webrtc-signal',
          targetId: viewerId,
          signal: { type: 'ice-candidate', candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate },
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendWs({
      type: 'webrtc-signal',
      targetId: viewerId,
      signal: {
        type: 'offer',
        sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      },
    });
  }

  async function handleWebRtcSignal(fromId, fromName, signal) {
    if (!signal) return;

    if (signal.type === 'offer') {
      if (viewerPc) {
        viewerPc.close();
      }
      viewerPc = new RTCPeerConnection(RTC_CONFIG);

      viewerPc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          showWebRtcStreamOnStage(stream, fromName);
        }
      };

      viewerPc.onicecandidate = (e) => {
        if (e.candidate) {
          sendWs({
            type: 'webrtc-signal',
            targetId: fromId,
            signal: { type: 'ice-candidate', candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate },
          });
        }
      };

      await viewerPc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await viewerPc.createAnswer();
      await viewerPc.setLocalDescription(answer);

      sendWs({
        type: 'webrtc-signal',
        targetId: fromId,
        signal: {
          type: 'answer',
          sdp: { type: viewerPc.localDescription.type, sdp: viewerPc.localDescription.sdp },
        },
      });
      startTelemetryPolling(viewerPc);
    } else if (signal.type === 'answer') {
      const pc = peerConnections.get(fromId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      }
    } else if (signal.type === 'ice-candidate') {
      const targetPc = isBroadcaster ? peerConnections.get(fromId) : viewerPc;
      if (targetPc && signal.candidate) {
        try {
          await targetPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (_) {}
      }
    }
  }

  function showWebRtcStreamOnStage(stream, casterName) {
    stagePlaceholder.classList.add('hidden');
    remoteCanvasImg.classList.add('hidden');
    remoteVideo.classList.remove('hidden');

    remoteVideo.srcObject = stream;
    remoteVideo.muted = false;
    remoteVideo.play().catch(() => {
      remoteVideo.muted = true;
      remoteVideo.play().catch(() => {});
      updateMuteButtonLabel();
      showToast('Stream playing (click "Audio On" to unmute sound)');
    });

    updateMuteButtonLabel();
    hudBroadcasterText.textContent = casterName ? `Live: ${casterName}` : 'Live Stream';
    connDot.className = 'status-dot live';
  }

  function startTelemetryPolling(pc) {
    stopTelemetryPolling();
    hudStatsBadge.classList.remove('hidden');
    lastBytesReceived = 0;
    lastStatsTimestamp = Date.now();

    statsTimer = setInterval(async () => {
      if (!pc || pc.connectionState === 'closed') {
        stopTelemetryPolling();
        return;
      }
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            const now = Date.now();
            const bytes = report.bytesReceived || 0;
            const dt = (now - lastStatsTimestamp) / 1000;
            if (dt > 0 && lastBytesReceived > 0) {
              const mbps = (((bytes - lastBytesReceived) * 8) / dt / 1_000_000).toFixed(2);
              hudBitrate.textContent = `${mbps} Mbps`;
            }
            lastBytesReceived = bytes;
            lastStatsTimestamp = now;

            if (report.framesPerSecond) {
              hudFps.textContent = `${Math.round(report.framesPerSecond)} fps`;
            }
          }
        });

        if (remoteVideo.videoWidth && remoteVideo.videoHeight) {
          hudResolution.textContent = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
        }
      } catch (_) {}
    }, 1000);
  }

  function stopTelemetryPolling() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    hudStatsBadge.classList.add('hidden');
  }

  function resetReceiverStage() {
    if (viewerPc) {
      viewerPc.close();
      viewerPc = null;
    }
    stopTelemetryPolling();
    remoteVideo.srcObject = null;
    remoteVideo.classList.add('hidden');
    remoteCanvasImg.classList.add('hidden');
    stagePlaceholder.classList.remove('hidden');

    hudBroadcasterText.textContent = 'Waiting for caster...';
    streamSourceBadge.textContent = 'Ready to Receive';
    streamSourceBadge.className = 'role-tag viewer';
    connDot.className = 'status-dot online';
    btnStopBroadcastTop.classList.add('hidden');
  }

  // ============================================================================
  // SENDER / BROADCAST MODES (Screen, Camera, File, Live Whiteboard)
  // ============================================================================
  function getVideoConstraintsFromPreset() {
    const preset = selectQuality.value;
    if (preset === '1440p30') {
      return { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } };
    }
    if (preset === '1080p30') {
      return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    }
    if (preset === '720p60') {
      return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } };
    }
    return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };
  }

  async function startScreenBroadcast() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      if (!window.isSecureContext) {
        showToast('Switch to Secure HTTPS mode to cast your screen from this device.');
        httpsNoticeBanner.classList.remove('hidden');
        httpsNoticeBanner.scrollIntoView({ behavior: 'smooth' });
      } else {
        showToast(
          'Screen capture API is not supported by this mobile browser tab — try Camera Cast or File Cast below!'
        );
      }
      return;
    }

    try {
      stopBroadcasting(false);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: getVideoConstraintsFromPreset(),
        audio: chkIncludeAudio.checked,
      });

      beginWebRtcBroadcastWithStream(stream, 'Screen Share');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        showToast('Could not start screen share: ' + err.message);
      }
    }
  }

  async function startCameraBroadcast() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Please open an HTTPS link to unlock Camera & Mic on this device.');
      httpsNoticeBanner.classList.remove('hidden');
      return;
    }

    try {
      stopBroadcasting(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...getVideoConstraintsFromPreset(),
          facingMode: selectCameraFacing.value || 'environment',
        },
        audio: chkIncludeAudio.checked,
      });

      beginWebRtcBroadcastWithStream(stream, 'Camera Cast');
    } catch (err) {
      showToast('Camera access error: ' + err.message);
    }
  }

  function beginWebRtcBroadcastWithStream(stream, label) {
    localMediaStream = stream;
    isBroadcaster = true;
    activeStreamMode = 'webrtc';

    stagePlaceholder.classList.add('hidden');
    remoteCanvasImg.classList.add('hidden');
    remoteVideo.classList.remove('hidden');
    remoteVideo.srcObject = stream;
    remoteVideo.muted = true;
    remoteVideo.play().catch(() => {});

    hudBroadcasterText.textContent = `Broadcasting (${label})`;
    streamSourceBadge.textContent = 'You Are Casting';
    streamSourceBadge.className = 'role-tag broadcaster';
    btnStopBroadcastTop.classList.remove('hidden');
    connDot.className = 'status-dot live';

    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => {
        stopBroadcasting(true);
      });
    }

    sendWs({
      type: 'start-broadcast',
      streamMode: 'webrtc',
    });

    showToast(`Started ${label} to Room ${currentPin}`);
  }

  btnCastFileTrigger.addEventListener('click', () => {
    fileCastInput.click();
  });

  fileCastInput.addEventListener('change', () => {
    const file = fileCastInput.files && fileCastInput.files[0];
    if (!file) return;

    stopBroadcasting(false);
    localCanvasBox.classList.remove('hidden');
    const ctx = localCastCanvas.getContext('2d');
    const url = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
      localFileVideo.classList.add('hidden');
      const img = new Image();
      img.onload = () => {
        localCastCanvas.width = 1280;
        localCastCanvas.height = 720;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1280, 720);
        const scale = Math.min(1280 / img.width, 720 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (1280 - w) / 2, (720 - h) / 2, w, h);
        startCanvasOrStreamBroadcast('Photo File Cast');
      };
      img.src = url;
    } else if (file.type.startsWith('video/')) {
      localFileVideo.classList.remove('hidden');
      localFileVideo.src = url;
      localFileVideo.play().catch(() => {});

      const renderLoop = () => {
        if (!isBroadcaster) return;
        if (localFileVideo.readyState >= 2) {
          ctx.drawImage(localFileVideo, 0, 0, localCastCanvas.width, localCastCanvas.height);
        }
        requestAnimationFrame(renderLoop);
      };

      startCanvasOrStreamBroadcast('Video File Cast');
      requestAnimationFrame(renderLoop);
    }
  });

  let wbDrawing = false;
  let wbLastX = 0;
  let wbLastY = 0;
  let testAnimFrame = null;

  function startWhiteboardTestBroadcast() {
    stopBroadcasting(false);
    localCanvasBox.classList.remove('hidden');
    localFileVideo.classList.add('hidden');

    const ctx = localCastCanvas.getContext('2d');
    drawInitialWhiteboardCard(ctx);

    startCanvasOrStreamBroadcast('Live Whiteboard & Test Stream');

    const tick = () => {
      if (!isBroadcaster) return;
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(24, 24, 430, 66);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 430, 66);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 22px monospace';
      const now = new Date();
      const timeStr =
        now.toLocaleTimeString() + '.' + String(now.getMilliseconds()).padStart(3, '0');
      ctx.fillText(`LIVE PIN ${currentPin} • ${timeStr}`, 40, 64);
      ctx.restore();
      testAnimFrame = requestAnimationFrame(tick);
    };
    testAnimFrame = requestAnimationFrame(tick);
  }

  function drawInitialWhiteboardCard(ctx) {
    const w = localCastCanvas.width;
    const h = localCastCanvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('MiraCastR Wireless Display Stream', 48, 160);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px sans-serif';
    ctx.fillText('Draw anywhere on this pad with your mouse or finger to stream live!', 48, 205);
  }

  btnClearWhiteboard.addEventListener('click', () => {
    const ctx = localCastCanvas.getContext('2d');
    drawInitialWhiteboardCard(ctx);
  });

  function getCanvasCoords(e) {
    const rect = localCastCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * localCastCanvas.width,
      y: ((clientY - rect.top) / rect.height) * localCastCanvas.height,
    };
  }

  localCastCanvas.addEventListener('pointerdown', (e) => {
    wbDrawing = true;
    const pt = getCanvasCoords(e);
    wbLastX = pt.x;
    wbLastY = pt.y;
  });

  localCastCanvas.addEventListener('pointermove', (e) => {
    if (!wbDrawing) return;
    const pt = getCanvasCoords(e);
    const ctx = localCastCanvas.getContext('2d');
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wbLastX, wbLastY);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    wbLastX = pt.x;
    wbLastY = pt.y;
  });

  window.addEventListener('pointerup', () => {
    wbDrawing = false;
  });

  function startCanvasOrStreamBroadcast(label) {
    isBroadcaster = true;
    btnStopBroadcastTop.classList.remove('hidden');

    if (typeof localCastCanvas.captureStream === 'function') {
      const stream = localCastCanvas.captureStream(30);
      if (
        !localFileVideo.classList.contains('hidden') &&
        typeof localFileVideo.captureStream === 'function'
      ) {
        try {
          const vidStream = localFileVideo.captureStream();
          vidStream.getAudioTracks().forEach((t) => stream.addTrack(t));
        } catch (_) {}
      }
      beginWebRtcBroadcastWithStream(stream, label);
    } else {
      activeStreamMode = 'canvas';
      sendWs({ type: 'start-broadcast', streamMode: 'canvas' });
    }

    if (canvasInterval) clearInterval(canvasInterval);
    canvasInterval = setInterval(() => {
      if (!isBroadcaster) return;
      if (activeStreamMode === 'canvas') {
        const dataUrl = localCastCanvas.toDataURL('image/jpeg', 0.72);
        sendWs({
          type: 'canvas-frame',
          dataUrl,
          width: localCastCanvas.width,
          height: localCastCanvas.height,
          timestamp: Date.now(),
        });
      }
    }, 80);
  }

  function stopBroadcasting(notifyServer = true) {
    isBroadcaster = false;
    activeStreamMode = null;

    if (testAnimFrame) {
      cancelAnimationFrame(testAnimFrame);
      testAnimFrame = null;
    }
    if (canvasInterval) {
      clearInterval(canvasInterval);
      canvasInterval = null;
    }

    if (localMediaStream) {
      localMediaStream.getTracks().forEach((t) => t.stop());
      localMediaStream = null;
    }

    if (!localFileVideo.paused) {
      localFileVideo.pause();
      localFileVideo.src = '';
    }

    for (const pc of peerConnections.values()) {
      pc.close();
    }
    peerConnections.clear();

    localCanvasBox.classList.add('hidden');
    btnStopBroadcastTop.classList.add('hidden');

    if (notifyServer) {
      sendWs({ type: 'stop-broadcast' });
    }
    resetReceiverStage();
  }

  btnCastScreen.addEventListener('click', startScreenBroadcast);
  btnQuickCastScreen.addEventListener('click', startScreenBroadcast);
  btnCastCamera.addEventListener('click', startCameraBroadcast);
  btnCastWhiteboard.addEventListener('click', startWhiteboardTestBroadcast);
  btnQuickCastTest.addEventListener('click', startWhiteboardTestBroadcast);
  btnStopBroadcastTop.addEventListener('click', () => stopBroadcasting(true));
  btnStopBroadcastBottom.addEventListener('click', () => stopBroadcasting(true));

  btnReconnectStream.addEventListener('click', () => {
    sendWs({ type: 'request-stream' });
    showToast('Requested fresh stream sync from caster...');
  });

  // ============================================================================
  // STAGE CONTROLS: AUDIO, ROTATE, FIT/FILL, MIRROR, LASER POINTER, SNAPSHOT, PIP
  // ============================================================================
  function updateMuteButtonLabel() {
    btnToggleMute.textContent = remoteVideo.muted ? '🔇 Muted' : '🔊 Audio On';
    btnToggleMute.classList.toggle('active', !remoteVideo.muted);
  }

  btnToggleMute.addEventListener('click', () => {
    remoteVideo.muted = !remoteVideo.muted;
    if (!remoteVideo.muted) {
      remoteVideo.play().catch(() => {});
    }
    updateMuteButtonLabel();
  });

  function applyStageTransforms() {
    const scaleX = isMirrored ? -1 : 1;
    const transformStr = `rotate(${rotationDeg}deg) scaleX(${scaleX})`;
    remoteVideo.style.transform = transformStr;
    remoteCanvasImg.style.transform = transformStr;

    const fitMode = isFillMode ? 'cover' : 'contain';
    remoteVideo.style.objectFit = fitMode;
    remoteCanvasImg.style.objectFit = fitMode;
  }

  btnRotate.addEventListener('click', () => {
    rotationDeg = (rotationDeg + 90) % 360;
    applyStageTransforms();
    showToast(`Display rotated to ${rotationDeg}°`);
  });

  btnScaleMode.addEventListener('click', () => {
    isFillMode = !isFillMode;
    btnScaleMode.textContent = isFillMode ? '📐 Fill' : '📐 Fit';
    btnScaleMode.classList.toggle('active', isFillMode);
    applyStageTransforms();
  });

  btnFlipMirror.addEventListener('click', () => {
    isMirrored = !isMirrored;
    btnFlipMirror.classList.toggle('active', isMirrored);
    applyStageTransforms();
  });

  btnTogglePointer.addEventListener('click', () => {
    isPointerMode = !isPointerMode;
    btnTogglePointer.classList.toggle('active', isPointerMode);
    pointerOverlay.classList.toggle('interactive', isPointerMode);
    showToast(
      isPointerMode
        ? 'Laser Pointer ON — move or drag over the display to point on all screens!'
        : 'Laser Pointer OFF'
    );
  });

  btnScreenshot.addEventListener('click', () => {
    const snapCanvas = document.createElement('canvas');
    const ctx = snapCanvas.getContext('2d');

    if (!remoteVideo.classList.contains('hidden') && remoteVideo.videoWidth) {
      snapCanvas.width = remoteVideo.videoWidth;
      snapCanvas.height = remoteVideo.videoHeight;
      ctx.drawImage(remoteVideo, 0, 0);
    } else if (!remoteCanvasImg.classList.contains('hidden') && remoteCanvasImg.naturalWidth) {
      snapCanvas.width = remoteCanvasImg.naturalWidth;
      snapCanvas.height = remoteCanvasImg.naturalHeight;
      ctx.drawImage(remoteCanvasImg, 0, 0);
    } else {
      showToast('No active stream to capture yet.');
      return;
    }

    const link = document.createElement('a');
    link.download = `miracastr-${currentPin || 'capture'}-${Date.now()}.png`;
    link.href = snapCanvas.toDataURL('image/png');
    link.click();
    showToast('📸 Screenshot saved!');
  });

  btnPip.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (!remoteVideo.classList.contains('hidden')) {
        await remoteVideo.requestPictureInPicture();
      } else {
        showToast('Start a live video stream first to open Picture-in-Picture.');
      }
    } catch (err) {
      showToast('PiP not available: ' + err.message);
    }
  });

  btnFullscreen.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await stageViewport.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {}
  });

  // ============================================================================
  // INTERACTIVE LASER POINTER OVERLAY ENGINE
  // ============================================================================
  function sendPointerCoords(e, active, click = false) {
    if (!isPointerMode) return;
    const rect = pointerOverlay.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    remotePointers.set('local', {
      x,
      y,
      name: 'You',
      click,
      updatedAt: Date.now(),
    });

    sendWs({
      type: 'pointer-event',
      x,
      y,
      active,
      click,
    });
  }

  pointerOverlay.addEventListener('pointermove', (e) => sendPointerCoords(e, true, e.buttons > 0));
  pointerOverlay.addEventListener('pointerdown', (e) => sendPointerCoords(e, true, true));
  pointerOverlay.addEventListener('pointerleave', () => {
    remotePointers.delete('local');
    sendWs({ type: 'pointer-event', x: 0, y: 0, active: false });
  });

  function renderPointerOverlayLoop() {
    const w = (pointerOverlay.width = pointerOverlay.clientWidth);
    const h = (pointerOverlay.height = pointerOverlay.clientHeight);
    const ctx = pointerOverlay.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const now = Date.now();
    for (const [id, pt] of remotePointers.entries()) {
      if (now - pt.updatedAt > 2500) {
        remotePointers.delete(id);
        continue;
      }
      const px = pt.x * w;
      const py = pt.y * h;

      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pt.click ? 18 : 11, 0, Math.PI * 2);
      ctx.fillStyle = pt.click ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.35)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(pt.name || 'Pointer', px + 12, py + 4);
      ctx.restore();
    }

    requestAnimationFrame(renderPointerOverlayLoop);
  }
  requestAnimationFrame(renderPointerOverlayLoop);

  // ============================================================================
  // CLIPBOARD BEAM & WINDOWS NATIVE MIRACAST SHORTCUTS
  // ============================================================================
  btnSendClipboard.addEventListener('click', () => {
    const text = clipboardInput.value.trim();
    if (!text) return;
    sendWs({ type: 'clipboard-share', text });
    addClipboardItem('You', text);
    clipboardInput.value = '';
  });

  clipboardInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSendClipboard.click();
  });

  function addClipboardItem(sender, text) {
    const row = document.createElement('div');
    row.className = 'peer-item';
    const isUrl = /^https?:\/\//i.test(text);
    const contentHtml = isUrl
      ? `<a href="${escapeHtml(text)}" target="_blank" rel="noopener" style="color: #38bdf8; word-break: break-all;">${escapeHtml(text)}</a>`
      : `<span style="word-break: break-all;">${escapeHtml(text)}</span>`;

    row.innerHTML = `
      <div style="flex: 1; padding-right: 8px;">
        <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(sender)}</div>
        ${contentHtml}
      </div>
    `;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.style.padding = '4px 8px';
    copyBtn.style.fontSize = '0.72rem';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
      } catch (_) {}
    });

    row.appendChild(copyBtn);
    clipboardHistory.prepend(row);
  }

  async function triggerWinMiracast(action) {
    try {
      const res = await fetch('/api/win-miracast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Opened Windows Wireless Display settings!');
      } else {
        showToast(data.error || 'Could not launch Windows shortcut.');
      }
    } catch (_) {
      showToast('Could not trigger Windows settings.');
    }
  }

  btnWinConnect.addEventListener('click', () => triggerWinMiracast('display-displays'));
  btnWinProject.addEventListener('click', () => triggerWinMiracast('project-settings'));

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initialize App
  checkSecureContextNotice();
  initializeBackend();
})();

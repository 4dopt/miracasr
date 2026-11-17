# MiraCastR (`miracasr`)

**100% Free, Cross-Platform Phone $\leftrightarrow$ PC Wireless Display & Screen Mirroring (Web + Netlify Ready).**

Zero-install on phones, tablets, and PCs — pair in seconds via **QR Code** or **4-Digit Room Code**.

## ✨ Features

- **Simple 2-Step Bi-Directional Room Pairing**:
  - Scan the QR code with your phone or enter the 4-digit Room Code on your second device.
  - Once linked (`🟢 Connected`), **either device can cast to the other** in any order!
- **Triple-Redundant Connection Engine**:
  - **Cloud WSS Room Bus (`MQTT over WSS`)**: Connects devices in `< 200ms` on **Netlify** or any static HTTPS host without firewall blocks or stale ID locks.
  - **WebRTC P2P Media Calls (`PeerJS`)**: Streams high-FPS video + audio directly between devices.
  - **Automatic Live Frame Stream Backup + Local WebSocket (`server.js`)**: Guarantees the picture always displays even behind strict firewalls or offline local Wi-Fi.
- **4 Built-In Casting Modes**:
  1. **🖥️ Share Screen / Window / Tab** *(Desktop PCs & Macs with system/tab audio)*
  2. **📷 Share Camera & Mic** *(All Phones & PCs — includes front/back camera switcher)*
  3. **🎬 Cast Video or Photo** *(All Phones & PCs — stream any video or photo from your gallery)*
  4. **🎨 Live Draw / Interactive Canvas** *(All Phones & PCs — draw with your finger or mouse in real time)*

## 🚀 Quick Start (Local)

```bash
npm install
npm start
```

Or on Windows, double-click **`start-miracastr.bat`**, then open **[http://localhost:3000](http://localhost:3000)**.

## ☁️ Deploying to Netlify

This repository includes [`netlify.toml`](./netlify.toml) pre-configured with `publish = "public"` and SPA routing — simply connect your GitHub repository (`4dopt/miracasr`) to Netlify and deploy!

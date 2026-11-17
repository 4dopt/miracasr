# MiraCastR (`miracasr`)

**100% Free, Cross-Platform Phone $\leftrightarrow$ PC Wireless Display & Screen Mirroring over Local Wi-Fi.**

Zero-install on phones, tablets, and secondary PCs — pair in seconds via **QR Code**, **4-Digit PIN**, or **1-Tap Local Wi-Fi Room Discovery**.

## ✨ Features

- **Instant QR Code & 4-Digit PIN Pairing**: Automatically detects your active LAN/Wi-Fi IPv4 interface and generates a scannable QR code.
- **Bi-Directional Casting (PC $\leftrightarrow$ Phone)**:
  - **Screen / Window / Tab Mirroring**: Low-latency WebRTC P2P streaming up to **1080p/1440p @ 60 FPS** with system/tab audio.
  - **Camera & Mic Casting**: Use your phone as a wireless webcam or document camera on your PC (supports front & rear cameras).
  - **Local Video & Photo File Casting**: Stream local media files from any phone or PC over plain HTTP.
  - **Live Interactive Whiteboard & 60 FPS Test Stream**: Built-in drawing pad and latency benchmark clock.
- **Wireless Display Stage Controls**:
  - **Rotate (`0°` / `90°` / `180°` / `270°`)**, **Fit / Fill**, **Horizontal Mirror**, **Fullscreen**, **Picture-in-Picture (PiP)**, and **PNG Screenshot Capture**.
  - **Live Laser Pointer Overlay**: Highlight areas on the mirrored screen in real time across all connected devices.
  - **Instant Text / URL Beam**: Share links and clipboard snippets across devices in the room.
  - **Windows Native Miracast Bridge**: Quick-launch shortcuts for Windows Wireless Display and *Projecting to this PC* settings.

## 🚀 Quick Start

```bash
npm install
npm start
```

Or on Windows, double-click **`start-miracastr.bat`**.

- **Local PC Dashboard**: `http://localhost:3000`
- **LAN Quick Viewer (HTTP)**: `http://<YOUR_WIFI_IP>:3000`
- **LAN Secure Sender Mode (HTTPS)**: `https://<YOUR_WIFI_IP>:3443`

# Medical365 Local Agent (Phase 1)

The **Medical365 Local Agent** is a lightweight background service running on a dedicated hospital server or PC. It maintains a secure outbound connection with Medical365 Cloud, monitors local MongoDB health, and transmits heartbeats.

---

## Architecture

```
Medical365 Cloud (AWS / Render)
       ▲
       │ Outbound HTTPS / WSS (Port 443 / 3000)
       │ (No inbound ports opened on hospital router)
       ▼
Medical365 Local Agent (Node.js Service)
       ▲
       │ Local Connection (Port 27017)
       ▼
Hospital Local MongoDB
```

---

## Phase 1 Capabilities

- **Local MongoDB Connectivity**: Connects to local MongoDB instance with automatic error detection and reconnection.
- **Hospital/Tenant Binding**: Strictly tied to a single hospital tenant via cryptographic installation identity.
- **Pairing Flow**: Exchanges a short-lived pairing token for a signed, permanent Agent JWT.
- **Secure Outbound Connection**: Agent initiates all communication outwards to the cloud; no incoming ports need to be forwarded.
- **Heartbeat & Telemetry**: Reports health status (`HEALTHY`/`DOWN`), DB ping latency, uptime, and memory usage every 15 seconds.
- **Automatic Reconnection**: Employs exponential backoff with jitter if the internet or local database drops.
- **Local Health API**: Serves `GET http://localhost:4000/health` and `GET http://localhost:4000/status` for local hospital monitoring.

> **CRITICAL NOTE**: Phase 1 is infrastructure only. No patient records, appointments, or clinical data are synchronized in this phase.

---

## Prerequisites

1. **Node.js** (v18.x or later)
2. **MongoDB Community Server** (v6.x or later) installed locally and running on port 27017.

---

## Setup & Running

1. **Copy or extract the `local-agent/` folder** to the hospital server.
2. **Install dependencies**:
   ```bash
   cd local-agent
   npm install
   ```
3. **Configure the agent**:
   - Open Hospital Admin dashboard (`http://<your-cloud-domain>/hospitaladmin/local-sync`).
   - Click **Generate Pairing Token**.
   - Copy the provided `Installation ID`, `Pairing Token`, and `Cloud URL`.
   - Create a `config.json` file in `local-agent/` (or copy `config.example.json`):
   ```json
   {
     "cloudUrl": "http://localhost:3000",
     "installationId": "MED365-LOCAL-XXXXXX",
     "pairingToken": "YOUR_PAIRING_TOKEN",
     "agentToken": null,
     "localMongoUri": "mongodb://localhost:27017/medical365_local",
     "localHealthPort": 4000,
     "heartbeatIntervalMs": 15000,
     "agentName": "Hospital Main Server"
   }
   ```
4. **Start the agent**:
   ```bash
   npm start
   ```
5. **Verify Local Health**:
   In a local browser or terminal on the hospital server:
   ```bash
   curl http://localhost:4000/health
   ```

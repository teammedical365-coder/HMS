# Phase 23 — Local Data Sync & Offline Edge Architecture

## 1. Module Overview

The **Local Data Sync & Offline Edge Architecture** ensures that hospital operations continue uninterrupted during internet service outages, undersea cable severances, or degraded connectivity.

While Medical365 is natively a cloud-first SaaS platform, hospitals deploy an on-premise edge component called the **Local Agent** (`local-agent/`). The agent maintains an active mirror of critical clinical data on a local LAN server running local MongoDB, proxying operations during disconnections and synchronizing state bi-directionally once cloud connectivity restores.

### Key Capabilities
- **Zero-Inbound Port Forwarding (Reverse Tunnel)**: The on-premise agent establishes an outbound persistent WebSocket tunnel (`/tunnel`) to the cloud. No static public IP or open firewall ports are required at the hospital facility.
- **Bi-Directional State Synchronization**:
  - **Cloud $\rightarrow$ Edge**: Central configuration updates, master catalogs, and remote bookings sync down to the local server.
  - **Edge $\rightarrow$ Cloud**: Offline patient registrations, triage records, prescriptions, and payments queue in an edge outbox and upload to the cloud.
- **Optimistic Vector Versioning**: Every entity change carries version metadata (`localVersion`, `cloudVersion`, `baseVersion`) enabling granular conflict detection.
- **Three-Way Conflict Resolution**: Hospital administrators can resolve conflicting modifications via an intuitive UI with three resolution strategies: `KEEP_LOCAL`, `KEEP_CLOUD`, or `MERGED`.
- **Disaster Recovery Rebuild**: In the event of local hardware failure, a fresh local server can be paired and reconstructed from the cloud snapshot in minutes.

---

## 2. Hybrid Edge Architecture

```mermaid
flowchart TD
    subgraph CloudEnv ["Medical365 Cloud Cluster"]
        CloudDB[(Cloud MongoDB)]
        CloudSyncSvc["Cloud Sync Engine (localSync.controller.js)"]
        TunnelHub["WebSocket Tunnel Gateway (/tunnel)"]
        ConflictMgr["Sync Conflict Manager (SyncConflict)"]
    end

    subgraph OutboundLink ["Encrypted Outbound Tunnel (WSS)"]
        Tunnel["Persistent WebSocket Tunnel (No Open Ports Required)"]
    end

    subgraph HospitalLAN ["Hospital On-Premise LAN"]
        LocalAgent["Medical365 Local Agent (local-agent/)"]
        LocalDB[(Local MongoDB - medical365_local)]
        OutboxQueue["Local Outbox Queue (SQLite / Mongo)"]
        LANUsers["Clinical Staff Terminals (OPD, IPD, Billing)"]
    end

    CloudDB <--> CloudSyncSvc
    CloudSyncSvc <--> TunnelHub
    TunnelHub <--> Tunnel
    Tunnel <--> LocalAgent

    LocalAgent <--> LocalDB
    LocalAgent <--> OutboxQueue
    LANUsers <-->|Normal Online Mode| CloudEnv
    LANUsers <-->|Offline Mode (LAN Fallback)| LocalAgent
    
    CloudSyncSvc --> ConflictMgr
```

---

## 3. Data Models & Schemas

### 3.1 Local Installation Model (`server/src/models/localInstallation.model.js`)

Maintained on the Cloud MongoDB to register and monitor on-premise agents:

```javascript
const localInstallationSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    installationId: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, default: 'Hospital Local Server', trim: true },
    agentVersion: { type: String, default: '1.0.0' },
    status: {
        type: String,
        enum: ['NOT_CONFIGURED', 'ONLINE', 'OFFLINE', 'DEGRADED'],
        default: 'NOT_CONFIGURED',
        index: true
    },
    dbStatus: { type: String, enum: ['HEALTHY', 'DOWN', 'UNKNOWN'], default: 'UNKNOWN' },
    cloudConnection: { type: String, enum: ['CONNECTED', 'DISCONNECTED'], default: 'DISCONNECTED' },
    pairingToken: { type: String, default: null },
    pairingTokenExpiresAt: { type: Date, default: null },
    agentTokenHash: { type: String, default: null },
    lastHeartbeat: { type: Date, default: null },
    lastIp: { type: String, default: '' },
    localHealth: {
        dbLatencyMs: { type: Number, default: 0 },
        memoryMb: { type: Number, default: 0 },
        uptimeSeconds: { type: Number, default: 0 },
        nodeVersion: { type: String, default: '' },
        platform: { type: String, default: '' },
        localDbName: { type: String, default: 'medical365_local' }
    },
    syncStatus: {
        initialSync: {
            status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'], default: 'NOT_STARTED' },
            startedAt: Date,
            completedAt: Date,
            progress: {
                Hospital: { total: Number, synced: Number },
                Department: { total: Number, synced: Number },
                Doctor: { total: Number, synced: Number },
                Service: { total: Number, synced: Number },
                Bed: { total: Number, synced: Number },
                Medicine: { total: Number, synced: Number },
                Patient: { total: Number, synced: Number },
                overall: { total: Number, synced: Number, percent: Number }
            }
        },
        lastSyncAt: Date,
        totalRecordsSynced: { type: Number, default: 0 }
    }
}, { timestamps: true });
```

### 3.2 Sync Conflict Model (`server/src/models/syncConflict.model.js`)

Maintained on Cloud MongoDB when concurrent cloud and edge edits occur:

```javascript
const syncConflictSchema = new mongoose.Schema({
    conflictId: { type: String, required: true, unique: true, index: true },
    eventId: { type: String, index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    installationId: { type: String, required: true, index: true },
    entityType: {
        type: String,
        required: true,
        enum: ['Patient', 'Doctor', 'Department', 'Service', 'Bed', 'Medicine', 'Hospital'],
        index: true
    },
    entityId: { type: String, required: true, index: true },
    baseVersion: { type: Number, default: 0 },
    localVersion: { type: Number, required: true },
    cloudVersion: { type: Number, required: true },
    localPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    cloudPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    detectedAt: { type: Date, default: Date.now, index: true },
    status: {
        type: String,
        enum: ['PENDING', 'PENDING_REVIEW', 'RESOLVED', 'DISMISSED', 'RESOLVED_LOCAL', 'RESOLVED_CLOUD', 'RESOLVED_MERGED'],
        default: 'PENDING',
        index: true
    },
    resolutionType: {
        type: String,
        enum: ['KEEP_LOCAL', 'KEEP_CLOUD', 'MERGED', null],
        default: null
    },
    selectedMergeFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolutionNotes: { type: String, default: '' },
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
```

---

## 4. Pairing Handshake & Sync Protocol

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Hospital Admin (Cloud Portal)
    participant Cloud as Medical365 Cloud Server
    participant Agent as On-Premise Local Agent
    participant LocalDB as Local MongoDB

    Admin->>Cloud: POST /api/local-sync/generate-pairing-token
    Cloud-->>Admin: Returns 6-digit one-time token (TTL: 15 mins)
    Admin->>Agent: Runs: npx medical365-agent pair --token=XXXXXX
    Agent->>Cloud: WSS Handshake with Pairing Token
    Cloud->>Cloud: Generates permanent Agent Authentication Secret
    Cloud-->>Agent: Issues Agent Token & Installation UUID
    Agent->>Agent: Stores credentials in encrypted local keystore
    Agent->>LocalDB: Connects to local MongoDB instance
    Agent->>Cloud: Initiates Initial Snapshot Sync (Hospital, Depts, Doctors, Patients)
    Cloud-->>Agent: Streams entity batches; Agent bulk-inserts to LocalDB
    Agent->>Cloud: Initial sync complete; transitions status to "ONLINE"
```

---

## 5. Offline Operation & Conflict Resolution

### 5.1 Offline Local Execution
During an internet blackout:
1. Clinical terminals on the hospital LAN detect cloud unreachability and fall back to the local agent endpoint (`http://192.168.1.X:5000/api`).
2. Operations (Patient Admissions, Vitals, Consultations, Prescription Generation, Cash Billing) execute against `medical365_local`.
3. Every write appends an immutable mutation record into the local **Outbox Queue**.

### 5.2 Reconnection & Conflict Resolution
When internet connectivity is restored:
1. The local agent re-establishes the WebSocket tunnel.
2. The agent drains its Outbox Queue in chronological order.
3. For each entity, if `cloudVersion > baseVersion`, a **Sync Conflict** is triggered:
   - Neither payload overwrites the other automatically.
   - A `SyncConflict` record is created on the cloud.
   - An alert appears in the Hospital Admin Dashboard (`client/src/pages/hospitaladmin/LocalSync.jsx`).
4. **Resolution Strategies**:
   - **`KEEP_LOCAL`**: Edge data overrides cloud attributes; cloud version increments.
   - **`KEEP_CLOUD`**: Edge changes are discarded; local agent downloads the cloud version.
   - **`MERGED`**: Field-by-field merge (e.g., keeping updated local phone number while keeping cloud-added insurance policy).

---

## 6. API Endpoints Catalog (`server/src/routes/localSync.routes.js`)

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/local-sync/pairing-token` | `hospitaladmin` | Generates one-time 15-minute pairing code for agent installation. |
| `GET` | `/api/local-sync/status` | `hospitaladmin` | Returns live health, latency, last heartbeat, and memory metrics of on-premise agent. |
| `GET` | `/api/local-sync/conflicts` | `hospitaladmin` | Lists pending data sync version conflicts. |
| `PUT` | `/api/local-sync/conflicts/:id/resolve` | `hospitaladmin` | Submits conflict resolution (`KEEP_LOCAL`, `KEEP_CLOUD`, `MERGED`). |
| `POST` | `/api/local-sync/trigger-resync` | `hospitaladmin` | Triggers a fresh delta synchronization run. |
| `POST` | `/api/local-sync/disaster-rebuild` | Central Admin | Authorizes complete non-destructive local database rebuild. |


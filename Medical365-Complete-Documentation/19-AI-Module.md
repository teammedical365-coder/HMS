# Phase 19 — AI Clinical Intelligence & AI Wallet Module

## 1. Module Overview

The **AI Clinical Intelligence Module** provides doctors and clinical staff with state-of-the-art diagnostic assistance, automated medical document extraction, multi-modal imaging analysis, comparative scan tracking, and ambient clinical speech transcription (Voice Scribe).

Underpinning the entire AI subsystem is the **AI Wallet Architecture**, which meters consumption on a per-token basis, converts API costs to Indian Rupees (INR), tracks utilization per doctor, and prevents service overdrafts through automated warning thresholds and hard stops.

### Key Capabilities
- **Model Engine**: Powered by Google's **Gemini 2.0 Flash** (`gemini-2.0-flash`), delivering sub-second multimodal inference.
- **Ambient Voice Scribe**: Real-time transcription of multilingual doctor-patient audio consultations (supporting Hindi, English, Hinglish, Tamil, Telugu, etc.) with automatic SOAP note compilation.
- **Computer Vision & Diagnostic Analysis**: Extraction and analysis of X-rays, CT scans, MRIs, pathology slides, and ECG charts.
- **Longitudinal Scan Comparison**: Side-by-side comparative analysis of historical versus current diagnostic reports to track lesion progression or treatment efficacy.
- **Prepaid AI Wallet Protection**: Automatic debiting of token charges, doctor-level consumption dashboards, and proactive balance notifications.

---

## 2. AI Architecture & Pipeline

```mermaid
flowchart TD
    subgraph ClientLayer ["Doctor Console / Client"]
        DocVoice["Audio Consultation (Mic)"]
        DocImage["Scan / Lab Report Upload"]
        DocChat["Clinical Assistant Chat"]
    end

    subgraph ServiceLayer ["Server-Side AI Pipeline"]
        AIService["AIService (ai.service.js)"]
        VoiceScribe["VoiceScribeService (voiceScribe.service.js)"]
        PromptBld["PromptBuilder (promptBuilder.js)"]
        MediaVal["MediaValidator (mediaValidator.js)"]
        GeminiProv["GeminiProvider (gemini-2.0-flash)"]
    end

    subgraph BillingEngine ["AI Wallet Subsystem"]
        WalletCheck{"Wallet Balance > 0?"}
        AIWallet["AIWalletService (aiWallet.service.js)"]
        TokenLedger["Token Consumption Ledger"]
        DoctorTracking["Per-Doctor Usage Map"]
    end

    DocVoice --> VoiceScribe
    DocImage --> MediaVal
    DocChat --> AIService
    
    MediaVal --> PromptBld
    PromptBld --> AIService
    VoiceScribe --> AIService

    AIService --> WalletCheck
    WalletCheck -->|No (Balance <= 0)| ErrLock["Reject: 402 Payment Required"]
    WalletCheck -->|Yes| GeminiProv

    GeminiProv -->|Raw Token Usage| AIWallet
    AIWallet --> TokenLedger
    AIWallet --> DoctorTracking
    GeminiProv -->|Structured Response / SOAP| ClientLayer
```

---

## 3. Core AI Operations (`server/src/services/ai/ai.service.js`)

### 3.1 Ambient Voice Scribe (`voiceScribe.service.js`)

Transcribes spoken multilingual doctor-patient consultations and generates structured clinical summaries:

```json
{
  "transcript": "Full conversation transcript with speaker labels",
  "speakerSegments": [
    { "speaker": "Doctor", "text": "Aapko bukhar kabse hai?", "timestamp": "00:04" },
    { "speaker": "Patient", "text": "Teen din se tez bukhar hai aur badan dard hai.", "timestamp": "00:07" }
  ],
  "detectedLanguages": ["Hindi", "English"],
  "clinicalSummary": {
    "chiefComplaint": ["High fever for 3 days", "Generalized body ache"],
    "historyOfPresentIllness": "Patient reports acute onset high-grade fever...",
    "vitalsMentioned": ["Temp: 102 F"],
    "assessment": ["Acute Febrile Illness — Rule out Dengue/Malaria"],
    "plan": ["CBC, MP test", "Paracetamol 650mg TDS", "Adequate hydration"]
  },
  "soap": {
    "subjective": "3-day history of acute high-grade fever with myalgia...",
    "objective": "Febrile to touch, throat clear...",
    "assessment": "Acute febrile illness, etiology under investigation...",
    "plan": "Order CBC, prescribe antipyretics and rest."
  }
}
```

### 3.2 Medical Document & Report Text Extraction (`extractReportText`)
- Performs high-accuracy optical character recognition (OCR) on lab documents, clinical discharge summaries, and handwritten prescriptions.
- Extracts patient identification, test dates, analyte names, observed values, reference ranges, and unit symbols.

### 3.3 Structured Clinical Summarization (`generateReportSummary`)
- Synthesizes dense multi-page pathology or radiology investigations into concise bullet points.
- Flags abnormal biomarkers (e.g., Elevated Serum Creatinine, Low Platelet Count) with clinical severity ratings (Normal, Borderline, Critical).

### 3.4 Multimodal Medical Imaging Analysis (`analyzeMedia`)
- Evaluates radiographs, MRIs, and ultrasound images.
- Identifies anatomical regions, morphological features, fractures, consolidations, or anomalies.
- Cites confidence levels and suggests differential diagnoses for doctor review.

### 3.5 Longitudinal Report Comparison (`compareReports`)
- Accepts two base64-encoded diagnostic artifacts (e.g., Chest X-Ray from January vs. Chest X-Ray from March).
- Compares changes in lesion dimensions, effusion volumes, or biomarker trajectories, providing a concise interval progress report.

---

## 4. AI Wallet Architecture & Metering

### 4.1 Token-to-Rupee Pricing Engine (`server/src/services/ai/aiWallet.service.js`)

Every AI transaction computes exact API costs using Gemini 2.0 Flash rates converted to INR (`INR_PER_USD = 83`):

$$\text{Total Cost (INR)} = (\text{Prompt Tokens} \times \text{Rate}_{\text{in}} + \text{Candidate Tokens} \times \text{Rate}_{\text{out}}) \times 83$$

### 4.2 AI Wallet Lifecycle & Safeguards

1. **Initial Provisioning**:
   - Each new hospital is automatically provisioned with a **₹2,000 complimentary AI Wallet credit** upon onboarding.
2. **Atomic Ledger Deductions**:
   - Deductions execute atomically via MongoDB `$inc` operations, recording `promptTokens`, `candidateTokens`, `operation`, `model`, and `patientId`.
3. **Doctor-Level Attribution**:
   - Usage is recorded per physician (`byDoctor` map), allowing hospital administrators to audit which departments and doctors utilize AI resources most heavily.
4. **Automated Warning Thresholds**:
   - **Warning Zone (< ₹200)**: API responses include `warningLevel: 'LOW_BALANCE'`, displaying non-intrusive warnings in the doctor console.
   - **Hard Lock (<= ₹0)**: Requests are rejected with `HTTP 402 (Payment Required)`: *"AI Wallet balance exhausted. Please top up to continue using AI features."*
5. **Zero Charge on Failure**:
   - If an AI inference fails due to network or provider errors, `recordFailure` logs the incident without debiting the hospital's wallet balance.

---

## 5. API Endpoints Catalog

### 5.1 AI Processing Endpoints (`server/src/routes/ai.routes.js`)

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/extract-text` | Doctor / Nurse | OCR text extraction from document image or PDF. |
| `POST` | `/api/ai/summarize` | Doctor / Nurse | Clinical summary and abnormal biomarker extraction. |
| `POST` | `/api/ai/analyze-media` | Doctor | Multimodal diagnostic analysis of medical scans. |
| `POST` | `/api/ai/compare-reports` | Doctor | Comparative longitudinal evaluation between two reports. |
| `POST` | `/api/ai/voice-scribe` | Doctor | Audio transcription and SOAP note synthesis. |
| `POST` | `/api/ai/chat` | Doctor | Interactive clinical assistant query. |

### 5.2 AI Wallet Management Endpoints (`server/src/routes/aiWallet.routes.js`)

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/ai-wallet/balance` | `hospitaladmin`, Doctor | Fetches current balance, currency, and warning status. |
| `GET` | `/api/ai-wallet/transactions` | `hospitaladmin` | Paginated transaction ledger with token breakdowns. |
| `GET` | `/api/ai-wallet/doctor-usage` | `hospitaladmin` | Per-doctor AI consumption breakdown and cost attribution. |
| `POST` | `/api/ai-wallet/topup` | Central Admin | Credits funds to a hospital's AI Wallet balance. |


# IPD Clinical Notes, Drug Chart & Wristband UI Fix Report

## Changed Files
| File | Change |
|---|---|
| `client/src/components/ipd/TabletSheetWorkspace.jsx` / `.css` | Removed the zoom dock on the right side. Added the exported `SheetZoomToolbarControls` (− / % / + / Fit to Screen) and an imperative handle (`zoomIn`, `zoomOut`, `resetZoom`, `fitToScreen`). Zoom buttons now step by 5%. Pinch zoom is proportional, capped at 4% per frame and stays anchored to the pinch point. Added Ctrl+wheel zoom. Fit to Screen now fits the whole active A4 sheet (width and height). Hid the native vertical scrollbar so only one scroll rail shows. |
| `client/src/components/ipd/IPDClinicalChartsModal.jsx` / `.css` | Tabs no longer clip or show a scrollbar (`flex-shrink:0`, `overflow-y:hidden`, `line-height:1.4`, `min-height`). Zoom controls are now on the right of the top toolbar. Added an **AI Voice Scribe** button and modal. Microphone permission and recording errors now show a message. Fixed the `micPulse` animation that made the mic button jump. The mic icon is now a fixed size so it no longer clips. |
| `client/src/components/ipd/InpatientClinicalNotesModal.jsx` / `.css` | Zoom controls are now in the top toolbar. Approving an AI summary now **adds a new sequential sheet** instead of merging text into Page 1 and Page 2 (vitals are no longer overwritten). Sheets show the latest recorded vitals and the doctor, date and time. Fixed the mic icon CSS. |
| `client/src/components/ipd/ClinicalVoiceScribeModal.jsx` / `.css` | Each modal open gets a stable session ID. The Approve button is locked while saving, which stops double submits. Microphone errors are shown in a clear way (NotAllowed, NotFound, NotReadable, unsupported). Icons are a fixed size. |
| `client/src/components/ipd/RuledSectionEditor.jsx` | Shows a toast when speech recognition is denied, has no microphone or hits a network error. |
| `client/src/utils/aiClinicalSheetHelper.js` (new) | Formats vitals without inventing values (missing ones show `—`). Also builds the session signature, calculates the next sheet number and creates the new sheet. |
| `client/src/utils/progressNotesPdf.js` | Pagination now uses each note's sheet number, so a new sheet never merges into an earlier one in the screen view, print or PDF. |
| `client/src/utils/inpatientNotesPdf.js` | Fixed a crash in the PDF for continuation pages (`drawHospitalHeader` and `boxHeight` were undefined). Print and PDF now include sheet number, date and time, consultant and the recorded vitals grid. |
| `server/src/routes/ipdClinical.routes.js` | `GET progress-notes` now also returns `latestVitals` (the newest IPDVitals record). Clinical-notes saves now keep the sheet metadata. |
| `server/src/models/inpatientClinicalNote.model.js` | Continuation pages now store `sheetNumber`, `noteDate`, `noteTime`, `consultantName`, `vitalsSnapshot`, `isAiSummarySheet` and `sessionSignature`. The new fields are optional, so old notes still load. |
| `client/src/pages/reception/ReceptionDashboard.jsx` | Active hospitalized rows now show an IPD No. and wristband code badge and a **View / Print Wristband** button. Discharged rows show only a grey **Wristband History** button, never an active wristband action. Fixed the check for an existing admission (`'ADMITTED'` vs `'Admitted'`). |

## AI Summary Behaviour
- **Progress Notes:** before adding the summary, unsaved drafts are saved. The summary is then saved as a new note on the next sheet. It includes recorded vitals with their timestamp; vitals that were never recorded show `—`.
- **In-Patient Clinical Notes:** the summary becomes a new `CLINICAL SUMMARY SHEET #N` and is saved right away. Page 1, Page 2, earlier sheets and handwriting are not changed.
- **Duplicate protection:** a per-session signature is checked against both the in-memory set and the signatures already saved on sheets, and the Approve button is locked while saving.

## Verification
- `node --check` passes on the changed server files.
- Logic test (`scratch/verify_ai_sheets.mjs`): **10/10 passed**. It covers: no invented vitals; two summaries landing on Sheet 2 and Sheet 3; Sheet 1 kept; duplicate blocking; Page 1 and Page 2 not overwritten.
- Vite build (`npm --prefix client run build`): **Passed** (`BUILD_EXIT 0`, built in 6m 43s).

## Remaining Notes
- Wristband creation and the discharged-status flag were already correct in `admission.routes.js` and were not changed.
- Stylus, palm rejection, pen, eraser and undo/redo behaviour was not changed.

# Smart Pharmacy Vendor Invoice PDF Import — Implementation Report

## 1. Root Cause & Overview
Previously, uploading multi-page or compressed vendor purchase invoice PDFs in **Pharmacy Inventory → Upload Purchase Invoice** failed silently with **"No medicines found."** due to two issues:
1. Under Node 24 (`v24.11.1`), `pdf-parse@1.1.1` (bundled `pdf.js`) threw `UnknownErrorException: bad XRef entry` on compressed PDFs when passed a raw Node `Buffer` (which the old parser caught and converted into `medicines: []`). Passing `Uint8Array.from(buffer)` resolves the XRef failure cleanly.
2. The legacy regex line parser had no X/Y coordinate clustering, multi-line header combining (`Sale\nRate`, `GST\n%`), multi-line wrapped cell reconstruction (splitting vertically-centered rows or wrapped names/decimals), Indian number/date normalization, OCR fallback, candidate matching, editable pre-import review, or tenant-isolated PDF streaming.

This implementation upgrades **ONLY** the **Pharmacy Inventory → Upload Purchase Invoice** feature (and the corresponding authenticated PDF preview/download in **Purchase Invoice History**) while leaving all other HMS/Pharmacy features untouched.

---

## 2. Modified & Created Files

### Backend (`server/`)
- [invoiceParser.js](file:///d:/Medical365%20Project/HMS/server/src/utils/invoiceParser.js) — Replaced legacy parser with layered coordinate-aware PDF extractor (`extractPdfPagesWithCoordinates`, `detectTableHeaderInPage`, largest-Y-gap multi-line row segmentation, `joinWrappedTokens`, `extractInvoiceMetadata`, `parseIndianNumber`, `parseExpiryValue`, `enrichMedicineMetadata`, `heuristicTextLineFallback`, `validatePdfBuffer`).
- [pharmacyInvoiceExtractor.service.js](file:///d:/Medical365%20Project/HMS/server/src/services/pharmacyInvoiceExtractor.service.js) — Orchestrates Layer 1–4 extraction, Layer 3 Gemini multimodal OCR fallback (`extractViaGeminiOCR` gated by tenant `aiWalletService`), confidence & math consistency validation (`scoreAndValidateRow`), and medicine candidate matching (`computeMedicineSimilarity`, `findMedicineCandidateMatches`) without auto-merging or fabricating values.
- [pharmacy.routes.js](file:///d:/Medical365%20Project/HMS/server/src/routes/pharmacy.routes.js) — Upgraded `POST /purchase-invoice/upload` with Multer JSON error handling (`handleInvoiceUploadMiddleware`), tenant-isolated file storage (`uploads/invoices/<tenant>`), SHA-256 duplicate detection (`409 DUPLICATE_INVOICE` unless `allowRevised`), added `GET /purchase-invoice/:id/file` authenticated inline PDF stream, added `POST /purchase-invoice/:id/bulk-import` with validation, vendor creation + learned column profile saving, MongoDB session transaction + standalone tracked rollback (`rollbackStandaloneOps`), and tenant-scoped `GET/POST/DELETE /purchase-invoice*`.
- [purchaseInvoice.model.js](file:///d:/Medical365%20Project/HMS/server/src/models/purchaseInvoice.model.js) — Added `hospitalId`, `pharmacyId`, `vendorId`, `vendorPhone`, `orderRef`, `dueDate`, `uploadedPDF.storagePath`, `uploadedPDF.fileHash`, `skippedMedicines`, `failedMedicines`, `isRevisedDuplicate`, `extractionMeta`, expanded `status` enum, and tenant compound indexes.
- [purchaseInvoiceMedicine.model.js](file:///d:/Medical365%20Project/HMS/server/src/models/purchaseInvoiceMedicine.model.js) — Added `hospitalId`, `rowNumber`, `rawMedicineName`, `salt`, `category`, `manufacturer`, `packSize`, `unit`, `unitsPerStrip`, `hsnCode`, `expiryRaw`, `mfgDate`, `cgst`, `sgst`, `igst`, `discountType`, `confidence`, `fieldConfidence`, `warnings`, `originalExtracted`, `matchedInventoryId`, `importAction`, `inventoryId`, `errorMessage`, and updated `status` enum.
- [inventory.model.js](file:///d:/Medical365%20Project/HMS/server/src/models/inventory.model.js) — Added non-duplicate metadata fields `hsnCode`, `manufacturer`, `packSize`, `mfgDate`.
- [vendor.model.js](file:///d:/Medical365%20Project/HMS/server/src/models/vendor.model.js) — Added `invoiceFormatProfile` (`columnMappings`, `confirmedCount`, `lastHeaders`, `lastInvoiceNumber`, `updatedAt`).

### Frontend (`client/`)
- [SmartInvoiceImportPanel.jsx](file:///d:/Medical365%20Project/HMS/client/src/components/pharmacy/SmartInvoiceImportPanel.jsx) & [SmartInvoiceImportPanel.css](file:///d:/Medical365%20Project/HMS/client/src/components/pharmacy/SmartInvoiceImportPanel.css) — 6-stage import UI (`Upload` -> `Processing` -> `Review Extracted Medicines` -> `Correct & Validate` -> `Confirm Bulk Import` -> `Import Summary`) with paginated editable table (`PAGE_SIZE = 20`), confidence badges, missing-field warnings, manual Add/Skip/Delete row controls, candidate inventory link selector (never auto-merged), original extracted value hint & revert, vendor format learning toggle, authenticated inline PDF preview modal, and duplicate-override prompt.
- [api.js](file:///d:/Medical365%20Project/HMS/client/src/utils/api.js) — Added `bulkImportPurchaseInvoice` and `getPurchaseInvoiceFileBlob` to `pharmacyAPI`.
- [PharmacyInventory.jsx](file:///d:/Medical365%20Project/HMS/client/src/pages/pharmacy/PharmacyInventory.jsx) — Replaced inline upload block with `<SmartInvoiceImportPanel />` while preserving manual Add/Edit Medicine, inventory table, Vendor, Department Stock, and Consumption workflows.
- [PurchaseInvoiceHistory.jsx](file:///d:/Medical365%20Project/HMS/client/src/pages/pharmacy/PurchaseInvoiceHistory.jsx) — Switched invoice PDF View/Download actions to authenticated blob fetching via `pharmacyAPI.getPurchaseInvoiceFileBlob`.

### Verification Suites (`server/test/`)
- [test_smart_pharmacy_invoice_import.js](file:///d:/Medical365%20Project/HMS/server/test/test_smart_pharmacy_invoice_import.js) — 6 parser, layout, OCR fallback, candidate matching, validation, and malformed PDF tests.
- [test_pharmacy_invoice_routes.js](file:///d:/Medical365%20Project/HMS/server/test/test_pharmacy_invoice_routes.js) — 5 Express route, upload validation, duplicate conflict, cross-tenant isolation, and bulk-import summary/vendor-profile tests.

---

## 3. Layered Extraction & Normalization Architecture

1. **Layer 1 — Native PDF Coordinate Extraction:** Uses `Uint8Array.from(buffer)` inside `pdf-parse` custom `pagerender` to extract X/Y token coordinates, cluster horizontal visual lines, and count PDF image XObjects (`getOperatorList()`).
2. **Layer 2 — Agnostic Table & Header Detection:** Identifies 1–5 line wrapped headers dynamically across X intervals (without assuming fixed vendor column order), applies vendor-learned aliases first, separates multi-line wrapped cells via largest vertical Y-gap partitioning between row anchors, rejoins broken words/decimals (`joinWrappedTokens`), and isolates left/right header boxes so metadata (`Invoice Number`, `Invoice / Bill Date`) is captured accurately even when stacked or sharing a horizontal line.
3. **Layer 3 — Scanned PDF OCR Fallback:** Automatically triggered when extracted text is insufficient relative to page count / embedded image operators (`likelyScanned`). Routes through Medical365's approved `geminiProvider` + `aiWalletService` per-tenant check with a 45s timeout guard.
4. **Layer 4 — Mapping, Validation & Candidate Matching:** Normalizes Indian numbers (`20,26,222.40`), expiry dates (`08/28`, `N/A`), scheme quantities (`10+2`), and GST splits (`CGST`/`SGST`/`IGST`). Unextracted or illegible fields stay blank (`''` / `null`) and raise review warnings — values are never invented or silently altered to force math totals.

---

## 4. Supported PDF Types & Field Mapping

- **Supported PDFs:** Native text digital PDFs (single-page & multi-page), Indian wholesale tax invoice tables (wrapped headers/cells, lakh/crore comma formatting), alternate vendor column layouts/schemes (`10+2`), and scanned/image-only PDFs (via Gemini OCR fallback when AI quota/key is active).
- **Schema Mapping (`PurchaseInvoiceMedicine` / `Inventory`):**
  - Item Description / Particulars → `medicineName` (`name`) + `rawMedicineName`, inferring `unit`, `unitsPerStrip`, `packSize`, `category`
  - Composition / Generic → `salt`
  - Batch / Lot No → `batch` (`batchNumber`)
  - Exp / Valid Upto → `expiry` (`expiryDate`), `expiryRaw`, `expiryIsNA` (allows `N/A` devices/consumables without fake dates)
  - Qty / Billed Qty + Scheme/Free → `purchaseQty` + `freeQty` (`stock = purchaseQty + freeQty`)
  - Sale Rate / PTR / Pur Rate → `purchaseRate` (`buyingPrice`) — mapped distinctly from `MRP` (`sellingPrice`)
  - Disc % → `discount` (`discountValue`), `discountType`
  - GST% / CGST / SGST / IGST → `gst`, `cgst`, `sgst`, `igst`
  - Net Amt / Taxable Value → `amount`

---

## 5. Test & Verification Results

1. **Server Syntax Checks (`node --check` on all 7 modified/added server files):** Exit code `0` (`SERVER_SYNTAX_EXIT 0`).
2. **Parser, OCR & Validation Suite (`node test/test_smart_pharmacy_invoice_import.js`):** **`6/6 passed`** (`SMART_TEST_EXIT 0`):
   - Multi-page 32-item Ashoka Pharmacy layout + split descriptions + split decimal + `N/A` expiry (`PASS`)
   - Alternate vendor layout with reordered columns, `10+2` scheme, blank missing fields (`PASS`)
   - Vendor Format Learning remembering custom vendor labels (`PASS`)
   - Scanned image-only PDF triggering Layer 3 OCR fallback & clear error handling (`PASS`)
   - Candidate matching suggestions without auto-merging + math discrepancy/MRP warning (`PASS`)
   - Corrupted, empty, spoofed non-PDF, oversized PDF & date/number edge cases (`PASS`)
3. **Live Verification on Uploaded `Bulk_Order_Pharmacy_Tax_Invoice.pdf`:** Extracted Vendor `Ashoka Pharmacy`, Invoice `AP/26-27/0849`, GSTIN `08AABFA4821K1Z5`, Grand Total `2026222.4` across `3` pages and all `32/32` line items with `32` `Valid` math/status checks (including `N/A` expiry on item 32 and wrapped descriptions on pages 1–3).
4. **Express Route & Multi-Tenant Security Suite (`node test/test_pharmacy_invoice_routes.js`):** **`5/5 passed`** (`ROUTE_TEST_EXIT 0`):
   - Rejects spoofed non-PDF content with HTTP `400 INVALID_PDF` (`PASS`)
   - Uploads valid PDF, creates tenant-scoped invoice & review rows (`PASS`)
   - Detects duplicates (`409 DUPLICATE_INVOICE`) and allows isolated upload for another tenant (`PASS`)
   - Blocks cross-tenant access on `GET /purchase-invoice/:id`, `GET /purchase-invoice/:id/file`, and `POST /purchase-invoice/:id/bulk-import` (`404`) while streaming inline PDF for owning tenant (`PASS`)
   - Executes bulk import returning exact `imported: 2, skipped: 1, failed: 1` counts and persists `Vendor.invoiceFormatProfile` (`PASS`)
5. **Frontend JSX / CSS / Bundle Verification (`esbuild`):** All 4 modified/created client files (`api.js`, `SmartInvoiceImportPanel.jsx`, `PharmacyInventory.jsx`, `PurchaseInvoiceHistory.jsx` + CSS) transformed cleanly (`ESBUILD_CHECK_OK`) and bundled cleanly across local entry imports (`PHARMACY_BUNDLE_OK` in `162ms`).
   - *Environment note:* Full `vite build` across the entire repo exited with native code `-1073741819` during Rollup full-app transform in this Windows container environment; it was not re-run to completion here.

---

## 6. Security & Reliability Notes
- **Tenant Isolation:** Every route derives tenant scope from `req.user.hospitalId || req.user.id` (`getTenantScope`), isolates stored PDFs under `uploads/invoices/<tenantFolder>`, and serves previews only via authenticated `/api/pharmacy/purchase-invoice/:id/file` streams with path-traversal canonical checks (`resolveSafeInvoiceFilePath`).
- **Atomic / Rollback Safety:** `bulk-import` attempts a MongoDB session transaction first and falls back to tracked cleanup (`rollbackStandaloneOps`: deletes newly created `Inventory` docs and restores snapshots of updated docs) on standalone MongoDB instances if a persistence failure occurs mid-import.
- **Unrelated Modules Preserved:** Manual inventory CRUD, batch editing, vendor management, consumption logging, and non-pharmacy HMS modules were left functionally intact.

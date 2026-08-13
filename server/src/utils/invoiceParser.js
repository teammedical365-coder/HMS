const pdfParse = require('pdf-parse');

const parseInvoice = async (buffer) => {
    try {
        const data = await pdfParse(buffer);
        const text = data.text;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const result = {
            invoice: {
                totalMedicines: 0
            },
            medicines: []
        };

        if (lines.length === 0) return result;

        const aliases = {
            purchaseQty: ['quantity ordered', 'quantity', 'qty', 'q.', 'nos', 'pcs'],
            medicineName: ['medicine name', 'product name', 'description', 'medicine', 'product', 'item', 'drug'],
            purchaseRate: ['purchase rate', 'net rate', 'rate', 'cost', 'price'],
            mrp: ['maximum retail price', 'm.r.p.', 'm.r.p', 'mrp'],
            batch: ['batch no', 'lot no', 'batch', 'lot'],
            expiry: ['expiry date', 'exp date', 'expiry', 'exp'],
            gst: ['sgst', 'cgst', 'gst', 'tax'],
            discount: ['discount %', 'discount', 'dis', 'disc']
        };

        const stopWords = ['sub total', 'total', 'gst summary', 'bank', 'terms', 'authorised signatory', 'round off', 'grand total'];

        let headerLineIndex = -1;
        let columnBounds = [];

        // 1. Detect Table Header
        for (let i = 0; i < Math.min(lines.length, 60); i++) {
            const line = lines[i].toLowerCase();
            
            // Skip stop words unless it's a false positive on the header line
            if (stopWords.some(sw => line.includes(sw)) && !line.includes('qty') && !line.includes('quantity')) {
                continue;
            }

            let tempBounds = [];
            
            for (const [key, variants] of Object.entries(aliases)) {
                for (const variant of variants) {
                    // Match word boundaries
                    const regex = new RegExp(`\\b${variant.replace(/\./g, '\\.')}\\b`, 'i');
                    const match = lines[i].match(regex);
                    if (match) {
                        tempBounds.push({ key, charIndex: match.index });
                        break; // Move to next key
                    }
                }
            }

            // If we found at least 3 known headers, we consider it the header row
            if (tempBounds.length >= 3) {
                headerLineIndex = i;
                columnBounds = tempBounds.sort((a, b) => a.charIndex - b.charIndex);
                console.log("Found Header:", lines[i]);
                console.log("Column Bounds:", columnBounds);
                break;
            }
        }

        if (headerLineIndex === -1) {
            console.warn("⚠️ [PDF PARSER] No valid header found.");
            return result;
        }

        const assignValue = (med, key, val) => {
            if (!val || val.trim() === '') return;
            const cleaned = val.trim();
            switch (key) {
                case 'purchaseQty':
                    const qtyMatch = cleaned.match(/(\d+)(?:\+(\d+))?/);
                    if (qtyMatch) {
                        med.purchaseQty = parseInt(qtyMatch[1]) || null;
                        med.freeQty = parseInt(qtyMatch[2]) || 0;
                    }
                    break;
                case 'medicineName':
                    med.medicineName = cleaned.replace(/^[0-9\.]+\s+/, '').trim();
                    break;
                case 'purchaseRate':
                    const cpMatch = cleaned.match(/[\d\.]+/);
                    if (cpMatch) med.purchaseRate = parseFloat(cpMatch[0]);
                    break;
                case 'mrp':
                    const mrpMatch = cleaned.match(/[\d\.]+/);
                    if (mrpMatch) med.mrp = parseFloat(mrpMatch[0]);
                    break;
                case 'batch':
                    med.batch = cleaned.split(/\s+/)[0];
                    break;
                case 'expiry':
                    const exp = cleaned.match(/\b(?:0[1-9]|1[0-2])[\/\-](?:20\d{2}|\d{2})\b/);
                    if (exp) med.expiry = exp[0];
                    else med.expiry = cleaned.split(/\s+/)[0];
                    break;
                case 'gst':
                    const gstMatch = cleaned.match(/[\d\.]+/);
                    if (gstMatch) {
                        const g = parseFloat(gstMatch[0]);
                        med.cgst = g / 2;
                        med.sgst = g / 2;
                    }
                    break;
                case 'discount':
                    const discMatch = cleaned.match(/[\d\.]+/);
                    if (discMatch) med.discount = parseFloat(discMatch[0]);
                    break;
            }
        };

        // 2. Parse Rows
        let rowBuffer = "";
        const dataRows = [];

        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();

            // Stop execution if stop words are encountered
            if (stopWords.some(sw => lowerLine.includes(sw)) && !lowerLine.includes('qty') && !lowerLine.includes('quantity')) {
                if (rowBuffer) dataRows.push(rowBuffer);
                break; // We STOP parsing further rows when footer is hit
            }

            // Start a new row if we see a serial number (e.g. "1.", "2.", "1)", "2)")
            if (/^\d+[\.\)]$/.test(line.trim())) {
                if (rowBuffer) dataRows.push(rowBuffer);
                rowBuffer = line;
                continue;
            }

            rowBuffer += (rowBuffer ? "  " : "") + line; // Use double space so token splitting still works

            // Check if rowBuffer now contains a complete row
            // Remove word boundary \b at the end of expiry to handle squished HSN e.g. "4/28300490"
            const hasExpiry = /\b(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})(?!\/|\-)/.test(rowBuffer);
            const decimals = rowBuffer.match(/\d+\.\d{2}/g);
            
            // If it has expiry and enough decimals, and the line ends with a typical Amount decimal
            if (hasExpiry && decimals && decimals.length >= 3) {
                // In many invoices, amount is the last token on a line. 
                // We use >= 3 decimals (MRP, Rate, Amount) as a strong indicator the row is complete.
                // Or if the next line is obviously a new item. But we rely on serial number mostly.
                if (/\d+\.\d{2}$/.test(line.trim()) && rowBuffer.length > 30) {
                    // It's likely complete, but we don't strictly flush unless it's very clearly the end, 
                    // because the serial number check will flush it anyway if present.
                    // To be safe, we'll wait for the serial number or stop word to flush it for this format,
                    // but for invoices without serial numbers, we flush if there's >= 4 decimals.
                    if (decimals.length >= 4) {
                        dataRows.push(rowBuffer);
                        rowBuffer = "";
                    }
                }
            }
        }
        if (rowBuffer) dataRows.push(rowBuffer);
        
        console.log("Data Rows Built:", dataRows);

        for (const row of dataRows) {
            const line = row;

            const med = {
                medicineName: null,
                purchaseQty: null,
                freeQty: 0,
                batch: null,
                expiry: null,
                hsn: null,
                pack: null,
                purchaseRate: null,
                mrp: null,
                discount: null,
                cgst: null,
                sgst: null,
                gst: null,
                amount: null
            };

            const tokensBySpace = line.split(/\s+/);
            const sortedKeys = columnBounds.map(cb => cb.key);
            const isConcatenated = line.includes("  ");

            // Attempt 1: Direct token mapping if spaces perfectly separate columns
            if (!isConcatenated && tokensBySpace.length === sortedKeys.length) {
                for (let j = 0; j < sortedKeys.length; j++) {
                    assignValue(med, sortedKeys[j], tokensBySpace[j]);
                }
            } 
            // Attempt 2: Spatial bound slicing (resilient to column merging/shifting)
            else if (!isConcatenated) {
                for (let j = 0; j < columnBounds.length; j++) {
                    const bound = columnBounds[j];
                    const nextBound = columnBounds[j+1];
                    
                    // Allow small overlap for right-aligned data
                    const start = j === 0 ? 0 : Math.max(0, bound.charIndex - 4);
                    const end = nextBound ? nextBound.charIndex + 2 : line.length;
                    
                    let val = line.substring(start, end).trim();
                    assignValue(med, bound.key, val);
                }
            }

            // Fallback: If critical fields are missing (typical for concatenated multi-line rows) OR it's concatenated
            if (isConcatenated || !med.medicineName || med.medicineName.length < 2) {
                let tempLine = line;
                
                // 1. Extract Expiry (strict word boundary OR lookahead for HSN)
                let expMatch = tempLine.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})(?!\/|\-)/);
                if (!expMatch) {
                    expMatch = tempLine.match(/(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})(?=\d{4,})/);
                }
                if (expMatch) {
                    med.expiry = expMatch[0];
                    tempLine = tempLine.replace(expMatch[0], ' ');
                }

                // 2. Extract Prices
                const decimals = tempLine.match(/\d+\.\d{2}/g);
                if (decimals && decimals.length >= 2) {
                    med.mrp = parseFloat(decimals[0]) || 0;
                    med.purchaseRate = parseFloat(decimals[1]) || med.mrp;
                    
                    if (decimals.length >= 6) {
                        med.discount = parseFloat(decimals[2]);
                        med.cgst = parseFloat(decimals[3]);
                        med.sgst = parseFloat(decimals[4]);
                        med.gst = (med.cgst || 0) + (med.sgst || 0);
                    }
                    tempLine = tempLine.replace(/\d+\.\d{2}/g, ' ');
                }

                // 3. Extract Qty (handles optional S.No and optional SGST header remnants)
                const qtyMatch = tempLine.match(/^(?:[A-Za-z\s]+)?(?:\d+[\.\)]\s+)?(\d+(?:\+\d+)?)\s/);
                if (qtyMatch) {
                    const qStr = qtyMatch[1];
                    if (qStr.includes('+')) {
                        med.purchaseQty = parseInt(qStr.split('+')[0]);
                        med.freeQty = parseInt(qStr.split('+')[1]);
                    } else {
                        med.purchaseQty = parseInt(qStr);
                    }
                    tempLine = tempLine.replace(/^(?:\d+[\.\)]\s+)?(\d+(?:\+\d+)?)[A-Za-z\s]+(FG \d+)?/, ' ');
                }

                // 4. Remove Pack details (e.g. 1*25, 1x10)
                tempLine = tempLine.replace(/\b\d+[\*xX]\d+\b/i, ' ');

                // 5. Extract Medicine Name (everything up to HSN/Batch)
                const tokens = tempLine.split(/\s+/).filter(t => t.trim().length > 0);
                if (tokens.length > 0) {
                    let nameTokens = [];
                    for (let t of tokens) {
                        if (/^\d{4,}$/.test(t)) {
                            med.hsn = t;
                            break; // Stop at HSN code
                        }
                        nameTokens.push(t);
                    }
                    
                    // The last token in nameTokens is usually the batch number if we reached HSN
                    if (nameTokens.length > 1) {
                        med.batch = nameTokens.pop();
                    } else if (nameTokens.length === 1 && med.hsn) {
                        med.batch = nameTokens.pop();
                    }

                    med.medicineName = nameTokens.join(' ').trim();
                }
            }

            // Fallback for Qty if still missing
            if (!med.purchaseQty) {
                const qtyFallback = line.match(/\b(\d+)\+(\d+)\b/);
                if (qtyFallback) {
                    med.purchaseQty = parseInt(qtyFallback[1]);
                    med.freeQty = parseInt(qtyFallback[2]);
                }
            }

            // Add valid medicines to result
            if (med.medicineName && med.medicineName.length >= 2) {
                // Remove numbers that might have accidentally merged into the name
                med.medicineName = med.medicineName.replace(/^[\d\.]+\s+/, '');
                result.medicines.push(med);
            }
        }

        // 3. Cleanup & Validation
        // Remove obviously wrong entries (like tax summaries that sneaked in)
        result.medicines = result.medicines.filter(m => {
            if (!m.medicineName || m.medicineName.length < 3) return false;
            const lowerName = m.medicineName.toLowerCase();
            if (lowerName.includes('sgst') || lowerName.includes('cgst') || lowerName.includes('cess')) return false;
            if (m.medicineName.includes('=') || m.medicineName.includes('%')) return false;
            return true;
        });

        result.invoice.totalMedicines = result.medicines.length;

        console.log(`Successfully parsed ${result.medicines.length} medicines.`);
        return result;

    } catch (error) {
        console.warn("⚠️ [PDF PARSER] Error during parsing:", error.message);
        return { invoice: { totalMedicines: 0 }, medicines: [] };
    }
};

module.exports = { parseInvoice };

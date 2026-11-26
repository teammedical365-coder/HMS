import React, { useState, useEffect, useMemo } from 'react';
import { FiPrinter, FiX, FiShield, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { admissionAPI } from '../../utils/api';
import { useBranding } from '../../context/BrandingContext';
import './IPDWristbandModal.css';

// Standard ISO/IEC 15417 Code-128 bar/space width patterns (0..106)
const CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

function buildCode128Bars(rawValue) {
    const clean = String(rawValue || 'WB-UNKNOWN')
        .replace(/[^\x20-\x7E]/g, '')
        .trim() || 'WB-UNKNOWN';

    const codes = [104]; // Start Code B
    let checksum = 104;

    for (let i = 0; i < clean.length; i += 1) {
        const val = clean.charCodeAt(i) - 32;
        codes.push(val);
        checksum += val * (i + 1);
    }

    codes.push(checksum % 103);
    codes.push(106); // Stop

    const rects = [];
    let cursor = 10; // Quiet zone (10 modules)

    codes.forEach((code) => {
        const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
        for (let idx = 0; idx < pattern.length; idx += 1) {
            const width = parseInt(pattern[idx], 10);
            if (idx % 2 === 0) {
                rects.push({ x: cursor, width });
            }
            cursor += width;
        }
    });

    return {
        rects,
        totalWidth: cursor + 10,
        encodedText: clean
    };
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatAdmissionDate(dateVal, timeVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return String(dateVal);
    const datePart = d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    if (timeVal && String(timeVal).trim()) {
        return `${datePart}, ${String(timeVal).trim()}`;
    }
    return datePart;
}

const IPDWristbandModal = ({
    isOpen,
    onClose,
    admissionId,
    admission = null,
    initialWristband = null
}) => {
    const { branding, hospitalName: contextHospitalName } = useBranding();
    const [wristband, setWristband] = useState(initialWristband);
    const [loading, setLoading] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [error, setError] = useState('');
    const [logoBroken, setLogoBroken] = useState(false);

    const resolvedAdmissionId = admissionId || admission?._id || initialWristband?.admissionId || null;

    useEffect(() => {
        if (!isOpen) return;
        setLogoBroken(false);
        setError('');

        if (initialWristband && String(initialWristband.admissionId) === String(resolvedAdmissionId || initialWristband.admissionId)) {
            setWristband(initialWristband);
            return;
        }

        if (!resolvedAdmissionId) {
            setError('Admission identifier is missing for wristband lookup.');
            return;
        }

        let cancelled = false;
        const loadWristband = async () => {
            setLoading(true);
            try {
                const res = await admissionAPI.getWristband(resolvedAdmissionId);
                if (!cancelled) {
                    if (res?.success && res.wristband) {
                        setWristband(res.wristband);
                    } else {
                        setError(res?.message || 'Unable to load IPD wristband.');
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.message || 'Failed to load IPD wristband.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadWristband();
        return () => {
            cancelled = true;
        };
    }, [isOpen, resolvedAdmissionId, initialWristband]);

    const displayData = useMemo(() => {
        const wb = wristband || {};
        const pSnap = wb.patientSnapshot || {};
        const aSnap = wb.admissionSnapshot || {};
        const hSnap = wb.hospitalSnapshot || {};
        const admPt = (admission?.patientId && typeof admission.patientId === 'object') ? admission.patientId : {};

        const hospitalTitle = hSnap.name || contextHospitalName || branding?.appName || 'Medical365 Hospital';
        const rawLogo = hSnap.logoUrl || branding?.logoUrl || '/assets/logo.png';
        const resolvedLogo = rawLogo.startsWith('http') || rawLogo.startsWith('/') ? rawLogo : `/${rawLogo}`;

        const fullName = pSnap.fullName || admPt.name || 'Inpatient';
        const mrn = pSnap.mrn || admPt.mrn || admPt.patientId || '—';
        const ageVal = pSnap.age !== undefined && pSnap.age !== '' && pSnap.age !== null
            ? `${String(pSnap.age).replace(/\s*y(ears?)?$/i, '')} Y`
            : (admPt.age ? `${admPt.age} Y` : '—');
        const genderVal = pSnap.gender || admPt.gender || '—';
        const ageGender = `${ageVal} / ${genderVal}`;
        const phone = pSnap.phone || admPt.phone || '—';

        const ipdNumber = wb.ipdNumber || admission?.ipdNumber || (resolvedAdmissionId ? `IPD-${String(resolvedAdmissionId).slice(-6).toUpperCase()}` : '—');
        const ward = aSnap.ward || admission?.ward || 'General Ward';
        const bedNumber = aSnap.bedNumber || admission?.bedNumber || 'Assigned';
        const admittedAt = formatAdmissionDate(
            aSnap.admissionDate || admission?.admissionDate || wb.createdAt,
            aSnap.admissionTime || admission?.admissionTime
        );
        const barcodePayload = wb.barcodePayload || wb.wristbandCode || ipdNumber;

        return {
            hospitalTitle,
            resolvedLogo,
            fullName,
            mrn,
            ageGender,
            phone,
            ipdNumber,
            ward,
            bedNumber,
            admittedAt,
            barcodePayload,
            wristbandCode: wb.wristbandCode || barcodePayload,
            status: wb.status || (admission?.status === 'Discharged' ? 'DISCHARGED' : 'ACTIVE'),
            printCount: Number(wb.printCount) || 0
        };
    }, [wristband, admission, contextHospitalName, branding, resolvedAdmissionId]);

    const barcode = useMemo(
        () => buildCode128Bars(displayData.barcodePayload),
        [displayData.barcodePayload]
    );

    if (!isOpen) return null;

    const handlePrintWristband = async () => {
        setPrinting(true);
        try {
            if (resolvedAdmissionId) {
                try {
                    const res = await admissionAPI.recordWristbandPrint(resolvedAdmissionId);
                    if (res?.success && res.wristband) {
                        setWristband(res.wristband);
                    }
                } catch (logErr) {
                    console.warn('Wristband print audit warning:', logErr?.message || logErr);
                }
            }

            const svgRectsMarkup = barcode.rects
                .map((r) => `<rect x="${r.x}" y="0" width="${r.width}" height="48" fill="#000000" />`)
                .join('');

            const logoUrlAbs = displayData.resolvedLogo.startsWith('http')
                ? displayData.resolvedLogo
                : `${window.location.origin}${displayData.resolvedLogo}`;

            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>IPD Wristband - ${escapeHtml(displayData.fullName)} (${escapeHtml(displayData.ipdNumber)})</title>
    <style>
        @page { size: auto; margin: 8mm; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
        }
        .wb-sheet-band {
            width: 100%;
            max-width: 680px;
            border: 2px solid #0f172a;
            border-radius: 10px;
            padding: 12px 14px;
            display: grid;
            grid-template-columns: 1.55fr 0.95fr;
            gap: 14px;
            align-items: center;
        }
        .wb-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            border-bottom: 1.5px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 7px;
        }
        .wb-hosp {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
        }
        .wb-hosp img {
            width: 24px;
            height: 24px;
            object-fit: contain;
        }
        .wb-ipd {
            background: #0f172a;
            color: #ffffff;
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 800;
        }
        .wb-pt-name {
            font-size: 17px;
            font-weight: 900;
            margin: 0 0 7px 0;
            color: #000000;
        }
        .wb-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px 10px;
        }
        .wb-lbl {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            color: #475569;
        }
        .wb-val {
            font-size: 11.5px;
            font-weight: 800;
            color: #000000;
        }
        .wb-right {
            border-left: 1.5px dashed #64748b;
            padding-left: 12px;
            text-align: center;
        }
        .wb-code {
            font-family: "Courier New", Courier, monospace;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.06em;
            margin-top: 3px;
        }
    </style>
</head>
<body>
    <div class="wb-sheet-band">
        <div>
            <div class="wb-top">
                <div class="wb-hosp">
                    <img src="${escapeHtml(logoUrlAbs)}" onerror="this.style.display='none'" alt="" />
                    <span>${escapeHtml(displayData.hospitalTitle)}</span>
                </div>
                <span class="wb-ipd">${escapeHtml(displayData.ipdNumber)}</span>
            </div>
            <div class="wb-pt-name">${escapeHtml(displayData.fullName)}</div>
            <div class="wb-grid">
                <div><div class="wb-lbl">MRN / UHID</div><div class="wb-val">${escapeHtml(displayData.mrn)}</div></div>
                <div><div class="wb-lbl">Age / Gender</div><div class="wb-val">${escapeHtml(displayData.ageGender)}</div></div>
                <div><div class="wb-lbl">Mobile</div><div class="wb-val">${escapeHtml(displayData.phone)}</div></div>
                <div><div class="wb-lbl">Ward / Room</div><div class="wb-val">${escapeHtml(displayData.ward)}</div></div>
                <div><div class="wb-lbl">Bed No.</div><div class="wb-val">${escapeHtml(displayData.bedNumber)}</div></div>
                <div><div class="wb-lbl">Admitted</div><div class="wb-val">${escapeHtml(displayData.admittedAt)}</div></div>
            </div>
        </div>
        <div class="wb-right">
            <svg viewBox="0 0 ${barcode.totalWidth} 48" width="205" height="46" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                <rect x="0" y="0" width="${barcode.totalWidth}" height="48" fill="#ffffff" />
                ${svgRectsMarkup}
            </svg>
            <div class="wb-code">${escapeHtml(barcode.encodedText)}</div>
        </div>
    </div>
    <script>
        window.onload = function () {
            setTimeout(function () { window.print(); }, 220);
        };
    </script>
</body>
</html>`;

            let printWin = null;
            try {
                printWin = window.open('', '_blank', 'width=820,height=520');
            } catch (_) {
                printWin = null;
            }

            if (printWin) {
                printWin.document.open();
                printWin.document.write(html);
                printWin.document.close();
                toast.success('IPD patient wristband sent to printer');
            } else {
                let frame = document.getElementById('ipd-wristband-print-frame');
                if (!frame) {
                    frame = document.createElement('iframe');
                    frame.id = 'ipd-wristband-print-frame';
                    frame.style.position = 'fixed';
                    frame.style.right = '0';
                    frame.style.bottom = '0';
                    frame.style.width = '0';
                    frame.style.height = '0';
                    frame.style.border = '0';
                    document.body.appendChild(frame);
                }
                const doc = frame.contentWindow.document;
                doc.open();
                doc.write(html);
                doc.close();
                setTimeout(() => {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                }, 280);
                toast.success('IPD wristband print dialog opened');
            }
        } finally {
            setPrinting(false);
        }
    };

    return (
        <div className="ipd-wb-overlay" role="dialog" aria-modal="true" aria-label="IPD Patient Identification Wristband">
            <div className="ipd-wb-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ipd-wb-header">
                    <div className="ipd-wb-header-title">
                        <div className="ipd-wb-icon-badge">
                            <FiShield size={18} />
                        </div>
                        <div>
                            <h3>IPD Patient Identification Wristband</h3>
                            <p>Unique inpatient identification band linked to this hospital admission</p>
                        </div>
                    </div>
                    <button type="button" className="ipd-wb-close-btn" onClick={onClose} title="Close">
                        <FiX size={18} />
                    </button>
                </div>

                <div className="ipd-wb-body">
                    {loading ? (
                        <div style={{ padding: '44px 20px', textAlign: 'center', color: '#475569' }}>
                            <FiRefreshCw size={24} className="spinning" style={{ marginBottom: '10px', color: '#0f766e' }} />
                            <div style={{ fontWeight: 700 }}>Loading inpatient wristband...</div>
                        </div>
                    ) : error ? (
                        <div style={{ padding: '24px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FiAlertCircle size={20} />
                            <span>{error}</span>
                        </div>
                    ) : (
                        <>
                            <div className="ipd-wb-status-bar">
                                <span>
                                    <strong>Wristband ID:</strong> {displayData.wristbandCode}
                                </span>
                                <div className="ipd-wb-meta-pills">
                                    <span className={`ipd-wb-pill ${displayData.status === 'ACTIVE' ? 'active' : 'discharged'}`}>
                                        {displayData.status === 'ACTIVE' ? 'ACTIVE INPATIENT' : 'DISCHARGED RECORD'}
                                    </span>
                                    <span className="ipd-wb-pill">
                                        Prints: {displayData.printCount}
                                    </span>
                                </div>
                            </div>

                            <div className="ipd-wb-band-stage">
                                <div className="ipd-wb-band-strip">
                                    <div className="ipd-wb-band-left">
                                        <div className="ipd-wb-brand-row">
                                            <div className="ipd-wb-brand-identity">
                                                {!logoBroken ? (
                                                    <img
                                                        src={displayData.resolvedLogo}
                                                        alt={displayData.hospitalTitle}
                                                        className="ipd-wb-logo"
                                                        onError={() => setLogoBroken(true)}
                                                    />
                                                ) : (
                                                    <div className="ipd-wb-logo-fallback">
                                                        {displayData.hospitalTitle.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="ipd-wb-hospital-name" title={displayData.hospitalTitle}>
                                                    {displayData.hospitalTitle}
                                                </span>
                                            </div>
                                            <span className="ipd-wb-ipd-tag">{displayData.ipdNumber}</span>
                                        </div>

                                        <div className="ipd-wb-patient-name">{displayData.fullName}</div>

                                        <div className="ipd-wb-grid">
                                            <div className="ipd-wb-field">
                                                <span className="ipd-wb-field-lbl">MRN / UHID</span>
                                                <span className="ipd-wb-field-val" title={displayData.mrn}>{displayData.mrn}</span>
                                            </div>
                                            <div className="ipd-wb-field">
                                                <span className="ipd-wb-field-lbl">Age / Gender</span>
                                                <span className="ipd-wb-field-val">{displayData.ageGender}</span>
                                            </div>
                                            <div className="ipd-wb-field">
                                                <span className="ipd-wb-field-lbl">Mobile No.</span>
                                                <span className="ipd-wb-field-val">{displayData.phone}</span>
                                            </div>
                                            <div className="ipd-wb-field">
                                                <span className="ipd-wb-field-lbl">Ward / Room</span>
                                                <span className="ipd-wb-field-val" title={displayData.ward}>{displayData.ward}</span>
                                            </div>
                                            <div className="ipd-wb-field">
                                                <span className="ipd-wb-field-lbl">Bed Number</span>
                                                <span className="ipd-wb-field-val">{displayData.bedNumber}</span>
                                            </div>
                                            <div className="ipd-wb-field">
                                                <span className="ipd-wb-field-lbl">Admission Date</span>
                                                <span className="ipd-wb-field-val" title={displayData.admittedAt}>{displayData.admittedAt}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="ipd-wb-band-right">
                                        <div className="ipd-wb-barcode-box">
                                            <svg
                                                className="ipd-wb-barcode-svg"
                                                viewBox={`0 0 ${barcode.totalWidth} 48`}
                                                xmlns="http://www.w3.org/2000/svg"
                                                shapeRendering="crispEdges"
                                            >
                                                <rect x="0" y="0" width={barcode.totalWidth} height="48" fill="#ffffff" />
                                                {barcode.rects.map((r, idx) => (
                                                    <rect key={idx} x={r.x} y="0" width={r.width} height="48" fill="#0f172a" />
                                                ))}
                                            </svg>
                                            <span className="ipd-wb-barcode-code">{barcode.encodedText}</span>
                                        </div>
                                        <span className="ipd-wb-privacy-note">
                                            Internal Code-128 ID • Authenticated HMS Scan Only
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="ipd-wb-footer">
                    <span className="ipd-wb-footer-hint">
                        Reprinting preserves the exact same wristband identity for this admission.
                    </span>
                    <div className="ipd-wb-footer-actions">
                        <button type="button" className="ipd-wb-btn-secondary" onClick={onClose}>
                            Close
                        </button>
                        {!loading && !error && (
                            <button
                                type="button"
                                className="ipd-wb-btn-print"
                                onClick={handlePrintWristband}
                                disabled={printing}
                            >
                                <FiPrinter size={15} />
                                <span>{printing ? 'Preparing Print...' : (displayData.printCount > 0 ? 'Reprint Wristband' : 'Print Wristband')}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IPDWristbandModal;

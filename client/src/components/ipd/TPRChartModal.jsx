import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { ipdClinicalAPI, intakeOutputAPI, admissionAPI, hospitalAPI } from '../../utils/api';
import {
    downloadTPRChartPdf,
    printTPRChart,
    mergeTPRRecords,
    resolveHospitalChartBranding,
    resolvePatientChartDetails,
    TPR_COLUMN_DEFS
} from '../../utils/tprChartPdf';
import { FiX, FiPrinter, FiDownload, FiActivity } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './TPRChartModal.css';

const TPRChartModal = ({
    isOpen,
    onClose,
    admissionId,
    admission: initialAdmission,
    patient: initialPatient,
    vitals: initialVitals,
    intakeOutput: initialIntakeOutput,
    isBlank = false
}) => {
    const { user } = useAuth();
    const { branding, hospitalName: brandingHospitalName } = useBranding();

    const [loading, setLoading] = useState(false);
    const [admission, setAdmission] = useState(initialAdmission || null);
    const [vitalsList, setVitalsList] = useState(initialVitals || []);
    const [intakeOutputList, setIntakeOutputList] = useState(initialIntakeOutput || []);
    const [tenantHospital, setTenantHospital] = useState(null);
    const [downloading, setDownloading] = useState(false);

    const effectiveAdmissionId = admissionId || initialAdmission?._id || null;

    useEffect(() => {
        setAdmission(initialAdmission || null);
    }, [initialAdmission]);

    useEffect(() => {
        if (initialVitals) setVitalsList(initialVitals);
    }, [initialVitals]);

    useEffect(() => {
        if (initialIntakeOutput) setIntakeOutputList(initialIntakeOutput);
    }, [initialIntakeOutput]);

    // Fetch live tenant branding + clinical vitals/intake-output on open
    const loadChartData = useCallback(async () => {
        setLoading(true);
        try {
            const brandingPromise = user?.hospitalId
                ? hospitalAPI.getMyBranding().catch(() => null)
                : Promise.resolve(null);

            if (!effectiveAdmissionId || isBlank) {
                const brandRes = await brandingPromise;
                if (brandRes?.hospital) setTenantHospital(brandRes.hospital);
                return;
            }

            const promises = [
                brandingPromise,
                ipdClinicalAPI.getVitalsHistory(effectiveAdmissionId).catch(() => ({ vitals: [] })),
                intakeOutputAPI.getHistory(effectiveAdmissionId).catch(() => ({ records: [], data: [] })),
                !initialAdmission
                    ? admissionAPI.getAdmissionById(effectiveAdmissionId).catch(() => ({ admission: null }))
                    : Promise.resolve(null)
            ];

            const [brandRes, vitalsRes, ioRes, admRes] = await Promise.all(promises);

            if (brandRes?.hospital) {
                setTenantHospital(brandRes.hospital);
            }
            setVitalsList(vitalsRes.vitals || vitalsRes.data || []);
            setIntakeOutputList(ioRes.records || ioRes.data || []);
            if (admRes && (admRes.admission || admRes.data)) {
                setAdmission(admRes.admission || admRes.data);
            }
        } catch (err) {
            console.error('Error loading TPR chart data:', err);
            toast.error('Could not load complete TPR chart history');
        } finally {
            setLoading(false);
        }
    }, [effectiveAdmissionId, initialAdmission, user?.hospitalId, isBlank]);

    useEffect(() => {
        if (isOpen) {
            loadChartData();
        }
    }, [isOpen, loadChartData]);

    // Resolved Patient Details (raw objects preserve DOB for exact Y, M, D formatting)
    const rawPatient = initialPatient || admission?.patientId || {};
    const effectiveAdmission = admission || (effectiveAdmissionId ? { _id: effectiveAdmissionId } : {});
    const patientObj = useMemo(
        () => resolvePatientChartDetails({ patient: rawPatient, admission: effectiveAdmission, isBlank }),
        [rawPatient, effectiveAdmission, isBlank]
    );

    // Dynamic White-Label Branding strictly scoped to the authenticated tenant
    const hospitalObj = useMemo(
        () => resolveHospitalChartBranding({ tenantHospital, branding, brandingHospitalName, user }),
        [tenantHospital, branding, brandingHospitalName, user]
    );

    const mergedRows = useMemo(
        () => (isBlank ? [] : mergeTPRRecords(vitalsList, intakeOutputList)),
        [vitalsList, intakeOutputList, isBlank]
    );

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            await downloadTPRChartPdf({
                hospital: hospitalObj,
                patient: rawPatient,
                admission: effectiveAdmission,
                vitals: vitalsList,
                intakeOutput: intakeOutputList,
                isBlank
            });
            toast.success('TPR Chart PDF downloaded successfully');
        } catch (err) {
            console.error('Failed to download PDF:', err);
            toast.error('Failed to generate PDF. You can also use Print Chart to save as PDF.');
        } finally {
            setDownloading(false);
        }
    };

    const handlePrint = () => {
        printTPRChart({
            hospital: hospitalObj,
            patient: rawPatient,
            admission: effectiveAdmission,
            vitals: vitalsList,
            intakeOutput: intakeOutputList,
            isBlank
        });
    };

    if (!isOpen) return null;

    // Preserve exact vertical column sheet proportion down page 1 when records are < 25
    const spacerHeightPx = mergedRows.length === 0
        ? 720
        : mergedRows.length < 24
            ? Math.max(120, 720 - mergedRows.length * 26)
            : 120;

    return (
        <div className="tpr-modal-overlay" role="dialog" aria-modal="true" onClick={(e) => {
            if (e.target.classList.contains('tpr-modal-overlay')) onClose();
        }}>
            <div className="tpr-modal-container">
                {/* Modal Top Bar */}
                <div className="tpr-modal-header">
                    <h3>
                        <FiActivity style={{ color: '#0d9488' }} />
                        <span>TPR &amp; Vital Observation Chart</span>
                        {loading && <span className="tpr-loading-tag">(Refreshing...)</span>}
                    </h3>
                    <div className="tpr-modal-header-actions">
                        <button
                            type="button"
                            className="tpr-btn tpr-btn-print-action"
                            onClick={handlePrint}
                            title="Print TPR Chart (A4 Portrait)"
                        >
                            <FiPrinter size={15} />
                            <span>Print Chart</span>
                        </button>
                        <button
                            type="button"
                            className="tpr-btn tpr-btn-download"
                            onClick={handleDownloadPdf}
                            disabled={downloading}
                            title="Download Vector PDF"
                        >
                            <FiDownload size={15} />
                            <span>{downloading ? 'Generating...' : 'Download PDF'}</span>
                        </button>
                        <button
                            type="button"
                            className="tpr-btn-close"
                            onClick={onClose}
                            title="Close (Esc)"
                        >
                            <FiX />
                        </button>
                    </div>
                </div>

                {/* Modal Body: Exact Visual Reference Sheet */}
                <div className="tpr-modal-body">
                    <div className="tpr-sheet-paper">
                        {/* 1. Patient Demographics Top Line */}
                        <div className="tpr-sheet-patient-line">
                            Patient Name : {patientObj.name}
                            <span className="tpr-sep"></span>
                            UHID : {patientObj.uhid}
                            <span className="tpr-sep"></span>
                            IPD : {patientObj.ipdNumber}
                            <span className="tpr-sep"></span>
                            Gender : {patientObj.gender}
                            <span className="tpr-sep"></span>
                            Age : {patientObj.age}
                        </div>

                        {/* 2. Letterhead: Left Accreditation (only if authorized & configured) & Right Hospital Branding */}
                        <div className="tpr-sheet-letterhead">
                            <div className="tpr-sheet-accreditation">
                                {hospitalObj.accreditation?.enabled === true ? (
                                    <>
                                        {hospitalObj.accreditation.logoUrl && (
                                            <img
                                                className="tpr-sheet-accred-img"
                                                src={hospitalObj.accreditation.logoUrl}
                                                alt="NABH Accreditation Seal"
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                        )}
                                        {hospitalObj.accreditation.certNo && (
                                            <div className="tpr-sheet-cert-no">
                                                {hospitalObj.accreditation.certNo}
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </div>

                            <div className="tpr-sheet-hosp-branding">
                                {hospitalObj.logoUrl && (
                                    <img
                                        className="tpr-sheet-hosp-logo"
                                        src={hospitalObj.logoUrl}
                                        alt={hospitalObj.name}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                )}
                                <div className="tpr-sheet-hosp-text">
                                    <div className="tpr-sheet-hosp-name">{hospitalObj.name}</div>
                                    {hospitalObj.tagline && (
                                        <div className="tpr-sheet-hosp-tagline">{hospitalObj.tagline}</div>
                                    )}
                                    {hospitalObj.contactLine && (
                                        <div className="tpr-sheet-hosp-contact">{hospitalObj.contactLine}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 3. Centered Heading: "TPR – CHART" */}
                        <div className="tpr-sheet-title">TPR – CHART</div>

                        {/* 4. Exact 10-Column Table matching VITAL CHART.pdf vertical column dividers */}
                        <table className="tpr-sheet-table">
                            <thead>
                                <tr>
                                    {TPR_COLUMN_DEFS.map(col => (
                                        <th key={col.key} className={`tpr-w-${col.key}`}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {mergedRows.map((rec, idx) => (
                                    <tr key={idx} className="tpr-data-row">
                                        <td className="tpr-col-center">{rec.date}</td>
                                        <td className="tpr-col-center">{rec.time}</td>
                                        <td className="tpr-col-center">{rec.bp}</td>
                                        <td className="tpr-col-center">{rec.temp}</td>
                                        <td className="tpr-col-center">{rec.pulse}</td>
                                        <td className="tpr-col-center">{rec.rr}</td>
                                        <td className="tpr-col-center">{rec.input}</td>
                                        <td className="tpr-col-center">{rec.output}</td>
                                        <td className="tpr-col-left">{rec.remark}</td>
                                        <td className="tpr-col-left">{rec.emp}</td>
                                    </tr>
                                ))}
                                <tr className="tpr-spacer-row" style={{ height: `${spacerHeightPx}px` }}>
                                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TPRChartModal;

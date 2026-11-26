import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LabLayout from '../../components/lab/LabLayout';
import { labAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiPlus, FiCheckCircle, FiSearch, FiPrinter,
    FiUserCheck, FiBox, FiLayers, FiAlertTriangle,
    FiRefreshCw, FiDollarSign, FiClock, FiFileText, FiUpload
} from 'react-icons/fi';
import LabOrderSlipModal from './LabOrderSlipModal';
import './LabOrderBookingPage.css';

const PRIORITIES = ['Routine', 'Urgent', 'STAT'];
const COLLECTION_TYPES = ['Walk-in', 'Home Collection', 'Collection Centre'];

const LabOrderBookingPage = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // ── 1. Patient Selection ──
    const [patientSearch, setPatientSearch] = useState('');
    const [patientSearchResults, setPatientSearchResults] = useState([]);
    const [searchingPatient, setSearchingPatient] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);

    // ── 2. Phase 3 Test Catalog & Packages ──
    const [catalogTests, setCatalogTests] = useState([]);
    const [catalogPackages, setCatalogPackages] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [testSearch, setTestSearch] = useState('');
    const [selectedTestDept, setSelectedTestDept] = useState('all');

    // Selected items
    const [selectedTestIds, setSelectedTestIds] = useState([]);
    const [selectedPackageIds, setSelectedPackageIds] = useState([]);

    // ── 3. Doctor Master & Requisition Metadata ──
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [referringDoctorName, setReferringDoctorName] = useState('');
    const [priority, setPriority] = useState('Routine');
    const [collectionType, setCollectionType] = useState('Walk-in');
    const [orderNotes, setOrderNotes] = useState('');

    // ── 4. Prescriptions ──
    const [prescriptionFiles, setPrescriptionFiles] = useState([]);
    const [uploadedPrescriptions, setUploadedPrescriptions] = useState([]);
    const [uploadingPrescriptions, setUploadingPrescriptions] = useState(false);

    // ── 5. Server-Enforced Pricing Preview & Placeholders ──
    const [pricePreview, setPricePreview] = useState(null);
    const [placeholders, setPlaceholders] = useState([]);
    const [calculatingPrice, setCalculatingPrice] = useState(false);

    // ── 6. Booking & Slip State ──
    const [bookingOrder, setBookingOrder] = useState(false);
    const [createdOrder, setCreatedOrder] = useState(null);
    const [slipModalOpen, setSlipModalOpen] = useState(false);
    const [isTokenOnlyPrint, setIsTokenOnlyPrint] = useState(false);

    // Initial Data Fetch
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoadingCatalog(true);
            try {
                const [testsRes, pkgsRes, docsRes] = await Promise.all([
                    labAPI.master.getTests({ isActive: 'true' }),
                    labAPI.master.getPackages(),
                    labAPI.master.getDoctors({ isActive: 'true' })
                ]);
                if (testsRes.success) setCatalogTests(testsRes.data || []);
                if (pkgsRes.success) setCatalogPackages(pkgsRes.data || []);
                if (docsRes.success) setDoctors(docsRes.data || []);

                // If patientId in query params, auto-select
                const qParams = new URLSearchParams(location.search);
                const pid = qParams.get('patientId');
                if (pid) {
                    const pRes = await labAPI.reception.getPatient(pid);
                    if (pRes.success && pRes.patient) {
                        setSelectedPatient(pRes.patient);
                        if (pRes.patient.referringDoctor?._id) {
                            setSelectedDoctorId(pRes.patient.referringDoctor._id);
                        } else if (pRes.patient.referringDoctorName) {
                            setReferringDoctorName(pRes.patient.referringDoctorName);
                        }
                    }
                }
            } catch (err) {
                console.error('Initial catalog fetch failed:', err);
                toast.error('Failed to load tests and doctor catalog');
            } finally {
                setLoadingCatalog(false);
            }
        };
        fetchInitialData();
    }, [location.search]);

    // Live Patient Search
    const handlePatientSearch = async (val) => {
        setPatientSearch(val);
        if (!val.trim() || val.length < 2) {
            setPatientSearchResults([]);
            return;
        }
        setSearchingPatient(true);
        try {
            const res = await labAPI.reception.getPatients({ search: val.trim(), limit: 5 });
            if (res.success) setPatientSearchResults(res.data || []);
        } catch (err) {
            console.error('Patient search error:', err);
        } finally {
            setSearchingPatient(false);
        }
    };

    // Calculate Server Pricing & Placeholders whenever selections change
    useEffect(() => {
        if (selectedTestIds.length === 0 && selectedPackageIds.length === 0) {
            setPricePreview(null);
            setPlaceholders([]);
            return;
        }

        const timer = setTimeout(async () => {
            setCalculatingPrice(true);
            try {
                const res = await labAPI.reception.getPricePreview({
                    testIds: selectedTestIds,
                    packageIds: selectedPackageIds
                });
                if (res.success) {
                    setPricePreview(res.pricing);
                    setPlaceholders(res.placeholders || []);
                }
            } catch (err) {
                console.error('Pricing preview error:', err);
            } finally {
                setCalculatingPrice(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [selectedTestIds, selectedPackageIds]);

    // Test selection toggle
    const toggleTest = (testId) => {
        setSelectedTestIds(prev =>
            prev.includes(testId) ? prev.filter(id => id !== testId) : [...prev, testId]
        );
    };

    // Package selection toggle
    const togglePackage = (pkgId) => {
        setSelectedPackageIds(prev =>
            prev.includes(pkgId) ? prev.filter(id => id !== pkgId) : [...prev, pkgId]
        );
    };

    // Filtered Tests
    const filteredTests = useMemo(() => {
        return catalogTests.filter(t => {
            const matchSearch = !testSearch.trim() ||
                (t.testName || t.name).toLowerCase().includes(testSearch.toLowerCase()) ||
                (t.testCode || t.code).toLowerCase().includes(testSearch.toLowerCase());
            const matchDept = selectedTestDept === 'all' || t.department === selectedTestDept;
            return matchSearch && matchDept;
        });
    }, [catalogTests, testSearch, selectedTestDept]);

    const departments = useMemo(() => {
        const set = new Set();
        catalogTests.forEach(t => t.department && set.add(t.department));
        return ['all', ...Array.from(set)];
    }, [catalogTests]);

    // Upload Prescriptions on the fly
    const handleUploadPrescriptions = async () => {
        if (!selectedPatient) return toast.error('Please select a patient first');
        if (prescriptionFiles.length === 0) return toast.error('Please select files to upload');

        setUploadingPrescriptions(true);
        try {
            const formData = new FormData();
            prescriptionFiles.forEach(f => formData.append('prescriptions', f));
            const res = await labAPI.reception.uploadPrescriptions(selectedPatient._id, formData);
            if (res.success) {
                toast.success(res.message);
                setUploadedPrescriptions(prev => [...prev, ...(res.prescriptions || [])]);
                setPrescriptionFiles([]);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to upload prescriptions');
        } finally {
            setUploadingPrescriptions(false);
        }
    };

    // Confirm & Book Order
    const handleBookOrder = async () => {
        if (!selectedPatient) {
            return toast.error('Please select or register a patient for this requisition.');
        }
        if (selectedTestIds.length === 0 && selectedPackageIds.length === 0) {
            return toast.error('Please select at least one test or package.');
        }

        setBookingOrder(true);
        try {
            const payload = {
                patientId: selectedPatient._id,
                testIds: selectedTestIds,
                packageIds: selectedPackageIds,
                referringDoctor: selectedDoctorId || null,
                referringDoctorName: referringDoctorName.trim(),
                priority,
                collectionType,
                prescriptions: uploadedPrescriptions,
                notes: orderNotes
            };

            const res = await labAPI.reception.createOrder(payload);
            if (res.success && res.order) {
                toast.success(`Order #${res.order.orderNumber} booked successfully!`);
                setCreatedOrder(res.order);
                setIsTokenOnlyPrint(false);
                setSlipModalOpen(true);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create laboratory order');
        } finally {
            setBookingOrder(false);
        }
    };

    return (
        <LabLayout
            title="Laboratory Order Booking &amp; Requisition"
            subtitle="Register walk-in &amp; referred investigations with Phase 3 catalog and server pricing"
        >
            <div className="lmd-booking-grid">
                {/* ── LEFT COLUMN: REQUISITION BUILDER ── */}
                <div className="lmd-booking-left">
                    {/* 1. Patient Identification Section */}
                    <div className="lmd-card">
                        <div className="lmd-card-hdr">
                            <h3>1. Patient Identification (Medical365 Registered Patients)</h3>
                        </div>

                        {selectedPatient ? (
                            <div className="lmd-selected-patient-card">
                                <div className="patient-main">
                                    <div>
                                        <span className="patient-name">{selectedPatient.name}</span>
                                        <span className="patient-uhid">{selectedPatient.uhid || selectedPatient.mrn}</span>
                                    </div>
                                    <button
                                        className="btn-change"
                                        onClick={() => { setSelectedPatient(null); setPatientSearch(''); }}
                                    >
                                        Change Patient
                                    </button>
                                </div>
                                <div className="patient-meta">
                                    <span>📞 {selectedPatient.phone}</span>
                                    <span>👤 {selectedPatient.age} Yrs / {selectedPatient.gender}</span>
                                    {selectedPatient.city && <span>📍 {selectedPatient.city}</span>}
                                </div>
                            </div>
                        ) : (
                            <div className="lmd-patient-search-box">
                                <div className="search-input-wrapper">
                                    <FiSearch className="icon" />
                                    <input
                                        type="text"
                                        placeholder="Search patient by UHID, MRN, Name, or Phone (e.g. 98765...)..."
                                        value={patientSearch}
                                        onChange={(e) => handlePatientSearch(e.target.value)}
                                    />
                                    {searchingPatient && <FiRefreshCw className="spin search-spin" />}
                                </div>

                                {patientSearchResults.length > 0 && (
                                    <div className="search-results-dropdown">
                                        {patientSearchResults.map(p => (
                                            <div
                                                key={p._id}
                                                className="result-row"
                                                onClick={() => {
                                                    setSelectedPatient(p);
                                                    setPatientSearchResults([]);
                                                    if (p.referringDoctor?._id) setSelectedDoctorId(p.referringDoctor._id);
                                                }}
                                            >
                                                <div>
                                                    <strong>{p.name}</strong> • <span className="text-blue">{p.uhid || p.mrn}</span>
                                                </div>
                                                <div className="sub">
                                                    Phone: {p.phone} • Age: {p.age} Yrs ({p.gender})
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 2. Test Catalog Selection */}
                    <div className="lmd-card">
                        <div className="lmd-card-hdr">
                            <h3>2. Diagnostic Test Catalog ({selectedTestIds.length} Selected)</h3>
                            <div className="lmd-search-pill">
                                <FiSearch />
                                <input
                                    type="text"
                                    placeholder="Search tests (e.g. CBC, Lipid, HbA1c)..."
                                    value={testSearch}
                                    onChange={(e) => setTestSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Department Filter Pills */}
                        <div className="lmd-dept-pills">
                            {departments.map(d => (
                                <button
                                    key={d}
                                    className={`dept-pill ${selectedTestDept === d ? 'active' : ''}`}
                                    onClick={() => setSelectedTestDept(d)}
                                >
                                    {d === 'all' ? 'All Departments' : d}
                                </button>
                            ))}
                        </div>

                        {/* Tests List */}
                        <div className="lmd-tests-selectable-grid">
                            {loadingCatalog ? (
                                <div className="lmd-loading-box"><FiRefreshCw className="spin" /> Loading test master data...</div>
                            ) : filteredTests.length === 0 ? (
                                <div className="lmd-empty-box">No tests match your filter.</div>
                            ) : (
                                filteredTests.map(t => {
                                    const isSelected = selectedTestIds.includes(t._id);
                                    return (
                                        <div
                                            key={t._id}
                                            className={`test-select-card ${isSelected ? 'selected' : ''}`}
                                            onClick={() => toggleTest(t._id)}
                                        >
                                            <div className="card-top">
                                                <span className="code">{t.testCode || t.code}</span>
                                                <span className="price">₹{t.standardPrice || t.price}</span>
                                            </div>
                                            <div className="name">{t.testName || t.name}</div>
                                            <div className="meta">
                                                <span>🧪 {t.specimenType}</span>
                                                <span>⏱️ {t.turnaroundTime || 24} {t.tatUnit || 'h'}</span>
                                            </div>
                                            {t.fastingRequired && <div className="fasting-tag">⚠️ Fasting Required</div>}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 3. Packages & Profiles Selection */}
                    <div className="lmd-card">
                        <div className="lmd-card-hdr">
                            <h3>3. Health Packages &amp; Profiles ({selectedPackageIds.length} Selected)</h3>
                        </div>

                        <div className="lmd-pkgs-selectable-grid">
                            {catalogPackages.length === 0 ? (
                                <div className="lmd-empty-box">No diagnostic packages configured.</div>
                            ) : (
                                catalogPackages.map(p => {
                                    const isSelected = selectedPackageIds.includes(p._id);
                                    return (
                                        <div
                                            key={p._id}
                                            className={`pkg-select-card ${isSelected ? 'selected' : ''}`}
                                            onClick={() => togglePackage(p._id)}
                                        >
                                            <div className="card-top">
                                                <span className="code">{p.packageCode || p.code}</span>
                                                <div className="pricing-box">
                                                    <span className="orig">₹{p.standardPrice || p.price}</span>
                                                    <span className="disc">₹{p.discountedPrice || p.price}</span>
                                                </div>
                                            </div>
                                            <div className="name">{p.packageName || p.name}</div>
                                            <div className="meta">
                                                <span>📦 {p.tests?.length || 0} Investigations</span>
                                                {p.savings > 0 && <span className="savings-pill">Save ₹{p.savings}</span>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 4. Prescription Attachments */}
                    <div className="lmd-card">
                        <div className="lmd-card-hdr">
                            <h3>4. Doctor Prescription Attachments</h3>
                        </div>
                        <div className="lmd-rx-upload-box">
                            <input
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/jpg,application/pdf"
                                onChange={(e) => setPrescriptionFiles(Array.from(e.target.files || []))}
                            />
                            {prescriptionFiles.length > 0 && (
                                <button
                                    type="button"
                                    className="lmd-btn-sm"
                                    onClick={handleUploadPrescriptions}
                                    disabled={uploadingPrescriptions}
                                >
                                    {uploadingPrescriptions ? 'Uploading…' : `Upload ${prescriptionFiles.length} Prescription(s)`}
                                </button>
                            )}
                        </div>
                        {uploadedPrescriptions.length > 0 && (
                            <div className="lmd-uploaded-rx-list">
                                {uploadedPrescriptions.map((rx, idx) => (
                                    <div key={idx} className="rx-chip">
                                        <FiFileText /> {rx.fileName} ({(rx.size / 1024).toFixed(1)} KB)
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT COLUMN: SUMMARY, PRICING & SAMPLE PLACEHOLDERS ── */}
                <div className="lmd-booking-right">
                    {/* Referring Doctor & Priority Card */}
                    <div className="lmd-card">
                        <div className="lmd-card-hdr">
                            <h3>Requisition Metadata</h3>
                        </div>

                        <div className="lmd-form-group" style={{ marginBottom: '14px' }}>
                            <label>Referring Medical Practitioner</label>
                            <select
                                value={selectedDoctorId}
                                onChange={(e) => {
                                    setSelectedDoctorId(e.target.value);
                                    setReferringDoctorName('');
                                }}
                            >
                                <option value="">-- Direct Walk-in / Self --</option>
                                {doctors.map(d => (
                                    <option key={d._id} value={d._id}>
                                        Dr. {d.doctorName} ({d.specialization})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!selectedDoctorId && (
                            <div className="lmd-form-group" style={{ marginBottom: '14px' }}>
                                <label>Or Outside Referring Doctor</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Dr. A. K. Sen"
                                    value={referringDoctorName}
                                    onChange={(e) => setReferringDoctorName(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="lmd-form-grid-2" style={{ marginBottom: '14px' }}>
                            <div className="lmd-form-group">
                                <label>Order Priority</label>
                                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                                    {PRIORITIES.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                                </select>
                            </div>
                            <div className="lmd-form-group">
                                <label>Collection Type</label>
                                <select value={collectionType} onChange={(e) => setCollectionType(e.target.value)}>
                                    {COLLECTION_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="lmd-form-group">
                            <label>Requisition / Clinical Notes</label>
                            <input
                                type="text"
                                placeholder="e.g. Fasting sample, urgent pre-op clearance..."
                                value={orderNotes}
                                onChange={(e) => setOrderNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Specimen Placeholders Preview */}
                    <div className="lmd-card">
                        <div className="lmd-card-hdr">
                            <h3>Specimen Draw Placeholders ({placeholders.length})</h3>
                        </div>
                        {placeholders.length === 0 ? (
                            <p className="subtext">Select tests to derive required specimen containers automatically.</p>
                        ) : (
                            <div className="lmd-placeholders-list">
                                {placeholders.map((sp, idx) => (
                                    <div key={idx} className="placeholder-row">
                                        <div className="smp-badge">{sp.samplePlaceholderId}</div>
                                        <div className="smp-info">
                                            <strong>{sp.containerType}</strong> ({sp.specimenType})
                                            <div className="tests">For: {sp.testCodes?.join(', ')}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Server-Enforced Pricing Summary */}
                    <div className="lmd-card lmd-pricing-summary-box">
                        <div className="lmd-card-hdr">
                            <h3>Order Pricing Breakdown</h3>
                            {calculatingPrice && <FiRefreshCw className="spin" />}
                        </div>

                        {pricePreview ? (
                            <div className="pricing-rows">
                                <div className="price-row">
                                    <span>Standard Catalog Tariff:</span>
                                    <span>₹{pricePreview.totalStandardPrice}</span>
                                </div>
                                {pricePreview.totalDiscount > 0 && (
                                    <div className="price-row discount text-green">
                                        <span>Package Savings:</span>
                                        <span>- ₹{pricePreview.totalDiscount}</span>
                                    </div>
                                )}
                                <div className="price-row net-total">
                                    <span>Total Net Payable:</span>
                                    <span>₹{pricePreview.netAmount}</span>
                                </div>
                            </div>
                        ) : (
                            <p className="subtext">Select tests or packages to calculate server-verified pricing.</p>
                        )}

                        <div className="lmd-booking-actions">
                            <button
                                className="lmd-btn-book-order"
                                disabled={bookingOrder || (!selectedTestIds.length && !selectedPackageIds.length) || !selectedPatient}
                                onClick={handleBookOrder}
                            >
                                <FiCheckCircle /> {bookingOrder ? 'Booking Requisition…' : 'Confirm & Book Order'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Slip Modal */}
            {slipModalOpen && createdOrder && (
                <LabOrderSlipModal
                    isOpen={slipModalOpen}
                    onClose={() => {
                        setSlipModalOpen(false);
                        navigate('/lab/orders');
                    }}
                    order={createdOrder}
                    isTokenOnly={isTokenOnlyPrint}
                />
            )}
        </LabLayout>
    );
};

export default LabOrderBookingPage;

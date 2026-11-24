import React, { useState, useEffect, useMemo } from 'react';
import LabLayout from '../../components/lab/LabLayout';
import { labAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiLayers, FiPlus, FiEdit2, FiTrash2, FiSearch, FiDownload,
    FiUpload, FiDollarSign, FiUserCheck, FiBox, FiCheckCircle,
    FiXCircle, FiRefreshCw, FiChevronRight, FiAlertTriangle, FiSliders
} from 'react-icons/fi';
import './LabMasterCatalogPage.css';

const DEPARTMENTS = [
    'General Pathology',
    'Clinical Biochemistry',
    'Hematology & Hemostasis',
    'Clinical Microbiology',
    'Serology & Immunology',
    'Histopathology / Cytology',
    'Molecular Diagnostics',
    'Blood Banking / Transfusion'
];

const AGE_UNITS = ['Years', 'Months', 'Days'];
const GENDERS = ['Any', 'Male', 'Female', 'Other'];
const DATA_TYPES = ['Numeric', 'Text', 'Choice'];

const LabMasterCatalogPage = () => {
    const [activeTab, setActiveTab] = useState('tests'); // 'tests' | 'packages' | 'specimens' | 'doctors' | 'prices'

    // ── Tests & Parameters State ──
    const [tests, setTests] = useState([]);
    const [testsLoading, setTestsLoading] = useState(false);
    const [testSearch, setTestSearch] = useState('');
    const [testDeptFilter, setTestDeptFilter] = useState('all');
    const [testCatFilter, setTestCatFilter] = useState('all');
    const [testActiveFilter, setTestActiveFilter] = useState('all');
    const [testModalOpen, setTestModalOpen] = useState(false);
    const [editingTest, setEditingTest] = useState(null);
    const [testForm, setTestForm] = useState(defaultTestForm());
    const [savingTest, setSavingTest] = useState(false);
    const [csvImportModal, setCsvImportModal] = useState(false);
    const [csvText, setCsvText] = useState('');
    const [importingCsv, setImportingCsv] = useState(false);

    // ── Packages State ──
    const [packages, setPackages] = useState([]);
    const [packagesLoading, setPackagesLoading] = useState(false);
    const [pkgModalOpen, setPkgModalOpen] = useState(false);
    const [editingPkg, setEditingPkg] = useState(null);
    const [pkgForm, setPkgForm] = useState(defaultPkgForm());
    const [savingPkg, setSavingPkg] = useState(false);

    // ── Specimens & Containers State ──
    const [specimens, setSpecimens] = useState([]);
    const [containers, setContainers] = useState([]);
    const [specimensLoading, setSpecimensLoading] = useState(false);
    const [specimenModalOpen, setSpecimenModalOpen] = useState(false);
    const [specimenForm, setSpecimenForm] = useState({ specimenCode: '', specimenName: '', description: '' });
    const [containerModalOpen, setContainerModalOpen] = useState(false);
    const [containerForm, setContainerForm] = useState({ containerCode: '', containerName: '', tubeColor: 'Lavender', additive: '', minimumVolume: '2 ml' });

    // ── Referring Doctors State ──
    const [doctors, setDoctors] = useState([]);
    const [doctorsLoading, setDoctorsLoading] = useState(false);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [doctorModalOpen, setDoctorModalOpen] = useState(false);
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [doctorForm, setDoctorForm] = useState(defaultDoctorForm());
    const [savingDoctor, setSavingDoctor] = useState(false);

    // ── Price List State ──
    const [pricesData, setPricesData] = useState({ tests: [], packages: [] });
    const [pricesLoading, setPricesLoading] = useState(false);
    const [priceUpdates, setPriceUpdates] = useState({});
    const [savingPrices, setSavingPrices] = useState(false);

    function defaultTestForm() {
        return {
            testName: '',
            testCode: '',
            shortName: '',
            department: 'General Pathology',
            category: 'General',
            specimenType: 'Whole Blood',
            containerType: 'EDTA Tube',
            requiredVolume: '2-3 ml',
            fastingRequired: false,
            fastingInstructions: '',
            turnaroundTime: 24,
            standardPrice: 0,
            parameters: []
        };
    }

    function defaultPkgForm() {
        return {
            packageName: '',
            packageCode: '',
            description: '',
            tests: [],
            discountedPrice: 0,
            department: 'Health Packages',
            category: 'General'
        };
    }

    function defaultDoctorForm() {
        return {
            doctorName: '',
            registrationNumber: '',
            qualification: 'MBBS',
            specialization: 'General Medicine',
            clinicHospitalName: '',
            contactNumber: '',
            email: '',
            address: '',
            commissionRule: { type: 'NONE', value: 0, notes: '' }
        };
    }

    // Load initial tab data
    useEffect(() => {
        if (activeTab === 'tests') loadTests();
        if (activeTab === 'packages') loadPackages();
        if (activeTab === 'specimens') loadSpecimensAndContainers();
        if (activeTab === 'doctors') loadDoctors();
        if (activeTab === 'prices') loadPrices();
    }, [activeTab]);

    // ==================== 1. TESTS API HANDLERS ====================
    const loadTests = async () => {
        setTestsLoading(true);
        try {
            const res = await labAPI.master.getTests({
                search: testSearch,
                department: testDeptFilter,
                category: testCatFilter,
                isActive: testActiveFilter
            });
            if (res.success) setTests(res.data || []);
        } catch (err) {
            toast.error('Failed to load test catalog');
        } finally {
            setTestsLoading(false);
        }
    };

    const handleOpenCreateTest = () => {
        setEditingTest(null);
        setTestForm(defaultTestForm());
        setTestModalOpen(true);
    };

    const handleOpenEditTest = (t) => {
        setEditingTest(t);
        setTestForm({
            testName: t.testName || t.name || '',
            testCode: t.testCode || t.code || '',
            shortName: t.shortName || '',
            department: t.department || 'General Pathology',
            category: t.category || 'General',
            specimenType: t.specimenType || 'Whole Blood',
            containerType: t.containerType || 'EDTA Tube',
            requiredVolume: t.requiredVolume || '2-3 ml',
            fastingRequired: Boolean(t.fastingRequired),
            fastingInstructions: t.fastingInstructions || '',
            turnaroundTime: t.turnaroundTime || 24,
            standardPrice: t.standardPrice || t.price || 0,
            parameters: Array.isArray(t.parameters) ? JSON.parse(JSON.stringify(t.parameters)) : []
        });
        setTestModalOpen(true);
    };

    const handleSaveTest = async (e) => {
        e.preventDefault();
        setSavingTest(true);
        try {
            if (editingTest) {
                const res = await labAPI.master.updateTest(editingTest._id, testForm);
                if (res.success) {
                    toast.success('Test updated successfully!');
                    setTestModalOpen(false);
                    loadTests();
                }
            } else {
                const res = await labAPI.master.createTest(testForm);
                if (res.success) {
                    toast.success('Test created successfully!');
                    setTestModalOpen(false);
                    loadTests();
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving test');
        } finally {
            setSavingTest(false);
        }
    };

    const handleToggleTestStatus = async (id) => {
        try {
            const res = await labAPI.master.toggleTestStatus(id);
            if (res.success) {
                toast.success(res.message);
                loadTests();
            }
        } catch (err) {
            toast.error('Failed to toggle test status');
        }
    };

    // Parameter sub-form helpers
    const addParameter = () => {
        setTestForm(prev => ({
            ...prev,
            parameters: [
                ...prev.parameters,
                {
                    parameterName: '',
                    parameterCode: `P_${prev.parameters.length + 1}`,
                    unit: '',
                    dataType: 'Numeric',
                    decimalPlaces: 0,
                    displayOrder: prev.parameters.length + 1,
                    isRequired: true,
                    referenceRanges: [
                        {
                            minAge: 0,
                            maxAge: 120,
                            ageUnit: 'Years',
                            gender: 'Any',
                            normalMin: null,
                            normalMax: null,
                            criticalLow: null,
                            criticalHigh: null,
                            unit: '',
                            interpretationNotes: ''
                        }
                    ]
                }
            ]
        }));
    };

    const removeParameter = (idx) => {
        setTestForm(prev => ({
            ...prev,
            parameters: prev.parameters.filter((_, i) => i !== idx)
        }));
    };

    const updateParameterField = (pIdx, field, val) => {
        setTestForm(prev => {
            const copy = [...prev.parameters];
            copy[pIdx] = { ...copy[pIdx], [field]: val };
            return { ...prev, parameters: copy };
        });
    };

    const addReferenceRange = (pIdx) => {
        setTestForm(prev => {
            const copy = [...prev.parameters];
            const p = copy[pIdx];
            p.referenceRanges = [
                ...(p.referenceRanges || []),
                {
                    minAge: 0,
                    maxAge: 120,
                    ageUnit: 'Years',
                    gender: 'Any',
                    normalMin: null,
                    normalMax: null,
                    criticalLow: null,
                    criticalHigh: null,
                    unit: p.unit || '',
                    interpretationNotes: ''
                }
            ];
            return { ...prev, parameters: copy };
        });
    };

    const updateReferenceRangeField = (pIdx, rIdx, field, val) => {
        setTestForm(prev => {
            const copy = [...prev.parameters];
            const rRanges = [...(copy[pIdx].referenceRanges || [])];
            rRanges[rIdx] = { ...rRanges[rIdx], [field]: val };
            copy[pIdx].referenceRanges = rRanges;
            return { ...prev, parameters: copy };
        });
    };

    const removeReferenceRange = (pIdx, rIdx) => {
        setTestForm(prev => {
            const copy = [...prev.parameters];
            copy[pIdx].referenceRanges = copy[pIdx].referenceRanges.filter((_, i) => i !== rIdx);
            return { ...prev, parameters: copy };
        });
    };

    // CSV Import / Export
    const handleExportTestsCsv = () => {
        window.open('/api/lab/master/tests/export/csv', '_blank');
    };

    const handleImportCsv = async () => {
        if (!csvText.trim()) return toast.error('Please paste CSV content');
        setImportingCsv(true);
        try {
            const res = await labAPI.master.importTestsCsv(csvText);
            if (res.success) {
                toast.success(res.message);
                setCsvImportModal(false);
                setCsvText('');
                loadTests();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'CSV Import failed');
        } finally {
            setImportingCsv(false);
        }
    };


    // ==================== 2. PACKAGES API HANDLERS ====================
    const loadPackages = async () => {
        setPackagesLoading(true);
        try {
            const [pRes, tRes] = await Promise.all([
                labAPI.master.getPackages(),
                tests.length === 0 ? labAPI.master.getTests() : Promise.resolve({ success: true, data: tests })
            ]);
            if (pRes.success) setPackages(pRes.data || []);
            if (tRes.success && tests.length === 0) setTests(tRes.data || []);
        } catch (err) {
            toast.error('Failed to load packages');
        } finally {
            setPackagesLoading(false);
        }
    };

    const handleOpenCreatePkg = () => {
        setEditingPkg(null);
        setPkgForm(defaultPkgForm());
        setPkgModalOpen(true);
    };

    const handleOpenEditPkg = (p) => {
        setEditingPkg(p);
        setPkgForm({
            packageName: p.packageName || p.name || '',
            packageCode: p.packageCode || p.code || '',
            description: p.description || '',
            tests: (p.tests || []).map(t => (t._id || t)),
            discountedPrice: p.discountedPrice || 0,
            department: p.department || 'Health Packages',
            category: p.category || 'General'
        });
        setPkgModalOpen(true);
    };

    const handleSavePkg = async (e) => {
        e.preventDefault();
        setSavingPkg(true);
        try {
            if (editingPkg) {
                const res = await labAPI.master.updatePackage(editingPkg._id, pkgForm);
                if (res.success) {
                    toast.success('Package updated successfully!');
                    setPkgModalOpen(false);
                    loadPackages();
                }
            } else {
                const res = await labAPI.master.createPackage(pkgForm);
                if (res.success) {
                    toast.success(res.message);
                    setPkgModalOpen(false);
                    loadPackages();
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving package');
        } finally {
            setSavingPkg(false);
        }
    };

    // Calculate live selected test price sum
    const selectedTestsTotal = useMemo(() => {
        const selectedSet = new Set(pkgForm.tests.map(String));
        return tests
            .filter(t => selectedSet.has(String(t._id)))
            .reduce((sum, t) => sum + (Number(t.standardPrice || t.price) || 0), 0);
    }, [pkgForm.tests, tests]);


    // ==================== 3. SPECIMENS & CONTAINERS ====================
    const loadSpecimensAndContainers = async () => {
        setSpecimensLoading(true);
        try {
            const [sRes, cRes] = await Promise.all([
                labAPI.master.getSpecimens(),
                labAPI.master.getContainers()
            ]);
            if (sRes.success) setSpecimens(sRes.data || []);
            if (cRes.success) setContainers(cRes.data || []);
        } catch (err) {
            toast.error('Failed to load specimen standards');
        } finally {
            setSpecimensLoading(false);
        }
    };

    const handleSaveSpecimen = async (e) => {
        e.preventDefault();
        try {
            const res = await labAPI.master.createSpecimen(specimenForm);
            if (res.success) {
                toast.success('Specimen type added!');
                setSpecimenModalOpen(false);
                setSpecimenForm({ specimenCode: '', specimenName: '', description: '' });
                loadSpecimensAndContainers();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error adding specimen');
        }
    };

    const handleSaveContainer = async (e) => {
        e.preventDefault();
        try {
            const res = await labAPI.master.createContainer(containerForm);
            if (res.success) {
                toast.success('Container type added!');
                setContainerModalOpen(false);
                setContainerForm({ containerCode: '', containerName: '', tubeColor: 'Lavender', additive: '', minimumVolume: '2 ml' });
                loadSpecimensAndContainers();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error adding container');
        }
    };


    // ==================== 4. REFERRING DOCTORS ====================
    const loadDoctors = async () => {
        setDoctorsLoading(true);
        try {
            const res = await labAPI.master.getDoctors({ search: doctorSearch });
            if (res.success) setDoctors(res.data || []);
        } catch (err) {
            toast.error('Failed to load referring doctors');
        } finally {
            setDoctorsLoading(false);
        }
    };

    const handleSaveDoctor = async (e) => {
        e.preventDefault();
        setSavingDoctor(true);
        try {
            if (editingDoctor) {
                const res = await labAPI.master.updateDoctor(editingDoctor._id, doctorForm);
                if (res.success) {
                    toast.success('Doctor details updated!');
                    setDoctorModalOpen(false);
                    loadDoctors();
                }
            } else {
                const res = await labAPI.master.createDoctor(doctorForm);
                if (res.success) {
                    toast.success(res.message);
                    setDoctorModalOpen(false);
                    loadDoctors();
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving doctor');
        } finally {
            setSavingDoctor(false);
        }
    };


    // ==================== 5. STANDARD PRICE LIST ====================
    const loadPrices = async () => {
        setPricesLoading(true);
        try {
            const res = await labAPI.master.getPrices();
            if (res.success) {
                setPricesData({ tests: res.tests || [], packages: res.packages || [] });
                setPriceUpdates({});
            }
        } catch (err) {
            toast.error('Failed to load price list');
        } finally {
            setPricesLoading(false);
        }
    };

    const handlePriceInputChange = (id, type, newPrice) => {
        setPriceUpdates(prev => ({
            ...prev,
            [`${type}_${id}`]: {
                id,
                type,
                standardPrice: Number(newPrice)
            }
        }));
    };

    const handleSaveAllPrices = async () => {
        const updatesList = Object.values(priceUpdates);
        if (updatesList.length === 0) return toast('No price changes to save', { icon: 'ℹ️' });

        // Safe client check before sending to backend
        const invalid = updatesList.some(u => isNaN(u.standardPrice) || u.standardPrice < 0);
        if (invalid) return toast.error('Standard prices cannot be negative numbers');

        setSavingPrices(true);
        try {
            const res = await labAPI.master.updatePrices(updatesList);
            if (res.success) {
                toast.success(res.message);
                loadPrices();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update prices');
        } finally {
            setSavingPrices(false);
        }
    };


    return (
        <LabLayout
            title="Master Data Management"
            subtitle="Test Catalog, Parameters, Reference Ranges, Packages, Specimen Standards & Doctors"
        >
            {/* Top Navigation Tabs */}
            <div className="lmd-tab-nav">
                <button
                    className={`lmd-tab-btn ${activeTab === 'tests' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tests')}
                >
                    <FiLayers /> Test Catalog &amp; Parameters
                </button>
                <button
                    className={`lmd-tab-btn ${activeTab === 'packages' ? 'active' : ''}`}
                    onClick={() => setActiveTab('packages')}
                >
                    <FiBox /> Packages &amp; Profiles
                </button>
                <button
                    className={`lmd-tab-btn ${activeTab === 'specimens' ? 'active' : ''}`}
                    onClick={() => setActiveTab('specimens')}
                >
                    <FiSliders /> Specimens &amp; Containers
                </button>
                <button
                    className={`lmd-tab-btn ${activeTab === 'doctors' ? 'active' : ''}`}
                    onClick={() => setActiveTab('doctors')}
                >
                    <FiUserCheck /> Referring Doctors
                </button>
                <button
                    className={`lmd-tab-btn ${activeTab === 'prices' ? 'active' : ''}`}
                    onClick={() => setActiveTab('prices')}
                >
                    <FiDollarSign /> Standard Price List
                </button>
            </div>

            {/* =========================================================
                TAB 1: TEST CATALOG & PARAMETERS
               ========================================================= */}
            {activeTab === 'tests' && (
                <div className="lmd-content-pane">
                    {/* Action Bar */}
                    <div className="lmd-action-bar">
                        <div className="lmd-search-group">
                            <FiSearch className="lmd-search-icon" />
                            <input
                                type="text"
                                placeholder="Search test by name or code (e.g. CBC, Lipid)..."
                                value={testSearch}
                                onChange={(e) => setTestSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadTests()}
                            />
                            <button className="lmd-btn-filter" onClick={loadTests}>Search</button>
                        </div>

                        <div className="lmd-filter-selects">
                            <select value={testDeptFilter} onChange={(e) => { setTestDeptFilter(e.target.value); setTimeout(loadTests, 10); }}>
                                <option value="all">All Departments</option>
                                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>

                            <select value={testActiveFilter} onChange={(e) => { setTestActiveFilter(e.target.value); setTimeout(loadTests, 10); }}>
                                <option value="all">All Status</option>
                                <option value="true">Active Only</option>
                                <option value="false">Inactive Only</option>
                            </select>
                        </div>

                        <div className="lmd-actions-right">
                            <button className="lmd-btn-outline" onClick={handleExportTestsCsv} title="Download CSV">
                                <FiDownload /> Export CSV
                            </button>
                            <button className="lmd-btn-outline" onClick={() => setCsvImportModal(true)} title="Import CSV">
                                <FiUpload /> Import CSV
                            </button>
                            <button className="lmd-btn-primary" onClick={handleOpenCreateTest}>
                                <FiPlus /> Add New Test
                            </button>
                        </div>
                    </div>

                    {/* Tests Table */}
                    <div className="lmd-table-wrapper">
                        {testsLoading ? (
                            <div className="lmd-loading-box">
                                <FiRefreshCw className="spin" /> Loading diagnostic test catalog...
                            </div>
                        ) : tests.length === 0 ? (
                            <div className="lmd-empty-box">
                                <p>No diagnostic tests match your criteria.</p>
                                <button className="lmd-btn-primary" onClick={handleOpenCreateTest}>Create First Test</button>
                            </div>
                        ) : (
                            <table className="lmd-table">
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Test Name</th>
                                        <th>Department</th>
                                        <th>Specimen &amp; Container</th>
                                        <th>TAT</th>
                                        <th>Parameters</th>
                                        <th>Price (₹)</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tests.map(t => (
                                        <tr key={t._id}>
                                            <td className="bold text-blue">{t.testCode || t.code}</td>
                                            <td>
                                                <div className="bold">{t.testName || t.name}</div>
                                                {t.shortName && <div className="subtext">({t.shortName})</div>}
                                            </td>
                                            <td><span className="lmd-tag">{t.department || 'General'}</span></td>
                                            <td>
                                                <div className="small-text">{t.specimenType}</div>
                                                <div className="subtext">{t.containerType} ({t.requiredVolume})</div>
                                            </td>
                                            <td>{t.turnaroundTime || 24} {t.tatUnit || 'h'}</td>
                                            <td>
                                                <span className="lmd-pill">
                                                    {(t.parameters || []).length} parameter(s)
                                                </span>
                                            </td>
                                            <td className="bold text-emerald">₹{t.standardPrice || t.price || 0}</td>
                                            <td>
                                                <span className={`lmd-status-dot ${t.isActive !== false ? 'active' : 'inactive'}`}>
                                                    {t.isActive !== false ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="lmd-table-actions">
                                                    <button onClick={() => handleOpenEditTest(t)} className="lmd-icon-btn" title="Edit Test & Parameters">
                                                        <FiEdit2 />
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleTestStatus(t._id)}
                                                        className={`lmd-icon-btn ${t.isActive !== false ? 'btn-deactivate' : 'btn-activate'}`}
                                                        title={t.isActive !== false ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {t.isActive !== false ? <FiXCircle /> : <FiCheckCircle />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* =========================================================
                TAB 2: PACKAGES & PROFILES
               ========================================================= */}
            {activeTab === 'packages' && (
                <div className="lmd-content-pane">
                    <div className="lmd-action-bar">
                        <h3>Health Packages &amp; Profiles ({packages.length})</h3>
                        <div className="lmd-actions-right">
                            <button className="lmd-btn-primary" onClick={handleOpenCreatePkg}>
                                <FiPlus /> Create New Package
                            </button>
                        </div>
                    </div>

                    <div className="lmd-table-wrapper">
                        {packagesLoading ? (
                            <div className="lmd-loading-box"><FiRefreshCw className="spin" /> Loading packages...</div>
                        ) : packages.length === 0 ? (
                            <div className="lmd-empty-box">
                                <p>No bundled test packages created yet.</p>
                                <button className="lmd-btn-primary" onClick={handleOpenCreatePkg}>Create First Package</button>
                            </div>
                        ) : (
                            <table className="lmd-table">
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Package Name</th>
                                        <th>Included Tests</th>
                                        <th>Standard Total</th>
                                        <th>Package Price</th>
                                        <th>Patient Savings</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {packages.map(p => (
                                        <tr key={p._id}>
                                            <td className="bold text-purple">{p.packageCode || p.code}</td>
                                            <td>
                                                <div className="bold">{p.packageName || p.name}</div>
                                                <div className="subtext">{p.description}</div>
                                            </td>
                                            <td>
                                                <div className="lmd-tag-list">
                                                    {(p.tests || []).map(t => (
                                                        <span key={t._id} className="lmd-tag">{t.testName || t.name || 'Test'}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>₹{p.standardPrice || p.price || 0}</td>
                                            <td className="bold text-emerald">₹{p.discountedPrice || p.standardPrice || 0}</td>
                                            <td>
                                                {p.savings > 0 ? (
                                                    <span className="lmd-savings-badge">Save ₹{p.savings}</span>
                                                ) : '—'}
                                            </td>
                                            <td>
                                                <span className={`lmd-status-dot ${p.isActive !== false ? 'active' : 'inactive'}`}>
                                                    {p.isActive !== false ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="lmd-table-actions">
                                                    <button onClick={() => handleOpenEditPkg(p)} className="lmd-icon-btn" title="Edit Package">
                                                        <FiEdit2 />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* =========================================================
                TAB 3: SPECIMENS & CONTAINERS MASTER
               ========================================================= */}
            {activeTab === 'specimens' && (
                <div className="lmd-content-pane">
                    <div className="lmd-grid-two-col">
                        {/* Specimen Types Card */}
                        <div className="lmd-card">
                            <div className="lmd-card-header">
                                <h4>🩸 Specimen Types</h4>
                                <button className="lmd-btn-sm" onClick={() => setSpecimenModalOpen(true)}>+ Add Specimen</button>
                            </div>
                            <table className="lmd-table-compact">
                                <thead>
                                    <tr><th>Code</th><th>Name</th><th>Description</th></tr>
                                </thead>
                                <tbody>
                                    {specimens.map((s, idx) => (
                                        <tr key={idx}>
                                            <td className="bold text-blue">{s.specimenCode}</td>
                                            <td>{s.specimenName}</td>
                                            <td className="subtext">{s.description || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Container Types Card */}
                        <div className="lmd-card">
                            <div className="lmd-card-header">
                                <h4>🧪 Container / Tube Standards</h4>
                                <button className="lmd-btn-sm" onClick={() => setContainerModalOpen(true)}>+ Add Container</button>
                            </div>
                            <table className="lmd-table-compact">
                                <thead>
                                    <tr><th>Code</th><th>Container Name</th><th>Color</th><th>Additive</th><th>Vol</th></tr>
                                </thead>
                                <tbody>
                                    {containers.map((c, idx) => (
                                        <tr key={idx}>
                                            <td className="bold">{c.containerCode}</td>
                                            <td>{c.containerName}</td>
                                            <td><span className="lmd-color-dot" style={{ background: c.labelColor || '#8b5cf6' }}></span> {c.tubeColor}</td>
                                            <td className="subtext">{c.additive || 'None'}</td>
                                            <td>{c.minimumVolume}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
                TAB 4: REFERRING DOCTORS MASTER
               ========================================================= */}
            {activeTab === 'doctors' && (
                <div className="lmd-content-pane">
                    <div className="lmd-action-bar">
                        <div className="lmd-search-group">
                            <FiSearch className="lmd-search-icon" />
                            <input
                                type="text"
                                placeholder="Search by doctor name or registration number..."
                                value={doctorSearch}
                                onChange={(e) => setDoctorSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadDoctors()}
                            />
                            <button className="lmd-btn-filter" onClick={loadDoctors}>Search</button>
                        </div>
                        <div className="lmd-actions-right">
                            <button className="lmd-btn-primary" onClick={() => { setEditingDoctor(null); setDoctorForm(defaultDoctorForm()); setDoctorModalOpen(true); }}>
                                <FiPlus /> Register Referring Doctor
                            </button>
                        </div>
                    </div>

                    <div className="lmd-table-wrapper">
                        {doctorsLoading ? (
                            <div className="lmd-loading-box"><FiRefreshCw className="spin" /> Loading doctors directory...</div>
                        ) : doctors.length === 0 ? (
                            <div className="lmd-empty-box">
                                <p>No referring doctors registered yet.</p>
                                <button className="lmd-btn-primary" onClick={() => { setEditingDoctor(null); setDoctorForm(defaultDoctorForm()); setDoctorModalOpen(true); }}>
                                    Register First Doctor
                                </button>
                            </div>
                        ) : (
                            <table className="lmd-table">
                                <thead>
                                    <tr>
                                        <th>Doctor Name</th>
                                        <th>Reg. Number</th>
                                        <th>Specialization</th>
                                        <th>Clinic / Hospital</th>
                                        <th>Contact</th>
                                        <th>Commission Rule</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {doctors.map(d => (
                                        <tr key={d._id}>
                                            <td className="bold text-blue">Dr. {d.doctorName}</td>
                                            <td>{d.registrationNumber || '—'}</td>
                                            <td><span className="lmd-tag">{d.specialization}</span></td>
                                            <td>{d.clinicHospitalName || 'Private Practice'}</td>
                                            <td>
                                                <div>{d.contactNumber || '—'}</div>
                                                <div className="subtext">{d.email}</div>
                                            </td>
                                            <td>
                                                {d.commissionRule?.type !== 'NONE' ? (
                                                    <span className="lmd-pill">
                                                        {d.commissionRule?.type === 'PERCENTAGE' ? `${d.commissionRule?.value}%` : `₹${d.commissionRule?.value}`}
                                                    </span>
                                                ) : <span className="subtext">Standard</span>}
                                            </td>
                                            <td>
                                                <span className={`lmd-status-dot ${d.isActive !== false ? 'active' : 'inactive'}`}>
                                                    {d.isActive !== false ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="lmd-table-actions">
                                                    <button onClick={() => { setEditingDoctor(d); setDoctorForm(d); setDoctorModalOpen(true); }} className="lmd-icon-btn">
                                                        <FiEdit2 />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* =========================================================
                TAB 5: STANDARD PRICE LIST MANAGEMENT
               ========================================================= */}
            {activeTab === 'prices' && (
                <div className="lmd-content-pane">
                    <div className="lmd-action-bar">
                        <div>
                            <h4>Standard Price List</h4>
                            <p className="subtext">Bulk edit laboratory tariffs and packages. Prices must be non-negative values.</p>
                        </div>
                        <div className="lmd-actions-right">
                            <button
                                className="lmd-btn-primary"
                                onClick={handleSaveAllPrices}
                                disabled={savingPrices || Object.keys(priceUpdates).length === 0}
                            >
                                <FiDollarSign /> {savingPrices ? 'Saving…' : `Save Price Changes (${Object.keys(priceUpdates).length})`}
                            </button>
                        </div>
                    </div>

                    <div className="lmd-table-wrapper">
                        {pricesLoading ? (
                            <div className="lmd-loading-box"><FiRefreshCw className="spin" /> Loading price list...</div>
                        ) : (
                            <table className="lmd-table">
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Item Code</th>
                                        <th>Item Name</th>
                                        <th>Department</th>
                                        <th>Standard Tariff (₹)</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pricesData.tests.map(t => {
                                        const updateKey = `TEST_${t.id}`;
                                        const currentVal = priceUpdates[updateKey]?.standardPrice !== undefined
                                            ? priceUpdates[updateKey].standardPrice
                                            : t.standardPrice;

                                        return (
                                            <tr key={t.id}>
                                                <td><span className="lmd-badge-test">TEST</span></td>
                                                <td className="bold">{t.code}</td>
                                                <td>{t.name}</td>
                                                <td>{t.department}</td>
                                                <td>
                                                    <div className="lmd-price-input-wrap">
                                                        <span>₹</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={currentVal}
                                                            onChange={(e) => handlePriceInputChange(t.id, 'TEST', e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`lmd-status-dot ${t.isActive !== false ? 'active' : 'inactive'}`}>
                                                        {t.isActive !== false ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {pricesData.packages.map(p => {
                                        const updateKey = `PACKAGE_${p.id}`;
                                        const currentVal = priceUpdates[updateKey]?.standardPrice !== undefined
                                            ? priceUpdates[updateKey].standardPrice
                                            : p.discountedPrice;

                                        return (
                                            <tr key={p.id} className="lmd-row-pkg">
                                                <td><span className="lmd-badge-pkg">PACKAGE</span></td>
                                                <td className="bold">{p.code}</td>
                                                <td>{p.name}</td>
                                                <td>{p.department}</td>
                                                <td>
                                                    <div className="lmd-price-input-wrap">
                                                        <span>₹</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={currentVal}
                                                            onChange={(e) => handlePriceInputChange(p.id, 'PACKAGE', e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`lmd-status-dot ${p.isActive !== false ? 'active' : 'inactive'}`}>
                                                        {p.isActive !== false ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL 1: ADD/EDIT TEST (WITH PARAMETERS & RANGES)
               ========================================================= */}
            {testModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setTestModalOpen(false)}>
                    <div className="lmd-modal-card wide" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>{editingTest ? 'Edit Diagnostic Test & Parameters' : 'Create New Diagnostic Test'}</h3>
                            <button className="lmd-close-btn" onClick={() => setTestModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSaveTest} className="lmd-modal-form">
                            <div className="lmd-form-grid-3">
                                <div className="lmd-form-group">
                                    <label>Test Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Complete Blood Count (CBC)"
                                        value={testForm.testName}
                                        onChange={(e) => setTestForm({ ...testForm, testName: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Test Code *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. CBC-001"
                                        value={testForm.testCode}
                                        onChange={(e) => setTestForm({ ...testForm, testCode: e.target.value.toUpperCase() })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Short Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. CBC"
                                        value={testForm.shortName}
                                        onChange={(e) => setTestForm({ ...testForm, shortName: e.target.value })}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>Department *</label>
                                    <select
                                        value={testForm.department}
                                        onChange={(e) => setTestForm({ ...testForm, department: e.target.value })}
                                    >
                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                                <div className="lmd-form-group">
                                    <label>Specimen Type</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Whole Blood, Serum"
                                        value={testForm.specimenType}
                                        onChange={(e) => setTestForm({ ...testForm, specimenType: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Container Type</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. EDTA Tube, Plain Tube"
                                        value={testForm.containerType}
                                        onChange={(e) => setTestForm({ ...testForm, containerType: e.target.value })}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>Required Volume</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 2-3 ml"
                                        value={testForm.requiredVolume}
                                        onChange={(e) => setTestForm({ ...testForm, requiredVolume: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Standard Price (₹) *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        required
                                        placeholder="e.g. 350"
                                        value={testForm.standardPrice}
                                        onChange={(e) => setTestForm({ ...testForm, standardPrice: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Turnaround Time (Hours)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={testForm.turnaroundTime}
                                        onChange={(e) => setTestForm({ ...testForm, turnaroundTime: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="lmd-form-row">
                                <label className="lmd-chk-label">
                                    <input
                                        type="checkbox"
                                        checked={testForm.fastingRequired}
                                        onChange={(e) => setTestForm({ ...testForm, fastingRequired: e.target.checked })}
                                    />
                                    <span>Fasting Required for this test</span>
                                </label>
                                {testForm.fastingRequired && (
                                    <input
                                        type="text"
                                        className="lmd-inline-input"
                                        placeholder="Fasting instructions (e.g. 10-12 hours overnight fasting)"
                                        value={testForm.fastingInstructions}
                                        onChange={(e) => setTestForm({ ...testForm, fastingInstructions: e.target.value })}
                                    />
                                )}
                            </div>

                            {/* PARAMETERS SECTION */}
                            <div className="lmd-sub-section">
                                <div className="lmd-sub-section-hdr">
                                    <div>
                                        <h4>Test Parameters &amp; Reference Ranges ({testForm.parameters.length})</h4>
                                        <p className="subtext">Configure parameters and biological reference intervals for age/gender.</p>
                                    </div>
                                    <button type="button" className="lmd-btn-sm" onClick={addParameter}>
                                        <FiPlus /> Add Parameter
                                    </button>
                                </div>

                                {testForm.parameters.length === 0 ? (
                                    <div className="lmd-param-empty">
                                        No parameters defined yet. Click &quot;Add Parameter&quot; to configure clinical sub-values (e.g., Hemoglobin, WBC count).
                                    </div>
                                ) : (
                                    <div className="lmd-param-list">
                                        {testForm.parameters.map((param, pIdx) => (
                                            <div key={pIdx} className="lmd-param-card">
                                                <div className="lmd-param-header">
                                                    <span className="lmd-param-num">#{pIdx + 1}</span>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="Parameter Name (e.g. Hemoglobin)"
                                                        value={param.parameterName}
                                                        onChange={(e) => updateParameterField(pIdx, 'parameterName', e.target.value)}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Unit (e.g. g/dL)"
                                                        value={param.unit}
                                                        onChange={(e) => updateParameterField(pIdx, 'unit', e.target.value)}
                                                    />
                                                    <select
                                                        value={param.dataType}
                                                        onChange={(e) => updateParameterField(pIdx, 'dataType', e.target.value)}
                                                    >
                                                        {DATA_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                                                    </select>
                                                    <button type="button" className="lmd-btn-del" onClick={() => removeParameter(pIdx)}>
                                                        <FiTrash2 />
                                                    </button>
                                                </div>

                                                {/* REFERENCE RANGES ACCORDION */}
                                                <div className="lmd-ranges-block">
                                                    <div className="lmd-ranges-hdr">
                                                        <span>Biological Reference Ranges:</span>
                                                        <button type="button" className="lmd-btn-xs" onClick={() => addReferenceRange(pIdx)}>
                                                            + Add Range Interval
                                                        </button>
                                                    </div>

                                                    {(param.referenceRanges || []).map((range, rIdx) => (
                                                        <div key={rIdx} className="lmd-range-row">
                                                            <div className="lmd-range-field">
                                                                <span className="tiny-lbl">Age:</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={range.minAge}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'minAge', e.target.value)}
                                                                />
                                                                <span>–</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={range.maxAge}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'maxAge', e.target.value)}
                                                                />
                                                                <select
                                                                    value={range.ageUnit}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'ageUnit', e.target.value)}
                                                                >
                                                                    {AGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                                </select>
                                                            </div>

                                                            <div className="lmd-range-field">
                                                                <span className="tiny-lbl">Gender:</span>
                                                                <select
                                                                    value={range.gender}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'gender', e.target.value)}
                                                                >
                                                                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                                                                </select>
                                                            </div>

                                                            <div className="lmd-range-field">
                                                                <span className="tiny-lbl">Normal:</span>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    placeholder="Min"
                                                                    value={range.normalMin ?? ''}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'normalMin', e.target.value)}
                                                                />
                                                                <span>–</span>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    placeholder="Max"
                                                                    value={range.normalMax ?? ''}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'normalMax', e.target.value)}
                                                                />
                                                            </div>

                                                            <div className="lmd-range-field critical">
                                                                <span className="tiny-lbl text-red">Critical:</span>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    placeholder="Panic Low"
                                                                    value={range.criticalLow ?? ''}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'criticalLow', e.target.value)}
                                                                />
                                                                <span>–</span>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    placeholder="Panic High"
                                                                    value={range.criticalHigh ?? ''}
                                                                    onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'criticalHigh', e.target.value)}
                                                                />
                                                            </div>

                                                            <button
                                                                type="button"
                                                                className="lmd-btn-del-sm"
                                                                onClick={() => removeReferenceRange(pIdx, rIdx)}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setTestModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="lmd-btn-primary" disabled={savingTest}>
                                    {savingTest ? 'Saving…' : editingTest ? 'Update Test' : 'Create Test'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL 2: ADD/EDIT PACKAGE
               ========================================================= */}
            {pkgModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setPkgModalOpen(false)}>
                    <div className="lmd-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>{editingPkg ? 'Edit Test Package' : 'Create Health Checkup Package'}</h3>
                            <button className="lmd-close-btn" onClick={() => setPkgModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSavePkg} className="lmd-modal-form">
                            <div className="lmd-form-grid-2">
                                <div className="lmd-form-group">
                                    <label>Package Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Comprehensive Full Body Checkup"
                                        value={pkgForm.packageName}
                                        onChange={(e) => setPkgForm({ ...pkgForm, packageName: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Package Code *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. PKG-FBC"
                                        value={pkgForm.packageCode}
                                        onChange={(e) => setPkgForm({ ...pkgForm, packageCode: e.target.value.toUpperCase() })}
                                    />
                                </div>
                            </div>

                            <div className="lmd-form-group">
                                <label>Description</label>
                                <textarea
                                    rows="2"
                                    placeholder="Coverage summary (e.g. Includes CBC, Liver Function, Kidney Profile, Lipid and Thyroid)..."
                                    value={pkgForm.description}
                                    onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                                />
                            </div>

                            {/* MULTI-SELECT TESTS */}
                            <div className="lmd-form-group">
                                <label>Select Tests to Include in this Package *</label>
                                <div className="lmd-tests-checklist">
                                    {tests.map(t => {
                                        const isSelected = pkgForm.tests.some(id => String(id) === String(t._id));
                                        return (
                                            <label key={t._id} className={`lmd-chk-item ${isSelected ? 'selected' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        const updated = e.target.checked
                                                            ? [...pkgForm.tests, t._id]
                                                            : pkgForm.tests.filter(id => String(id) !== String(t._id));
                                                        setPkgForm({ ...pkgForm, tests: updated });
                                                    }}
                                                />
                                                <span className="chk-title">{t.testName || t.name}</span>
                                                <span className="chk-price">₹{t.standardPrice || t.price || 0}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SERVER SAVINGS & TOTAL CALCULATION */}
                            <div className="lmd-pricing-summary-card">
                                <div className="lmd-psc-row">
                                    <span>Individual Tests Total:</span>
                                    <strong>₹{selectedTestsTotal}</strong>
                                </div>
                                <div className="lmd-psc-row">
                                    <span>Discounted Package Price (₹) *:</span>
                                    <input
                                        type="number"
                                        min="0"
                                        required
                                        style={{ width: '120px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        value={pkgForm.discountedPrice}
                                        onChange={(e) => setPkgForm({ ...pkgForm, discountedPrice: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="lmd-psc-row highlight">
                                    <span>Patient Savings:</span>
                                    <strong className="text-emerald">₹{Math.max(0, selectedTestsTotal - (Number(pkgForm.discountedPrice) || 0))}</strong>
                                </div>
                            </div>

                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setPkgModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="lmd-btn-primary" disabled={savingPkg || pkgForm.tests.length === 0}>
                                    {savingPkg ? 'Saving…' : editingPkg ? 'Update Package' : 'Create Package'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL 3: ADD SPECIMEN / CONTAINER
               ========================================================= */}
            {specimenModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setSpecimenModalOpen(false)}>
                    <div className="lmd-modal-card compact" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>Add Specimen Type</h3>
                            <button className="lmd-close-btn" onClick={() => setSpecimenModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveSpecimen} className="lmd-modal-form">
                            <div className="lmd-form-group">
                                <label>Specimen Code *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. WB, SRM, CSF"
                                    value={specimenForm.specimenCode}
                                    onChange={(e) => setSpecimenForm({ ...specimenForm, specimenCode: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="lmd-form-group">
                                <label>Specimen Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Whole Blood, Cerebrospinal Fluid"
                                    value={specimenForm.specimenName}
                                    onChange={(e) => setSpecimenForm({ ...specimenForm, specimenName: e.target.value })}
                                />
                            </div>
                            <div className="lmd-form-group">
                                <label>Description</label>
                                <input
                                    type="text"
                                    placeholder="Clinical storage or collection note"
                                    value={specimenForm.description}
                                    onChange={(e) => setSpecimenForm({ ...specimenForm, description: e.target.value })}
                                />
                            </div>
                            <div className="lmd-modal-footer">
                                <button type="submit" className="lmd-btn-primary">Save Specimen</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {containerModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setContainerModalOpen(false)}>
                    <div className="lmd-modal-card compact" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>Add Container / Tube Type</h3>
                            <button className="lmd-close-btn" onClick={() => setContainerModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveContainer} className="lmd-modal-form">
                            <div className="lmd-form-group">
                                <label>Container Code *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. EDTA, PLAIN, CITRATE"
                                    value={containerForm.containerCode}
                                    onChange={(e) => setContainerForm({ ...containerForm, containerCode: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="lmd-form-group">
                                <label>Container Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. EDTA Tube (Lavender Top)"
                                    value={containerForm.containerName}
                                    onChange={(e) => setContainerForm({ ...containerForm, containerName: e.target.value })}
                                />
                            </div>
                            <div className="lmd-form-grid-2">
                                <div className="lmd-form-group">
                                    <label>Tube Cap Color</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Lavender, Red, Grey"
                                        value={containerForm.tubeColor}
                                        onChange={(e) => setContainerForm({ ...containerForm, tubeColor: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Additive</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. K2 EDTA"
                                        value={containerForm.additive}
                                        onChange={(e) => setContainerForm({ ...containerForm, additive: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="lmd-modal-footer">
                                <button type="submit" className="lmd-btn-primary">Save Container</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL 4: ADD/EDIT REFERRING DOCTOR
               ========================================================= */}
            {doctorModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setDoctorModalOpen(false)}>
                    <div className="lmd-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>{editingDoctor ? 'Edit Referring Doctor' : 'Register New Referring Doctor'}</h3>
                            <button className="lmd-close-btn" onClick={() => setDoctorModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveDoctor} className="lmd-modal-form">
                            <div className="lmd-form-grid-2">
                                <div className="lmd-form-group">
                                    <label>Doctor Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Dr. A. K. Sharma"
                                        value={doctorForm.doctorName}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, doctorName: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Registration Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. MCI-2018-98745"
                                        value={doctorForm.registrationNumber}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, registrationNumber: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Qualification</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. MBBS, MD (Medicine)"
                                        value={doctorForm.qualification}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, qualification: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Specialization</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Cardiology, Endocrinology"
                                        value={doctorForm.specialization}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Clinic / Hospital Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. City Care Polyclinic"
                                        value={doctorForm.clinicHospitalName}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, clinicHospitalName: e.target.value })}
                                    />
                                </div>
                                <div className="lmd-form-group">
                                    <label>Contact Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 9876543210"
                                        value={doctorForm.contactNumber}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, contactNumber: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setDoctorModalOpen(false)}>Cancel</button>
                                <button type="submit" className="lmd-btn-primary" disabled={savingDoctor}>
                                    {savingDoctor ? 'Saving…' : 'Save Doctor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL 5: CSV IMPORT MODAL
               ========================================================= */}
            {csvImportModal && (
                <div className="lmd-modal-overlay" onClick={() => setCsvImportModal(false)}>
                    <div className="lmd-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>Import Test Catalog from CSV</h3>
                            <button className="lmd-close-btn" onClick={() => setCsvImportModal(false)}>✕</button>
                        </div>
                        <div className="lmd-modal-form">
                            <p className="subtext">
                                Paste standard CSV content below. Required columns: <code>TestName</code> or <code>Name</code>.
                                Optional columns: <code>TestCode</code>, <code>Department</code>, <code>Category</code>, <code>StandardPrice</code>.
                            </p>
                            <textarea
                                rows="8"
                                className="lmd-csv-textarea"
                                placeholder={`TestCode,TestName,Department,StandardPrice\nCBC,Complete Blood Count,Hematology,350\nLFT,Liver Function Test,Biochemistry,650`}
                                value={csvText}
                                onChange={(e) => setCsvText(e.target.value)}
                            />
                            <div className="lmd-modal-footer">
                                <button className="lmd-btn-cancel" onClick={() => setCsvImportModal(false)}>Cancel</button>
                                <button className="lmd-btn-primary" onClick={handleImportCsv} disabled={importingCsv || !csvText.trim()}>
                                    {importingCsv ? 'Processing Import…' : 'Import CSV Records'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </LabLayout>
    );
};

export default LabMasterCatalogPage;

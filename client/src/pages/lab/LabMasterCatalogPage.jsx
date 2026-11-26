import React, { useState, useEffect, useMemo } from 'react';
import LabLayout from '../../components/lab/LabLayout';
import { labAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiLayers, FiPlus, FiEdit2, FiTrash2, FiSearch, FiDownload,
    FiUpload, FiDollarSign, FiUserCheck, FiBox, FiCheckCircle,
    FiXCircle, FiRefreshCw, FiSliders, FiX, FiDroplet
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

const TEST_CATEGORIES = [
    'General',
    'Routine',
    'Specialized',
    'Stat / Emergency',
    'Screening',
    'Profile'
];

const AGE_UNITS = ['Years', 'Months', 'Days'];
const GENDERS = ['Any', 'Male', 'Female', 'Other'];
const DATA_TYPES = ['Numeric', 'Text', 'Choice'];

const TUBE_COLOR_MAP = {
    lavender: '#8b5cf6',
    purple: '#8b5cf6',
    red: '#ef4444',
    'light blue': '#38bdf8',
    blue: '#2563eb',
    'royal blue': '#1d4ed8',
    grey: '#64748b',
    gray: '#64748b',
    green: '#10b981',
    yellow: '#eab308',
    gold: '#ca8a04',
    black: '#0f172a',
    pink: '#ec4899',
    white: '#e2e8f0'
};

const resolveTubeHex = (tubeColor, explicitHex) => {
    if (explicitHex && explicitHex.startsWith('#')) return explicitHex;
    const key = String(tubeColor || '').toLowerCase().trim();
    return TUBE_COLOR_MAP[key] || '#8b5cf6';
};

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
    const [pkgTestFilter, setPkgTestFilter] = useState('');
    const [savingPkg, setSavingPkg] = useState(false);

    // ── Specimens & Containers State ──
    const [specimens, setSpecimens] = useState([]);
    const [containers, setContainers] = useState([]);
    const [specimensLoading, setSpecimensLoading] = useState(false);
    const [specimenModalOpen, setSpecimenModalOpen] = useState(false);
    const [editingSpecimenIdx, setEditingSpecimenIdx] = useState(null);
    const [specimenForm, setSpecimenForm] = useState({ specimenCode: '', specimenName: '', description: '' });
    const [containerModalOpen, setContainerModalOpen] = useState(false);
    const [editingContainerIdx, setEditingContainerIdx] = useState(null);
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
            standardPrice: t.standardPrice ?? t.price ?? 0,
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
        setPkgTestFilter('');
        setPkgModalOpen(true);
    };

    const handleOpenEditPkg = (p) => {
        setEditingPkg(p);
        setPkgForm({
            packageName: p.packageName || p.name || '',
            packageCode: p.packageCode || p.code || '',
            description: p.description || '',
            tests: (p.tests || []).map(t => (t._id || t)),
            discountedPrice: p.discountedPrice ?? 0,
            department: p.department || 'Health Packages',
            category: p.category || 'General'
        });
        setPkgTestFilter('');
        setPkgModalOpen(true);
    };

    const handleTogglePkgStatus = async (id) => {
        try {
            const res = await labAPI.master.togglePackageStatus(id);
            if (res.success) {
                toast.success(res.message);
                loadPackages();
            }
        } catch (err) {
            toast.error('Failed to update package status');
        }
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

    const filteredTestsForPkg = useMemo(() => {
        const q = pkgTestFilter.trim().toLowerCase();
        if (!q) return tests;
        return tests.filter(t =>
            String(t.testName || t.name || '').toLowerCase().includes(q) ||
            String(t.testCode || t.code || '').toLowerCase().includes(q) ||
            String(t.department || '').toLowerCase().includes(q)
        );
    }, [tests, pkgTestFilter]);


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

    const handleOpenAddSpecimen = () => {
        setEditingSpecimenIdx(null);
        setSpecimenForm({ specimenCode: '', specimenName: '', description: '' });
        setSpecimenModalOpen(true);
    };

    const handleOpenEditSpecimen = (s, idx) => {
        setEditingSpecimenIdx(idx);
        setSpecimenForm({
            specimenCode: s.specimenCode || s.code || '',
            specimenName: s.specimenName || s.name || '',
            description: s.description || ''
        });
        setSpecimenModalOpen(true);
    };

    const handleDeleteSpecimen = (idx) => {
        const target = specimens[idx];
        if (!window.confirm(`Remove specimen "${target?.specimenName || target?.specimenCode}" from view?`)) return;
        setSpecimens(prev => prev.filter((_, i) => i !== idx));
        toast.success('Specimen removed');
    };

    const handleSaveSpecimen = async (e) => {
        e.preventDefault();
        try {
            if (editingSpecimenIdx !== null) {
                const target = specimens[editingSpecimenIdx];
                if (!target?._id) {
                    const res = await labAPI.master.createSpecimen(specimenForm);
                    if (res.success) {
                        toast.success('Specimen standard saved!');
                        setSpecimenModalOpen(false);
                        loadSpecimensAndContainers();
                        return;
                    }
                } else {
                    setSpecimens(prev => prev.map((item, idx) => (idx === editingSpecimenIdx ? { ...item, ...specimenForm } : item)));
                    toast.success('Specimen details updated!');
                    setSpecimenModalOpen(false);
                    return;
                }
            }
            const res = await labAPI.master.createSpecimen(specimenForm);
            if (res.success) {
                toast.success('Specimen type added!');
                setSpecimenModalOpen(false);
                setSpecimenForm({ specimenCode: '', specimenName: '', description: '' });
                loadSpecimensAndContainers();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving specimen');
        }
    };

    const handleOpenAddContainer = () => {
        setEditingContainerIdx(null);
        setContainerForm({ containerCode: '', containerName: '', tubeColor: 'Lavender', additive: '', minimumVolume: '2 ml' });
        setContainerModalOpen(true);
    };

    const handleOpenEditContainer = (c, idx) => {
        setEditingContainerIdx(idx);
        setContainerForm({
            containerCode: c.containerCode || c.code || '',
            containerName: c.containerName || c.name || '',
            tubeColor: c.tubeColor || 'Lavender',
            additive: c.additive || '',
            minimumVolume: c.minimumVolume || '2 ml'
        });
        setContainerModalOpen(true);
    };

    const handleDeleteContainer = (idx) => {
        const target = containers[idx];
        if (!window.confirm(`Remove container "${target?.containerName || target?.containerCode}" from view?`)) return;
        setContainers(prev => prev.filter((_, i) => i !== idx));
        toast.success('Container removed');
    };

    const handleSaveContainer = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...containerForm,
                labelColor: resolveTubeHex(containerForm.tubeColor)
            };
            if (editingContainerIdx !== null) {
                const target = containers[editingContainerIdx];
                if (!target?._id) {
                    const res = await labAPI.master.createContainer(payload);
                    if (res.success) {
                        toast.success('Container standard saved!');
                        setContainerModalOpen(false);
                        loadSpecimensAndContainers();
                        return;
                    }
                } else {
                    setContainers(prev => prev.map((item, idx) => (idx === editingContainerIdx ? { ...item, ...payload } : item)));
                    toast.success('Container details updated!');
                    setContainerModalOpen(false);
                    return;
                }
            }
            const res = await labAPI.master.createContainer(payload);
            if (res.success) {
                toast.success('Container type added!');
                setContainerModalOpen(false);
                setContainerForm({ containerCode: '', containerName: '', tubeColor: 'Lavender', additive: '', minimumVolume: '2 ml' });
                loadSpecimensAndContainers();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving container');
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
            title="Test Catalogue & Master Standards"
            subtitle="Diagnostic tests, biological reference ranges, health packages, specimen containers & tariff master"
        >
            <div className="lmd-module-root">
                {/* Top Navigation Tabs */}
                <div className="lmd-tab-nav" role="tablist">
                    <button
                        type="button"
                        className={`lmd-tab-btn ${activeTab === 'tests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('tests')}
                    >
                        <FiLayers /> Test Catalog &amp; Parameters
                    </button>
                    <button
                        type="button"
                        className={`lmd-tab-btn ${activeTab === 'packages' ? 'active' : ''}`}
                        onClick={() => setActiveTab('packages')}
                    >
                        <FiBox /> Packages &amp; Profiles
                    </button>
                    <button
                        type="button"
                        className={`lmd-tab-btn ${activeTab === 'specimens' ? 'active' : ''}`}
                        onClick={() => setActiveTab('specimens')}
                    >
                        <FiSliders /> Specimens &amp; Containers
                    </button>
                    <button
                        type="button"
                        className={`lmd-tab-btn ${activeTab === 'doctors' ? 'active' : ''}`}
                        onClick={() => setActiveTab('doctors')}
                    >
                        <FiUserCheck /> Referring Doctors
                    </button>
                    <button
                        type="button"
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
                                <button type="button" className="lmd-btn-filter" onClick={loadTests}>Search</button>
                            </div>

                            <div className="lmd-filter-selects">
                                <select
                                    value={testDeptFilter}
                                    onChange={(e) => { setTestDeptFilter(e.target.value); setTimeout(loadTests, 10); }}
                                >
                                    <option value="all">All Departments</option>
                                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>

                                <select
                                    value={testActiveFilter}
                                    onChange={(e) => { setTestActiveFilter(e.target.value); setTimeout(loadTests, 10); }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="true">Active Only</option>
                                    <option value="false">Inactive Only</option>
                                </select>
                            </div>

                            <div className="lmd-actions-right">
                                <button type="button" className="lmd-btn-outline" onClick={handleExportTestsCsv} title="Download CSV">
                                    <FiDownload /> Export CSV
                                </button>
                                <button type="button" className="lmd-btn-outline" onClick={() => setCsvImportModal(true)} title="Import CSV">
                                    <FiUpload /> Import CSV
                                </button>
                                <button type="button" className="lmd-btn-primary" onClick={handleOpenCreateTest}>
                                    <FiPlus /> Add New Test
                                </button>
                            </div>
                        </div>

                        <div className="lmd-table-wrapper">
                            {testsLoading ? (
                                <div className="lmd-loading-box">
                                    <FiRefreshCw className="spin" size={22} />
                                    <span>Loading diagnostic test catalog...</span>
                                </div>
                            ) : tests.length === 0 ? (
                                <div className="lmd-empty-box">
                                    <p>No diagnostic tests match your criteria.</p>
                                    <button type="button" className="lmd-btn-primary" onClick={handleOpenCreateTest}>
                                        <FiPlus /> Create First Test
                                    </button>
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
                                            <th className="col-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tests.map(t => (
                                            <tr key={t._id}>
                                                <td>
                                                    <span className="lmd-code-badge">{t.testCode || t.code}</span>
                                                </td>
                                                <td>
                                                    <div className="bold">{t.testName || t.name}</div>
                                                    {t.shortName && <div className="subtext">({t.shortName})</div>}
                                                </td>
                                                <td><span className="lmd-tag">{t.department || 'General'}</span></td>
                                                <td>
                                                    <div className="bold" style={{ fontSize: '13px', fontWeight: 600 }}>{t.specimenType}</div>
                                                    <div className="subtext">{t.containerType} ({t.requiredVolume})</div>
                                                </td>
                                                <td>{t.turnaroundTime || 24} {t.tatUnit || 'h'}</td>
                                                <td>
                                                    <span className="lmd-pill">
                                                        {(t.parameters || []).length} parameter(s)
                                                    </span>
                                                </td>
                                                <td className="bold text-emerald">₹{Number(t.standardPrice || t.price || 0).toLocaleString('en-IN')}</td>
                                                <td>
                                                    <span className={`lmd-status-dot ${t.isActive !== false ? 'active' : 'inactive'}`}>
                                                        {t.isActive !== false ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="col-right">
                                                    <div className="lmd-table-actions">
                                                        <button type="button" onClick={() => handleOpenEditTest(t)} className="lmd-icon-btn" title="Edit Test & Parameters">
                                                            <FiEdit2 />
                                                        </button>
                                                        <button
                                                            type="button"
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
                            <div>
                                <h3 className="lmd-action-bar-title">Health Checkup Packages &amp; Profiles ({packages.length})</h3>
                                <p className="subtext">Bundled diagnostic panels with automated patient savings calculation</p>
                            </div>
                            <div className="lmd-actions-right">
                                <button type="button" className="lmd-btn-primary" onClick={handleOpenCreatePkg}>
                                    <FiPlus /> Create New Package
                                </button>
                            </div>
                        </div>

                        <div className="lmd-table-wrapper">
                            {packagesLoading ? (
                                <div className="lmd-loading-box"><FiRefreshCw className="spin" size={22} /> Loading packages...</div>
                            ) : packages.length === 0 ? (
                                <div className="lmd-empty-box">
                                    <p>No bundled test packages created yet.</p>
                                    <button type="button" className="lmd-btn-primary" onClick={handleOpenCreatePkg}>
                                        <FiPlus /> Create First Package
                                    </button>
                                </div>
                            ) : (
                                <table className="lmd-table">
                                    <thead>
                                        <tr>
                                            <th>Code</th>
                                            <th>Package Name</th>
                                            <th>Included Tests</th>
                                            <th>Individual Total</th>
                                            <th>Package Price</th>
                                            <th>Patient Savings</th>
                                            <th>Status</th>
                                            <th className="col-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {packages.map(p => (
                                            <tr key={p._id}>
                                                <td>
                                                    <span className="lmd-code-badge purple">{p.packageCode || p.code}</span>
                                                </td>
                                                <td>
                                                    <div className="bold">{p.packageName || p.name}</div>
                                                    {p.description && <div className="subtext">{p.description}</div>}
                                                </td>
                                                <td>
                                                    <div className="lmd-tag-list">
                                                        {(p.tests || []).map((t, idx) => (
                                                            <span key={t._id || idx} className="lmd-tag">{t.testName || t.name || 'Test'}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td>₹{Number(p.standardPrice || p.price || 0).toLocaleString('en-IN')}</td>
                                                <td className="bold text-emerald">₹{Number(p.discountedPrice ?? p.standardPrice ?? 0).toLocaleString('en-IN')}</td>
                                                <td>
                                                    {p.savings > 0 ? (
                                                        <span className="lmd-savings-badge">Save ₹{Number(p.savings).toLocaleString('en-IN')}</span>
                                                    ) : '—'}
                                                </td>
                                                <td>
                                                    <span className={`lmd-status-dot ${p.isActive !== false ? 'active' : 'inactive'}`}>
                                                        {p.isActive !== false ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="col-right">
                                                    <div className="lmd-table-actions">
                                                        <button type="button" onClick={() => handleOpenEditPkg(p)} className="lmd-icon-btn" title="Edit Package">
                                                            <FiEdit2 />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTogglePkgStatus(p._id)}
                                                            className={`lmd-icon-btn ${p.isActive !== false ? 'btn-deactivate' : 'btn-activate'}`}
                                                            title={p.isActive !== false ? 'Deactivate Package' : 'Activate Package'}
                                                        >
                                                            {p.isActive !== false ? <FiXCircle /> : <FiCheckCircle />}
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
                    TAB 3: SPECIMENS & CONTAINERS MASTER (Section 3)
                   ========================================================= */}
                {activeTab === 'specimens' && (
                    <div className="lmd-stack-sections">
                        {/* Section A: Specimen Types */}
                        <section className="lmd-section-card">
                            <div className="lmd-section-card-header">
                                <div className="lmd-section-title-group">
                                    <span className="lmd-section-icon-badge">
                                        <FiDroplet />
                                    </span>
                                    <div>
                                        <h3 className="lmd-section-heading">Specimen Types</h3>
                                        <p className="lmd-section-subtitle">Standardized clinical biological specimens for sample collection &amp; barcoding</p>
                                    </div>
                                </div>
                                <button type="button" className="lmd-btn-primary" onClick={handleOpenAddSpecimen}>
                                    <FiPlus /> Add Specimen
                                </button>
                            </div>

                            <div className="lmd-table-wrapper">
                                {specimensLoading ? (
                                    <div className="lmd-loading-box"><FiRefreshCw className="spin" size={20} /> Loading specimen types...</div>
                                ) : specimens.length === 0 ? (
                                    <div className="lmd-empty-box">
                                        <p>No specimen types configured yet.</p>
                                        <button type="button" className="lmd-btn-primary" onClick={handleOpenAddSpecimen}>
                                            <FiPlus /> Add First Specimen
                                        </button>
                                    </div>
                                ) : (
                                    <table className="lmd-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '130px' }}>Code</th>
                                                <th style={{ width: '240px' }}>Name</th>
                                                <th>Description</th>
                                                <th className="col-right" style={{ width: '120px' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {specimens.map((s, idx) => (
                                                <tr key={s._id || `${s.specimenCode}-${idx}`}>
                                                    <td>
                                                        <span className="lmd-code-badge">{s.specimenCode || s.code}</span>
                                                    </td>
                                                    <td className="bold">{s.specimenName || s.name}</td>
                                                    <td>{s.description || '—'}</td>
                                                    <td className="col-right">
                                                        <div className="lmd-table-actions">
                                                            <button
                                                                type="button"
                                                                className="lmd-icon-btn"
                                                                onClick={() => handleOpenEditSpecimen(s, idx)}
                                                                title="Edit Specimen"
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="lmd-icon-btn danger"
                                                                onClick={() => handleDeleteSpecimen(idx)}
                                                                title="Remove Specimen"
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </section>

                        {/* Section B: Container / Tube Standards */}
                        <section className="lmd-section-card">
                            <div className="lmd-section-card-header">
                                <div className="lmd-section-title-group">
                                    <span className="lmd-section-icon-badge teal">
                                        <FiSliders />
                                    </span>
                                    <div>
                                        <h3 className="lmd-section-heading">Container / Tube Standards</h3>
                                        <p className="lmd-section-subtitle">Vacutainer cap colors, chemical additives, and minimum draw volume requirements</p>
                                    </div>
                                </div>
                                <button type="button" className="lmd-btn-primary" onClick={handleOpenAddContainer}>
                                    <FiPlus /> Add Container
                                </button>
                            </div>

                            <div className="lmd-table-wrapper">
                                {specimensLoading ? (
                                    <div className="lmd-loading-box"><FiRefreshCw className="spin" size={20} /> Loading container standards...</div>
                                ) : containers.length === 0 ? (
                                    <div className="lmd-empty-box">
                                        <p>No container standards configured yet.</p>
                                        <button type="button" className="lmd-btn-primary" onClick={handleOpenAddContainer}>
                                            <FiPlus /> Add First Container
                                        </button>
                                    </div>
                                ) : (
                                    <table className="lmd-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '130px' }}>Code</th>
                                                <th>Container Name</th>
                                                <th style={{ width: '160px' }}>Color</th>
                                                <th>Additive</th>
                                                <th style={{ width: '110px' }}>Volume</th>
                                                <th className="col-right" style={{ width: '120px' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {containers.map((c, idx) => (
                                                <tr key={c._id || `${c.containerCode}-${idx}`}>
                                                    <td>
                                                        <span className="lmd-code-badge teal">{c.containerCode || c.code}</span>
                                                    </td>
                                                    <td className="bold">{c.containerName || c.name}</td>
                                                    <td>
                                                        <span className="lmd-tube-color-pill">
                                                            <span
                                                                className="lmd-color-dot"
                                                                style={{ background: resolveTubeHex(c.tubeColor, c.labelColor) }}
                                                            />
                                                            <span>{c.tubeColor || 'Standard'}</span>
                                                        </span>
                                                    </td>
                                                    <td>{c.additive || 'None'}</td>
                                                    <td>
                                                        <span className="lmd-pill">{c.minimumVolume || '2 ml'}</span>
                                                    </td>
                                                    <td className="col-right">
                                                        <div className="lmd-table-actions">
                                                            <button
                                                                type="button"
                                                                className="lmd-icon-btn"
                                                                onClick={() => handleOpenEditContainer(c, idx)}
                                                                title="Edit Container"
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="lmd-icon-btn danger"
                                                                onClick={() => handleDeleteContainer(idx)}
                                                                title="Remove Container"
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </section>
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
                                <button type="button" className="lmd-btn-filter" onClick={loadDoctors}>Search</button>
                            </div>
                            <div className="lmd-actions-right">
                                <button
                                    type="button"
                                    className="lmd-btn-primary"
                                    onClick={() => { setEditingDoctor(null); setDoctorForm(defaultDoctorForm()); setDoctorModalOpen(true); }}
                                >
                                    <FiPlus /> Register Referring Doctor
                                </button>
                            </div>
                        </div>

                        <div className="lmd-table-wrapper">
                            {doctorsLoading ? (
                                <div className="lmd-loading-box"><FiRefreshCw className="spin" size={20} /> Loading doctors directory...</div>
                            ) : doctors.length === 0 ? (
                                <div className="lmd-empty-box">
                                    <p>No referring doctors registered yet.</p>
                                    <button
                                        type="button"
                                        className="lmd-btn-primary"
                                        onClick={() => { setEditingDoctor(null); setDoctorForm(defaultDoctorForm()); setDoctorModalOpen(true); }}
                                    >
                                        <FiPlus /> Register First Doctor
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
                                            <th className="col-right">Actions</th>
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
                                                    {d.email && <div className="subtext">{d.email}</div>}
                                                </td>
                                                <td>
                                                    {d.commissionRule?.type && d.commissionRule?.type !== 'NONE' ? (
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
                                                <td className="col-right">
                                                    <div className="lmd-table-actions">
                                                        <button
                                                            type="button"
                                                            onClick={() => { setEditingDoctor(d); setDoctorForm(d); setDoctorModalOpen(true); }}
                                                            className="lmd-icon-btn"
                                                            title="Edit Doctor"
                                                        >
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
                                <h3 className="lmd-action-bar-title">Standard Price List</h3>
                                <p className="subtext">Bulk edit laboratory tariffs and packages. Prices must be non-negative values.</p>
                            </div>
                            <div className="lmd-actions-right">
                                <button
                                    type="button"
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
                                <div className="lmd-loading-box"><FiRefreshCw className="spin" size={20} /> Loading price list...</div>
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
                                                    <td><span className="lmd-code-badge">{t.code}</span></td>
                                                    <td className="bold">{t.name}</td>
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
                                                <tr key={p.id}>
                                                    <td><span className="lmd-badge-pkg">PACKAGE</span></td>
                                                    <td><span className="lmd-code-badge purple">{p.code}</span></td>
                                                    <td className="bold">{p.name}</td>
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
            </div>

            {/* =====================================================================
                MODAL 1: CREATE / EDIT DIAGNOSTIC TEST (Section 1)
               ===================================================================== */}
            {testModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setTestModalOpen(false)}>
                    <div className="lmd-modal-card wide" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <div className="lmd-modal-title-wrap">
                                <span className="lmd-modal-hdr-icon">
                                    <FiLayers />
                                </span>
                                <div>
                                    <h3>{editingTest ? 'Edit Diagnostic Test' : 'Create New Diagnostic Test'}</h3>
                                    <p className="lmd-modal-hdr-sub">Configure test details, clinical parameters, and age/gender biological reference ranges</p>
                                </div>
                            </div>
                            <button type="button" className="lmd-close-btn" onClick={() => setTestModalOpen(false)} aria-label="Close modal">
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTest} className="lmd-modal-form-shell">
                            <div className="lmd-modal-body">
                                {/* B. Test Information Form */}
                                <div className="lmd-form-section-box">
                                    <p className="lmd-form-section-label">Test Information &amp; Specimen Requirements</p>

                                    <div className="lmd-form-grid-3">
                                        <div className="lmd-form-group">
                                            <label>Test Name <span className="lmd-req">*</span></label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Complete Blood Count (CBC)"
                                                value={testForm.testName}
                                                onChange={(e) => setTestForm({ ...testForm, testName: e.target.value })}
                                            />
                                        </div>
                                        <div className="lmd-form-group">
                                            <label>Test Code <span className="lmd-req">*</span></label>
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
                                            <label>Department <span className="lmd-req">*</span></label>
                                            <select
                                                value={testForm.department}
                                                onChange={(e) => setTestForm({ ...testForm, department: e.target.value })}
                                            >
                                                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                        </div>
                                        <div className="lmd-form-group">
                                            <label>Category</label>
                                            <select
                                                value={testForm.category || 'General'}
                                                onChange={(e) => setTestForm({ ...testForm, category: e.target.value })}
                                            >
                                                {TEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
                                            <label>Container</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. EDTA Tube, Plain Tube"
                                                value={testForm.containerType}
                                                onChange={(e) => setTestForm({ ...testForm, containerType: e.target.value })}
                                            />
                                        </div>
                                        <div className="lmd-form-group">
                                            <label>Sample Volume</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. 2-3 ml"
                                                value={testForm.requiredVolume}
                                                onChange={(e) => setTestForm({ ...testForm, requiredVolume: e.target.value })}
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

                                        <div className="lmd-form-group">
                                            <label>Standard Price (₹) <span className="lmd-req">*</span></label>
                                            <input
                                                type="number"
                                                min="0"
                                                required
                                                placeholder="e.g. 350"
                                                value={testForm.standardPrice}
                                                onChange={(e) => setTestForm({ ...testForm, standardPrice: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    <div className="lmd-fasting-box">
                                        <label className="lmd-chk-label">
                                            <input
                                                type="checkbox"
                                                checked={testForm.fastingRequired}
                                                onChange={(e) => setTestForm({ ...testForm, fastingRequired: e.target.checked })}
                                            />
                                            <span>Fasting Required for this diagnostic test</span>
                                        </label>
                                        {testForm.fastingRequired && (
                                            <div className="lmd-form-group">
                                                <label>Fasting Instructions</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 10–12 hours overnight water-only fasting required"
                                                    value={testForm.fastingInstructions}
                                                    onChange={(e) => setTestForm({ ...testForm, fastingInstructions: e.target.value })}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* C & D. Test Parameters & Biological Reference Ranges */}
                                <div className="lmd-sub-section">
                                    <div className="lmd-sub-section-hdr">
                                        <div>
                                            <h4>Test Parameters &amp; Biological Reference Ranges ({testForm.parameters.length})</h4>
                                            <p className="subtext">Define analyte parameters, measurement units, precision, and age/gender reference intervals.</p>
                                        </div>
                                        <button type="button" className="lmd-btn-secondary-blue" onClick={addParameter}>
                                            <FiPlus size={14} /> Add Parameter
                                        </button>
                                    </div>

                                    {testForm.parameters.length === 0 ? (
                                        <div className="lmd-param-empty">
                                            No parameters defined yet. Click <strong>&ldquo;Add Parameter&rdquo;</strong> to configure clinical analytes (e.g., Hemoglobin, Total WBC Count, Platelet Count).
                                        </div>
                                    ) : (
                                        <div className="lmd-param-list">
                                            {testForm.parameters.map((param, pIdx) => (
                                                <div key={param._id || pIdx} className="lmd-param-card">
                                                    {/* Parameter Card Header */}
                                                    <div className="lmd-param-card-topbar">
                                                        <div className="lmd-param-badge-group">
                                                            <span className="lmd-param-num">Parameter #{pIdx + 1}</span>
                                                            {param.parameterCode && (
                                                                <span className="lmd-param-code-lbl">{param.parameterCode}</span>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="lmd-btn-danger-ghost"
                                                            onClick={() => removeParameter(pIdx)}
                                                            title="Delete Parameter"
                                                        >
                                                            <FiTrash2 size={13} /> Delete Parameter
                                                        </button>
                                                    </div>

                                                    <div className="lmd-param-body">
                                                        {/* Parameter Fields Grid */}
                                                        <div className="lmd-param-fields-grid">
                                                            <div className="lmd-form-group">
                                                                <label>Parameter Name <span className="lmd-req">*</span></label>
                                                                <input
                                                                    type="text"
                                                                    required
                                                                    placeholder="e.g. Hemoglobin"
                                                                    value={param.parameterName}
                                                                    onChange={(e) => updateParameterField(pIdx, 'parameterName', e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="lmd-form-group">
                                                                <label>Unit</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. g/dL"
                                                                    value={param.unit}
                                                                    onChange={(e) => updateParameterField(pIdx, 'unit', e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="lmd-form-group">
                                                                <label>Parameter Type</label>
                                                                <select
                                                                    value={param.dataType}
                                                                    onChange={(e) => updateParameterField(pIdx, 'dataType', e.target.value)}
                                                                >
                                                                    {DATA_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                                                                </select>
                                                            </div>
                                                            <div className="lmd-form-group">
                                                                <label>Decimal Precision</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="4"
                                                                    disabled={param.dataType !== 'Numeric'}
                                                                    value={param.decimalPlaces ?? 0}
                                                                    onChange={(e) => updateParameterField(pIdx, 'decimalPlaces', Number(e.target.value))}
                                                                />
                                                            </div>
                                                        </div>

                                                        {param.dataType === 'Choice' && (
                                                            <div className="lmd-form-group">
                                                                <label>Allowed Choices (comma-separated)</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. Negative, Positive, Reactive, Non-Reactive"
                                                                    value={Array.isArray(param.choices) ? param.choices.join(', ') : ''}
                                                                    onChange={(e) => updateParameterField(
                                                                        pIdx,
                                                                        'choices',
                                                                        e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                                                    )}
                                                                />
                                                            </div>
                                                        )}

                                                        {/* D. Biological Reference Ranges */}
                                                        <div className="lmd-ranges-block">
                                                            <div className="lmd-ranges-hdr">
                                                                <div className="lmd-ranges-title-wrap">
                                                                    <span className="lmd-ranges-title">Biological Reference Ranges</span>
                                                                    <span className="lmd-ranges-count">
                                                                        {(param.referenceRanges || []).length} interval{(param.referenceRanges || []).length === 1 ? '' : 's'}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="lmd-btn-add-interval"
                                                                    onClick={() => addReferenceRange(pIdx)}
                                                                >
                                                                    <FiPlus size={13} /> Add Range Interval
                                                                </button>
                                                            </div>

                                                            {(param.referenceRanges || []).length === 0 ? (
                                                                <div className="subtext" style={{ padding: '4px 2px' }}>
                                                                    No reference intervals added for this parameter. Click &ldquo;Add Range Interval&rdquo; above to add one.
                                                                </div>
                                                            ) : (
                                                                <div className="lmd-intervals-stack">
                                                                    {(param.referenceRanges || []).map((range, rIdx) => (
                                                                        <div key={range._id || rIdx} className="lmd-interval-card">
                                                                            <div className="lmd-interval-topbar">
                                                                                <span className="lmd-interval-tag">Range Interval #{rIdx + 1}</span>
                                                                                <button
                                                                                    type="button"
                                                                                    className="lmd-btn-danger-ghost"
                                                                                    onClick={() => removeReferenceRange(pIdx, rIdx)}
                                                                                    title="Remove Range Interval"
                                                                                >
                                                                                    <FiTrash2 size={12} /> Remove Range
                                                                                </button>
                                                                            </div>

                                                                            <div className="lmd-range-grid">
                                                                                <div className="lmd-range-cell">
                                                                                    <label>Minimum Age</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        value={range.minAge ?? 0}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'minAge', e.target.value)}
                                                                                    />
                                                                                </div>

                                                                                <div className="lmd-range-cell">
                                                                                    <label>Maximum Age</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        value={range.maxAge ?? 120}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'maxAge', e.target.value)}
                                                                                    />
                                                                                </div>

                                                                                <div className="lmd-range-cell">
                                                                                    <label>Age Unit</label>
                                                                                    <select
                                                                                        value={range.ageUnit || 'Years'}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'ageUnit', e.target.value)}
                                                                                    >
                                                                                        {AGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                                                    </select>
                                                                                </div>

                                                                                <div className="lmd-range-cell">
                                                                                    <label>Biological Gender</label>
                                                                                    <select
                                                                                        value={range.gender || 'Any'}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'gender', e.target.value)}
                                                                                    >
                                                                                        {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                                                                                    </select>
                                                                                </div>

                                                                                <div className="lmd-range-cell">
                                                                                    <label>Normal Minimum</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        step="any"
                                                                                        placeholder="Min value"
                                                                                        value={range.normalMin ?? ''}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'normalMin', e.target.value)}
                                                                                    />
                                                                                </div>

                                                                                <div className="lmd-range-cell">
                                                                                    <label>Normal Maximum</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        step="any"
                                                                                        placeholder="Max value"
                                                                                        value={range.normalMax ?? ''}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'normalMax', e.target.value)}
                                                                                    />
                                                                                </div>

                                                                                <div className="lmd-range-cell critical">
                                                                                    <label>Critical Low</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        step="any"
                                                                                        placeholder="Panic low"
                                                                                        value={range.criticalLow ?? ''}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'criticalLow', e.target.value)}
                                                                                    />
                                                                                </div>

                                                                                <div className="lmd-range-cell critical">
                                                                                    <label>Critical High</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        step="any"
                                                                                        placeholder="Panic high"
                                                                                        value={range.criticalHigh ?? ''}
                                                                                        onChange={(e) => updateReferenceRangeField(pIdx, rIdx, 'criticalHigh', e.target.value)}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
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

            {/* =====================================================================
                MODAL 2: CREATE / EDIT HEALTH CHECKUP PACKAGE (Section 2)
               ===================================================================== */}
            {pkgModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setPkgModalOpen(false)}>
                    <div className="lmd-modal-card pkg" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <div className="lmd-modal-title-wrap">
                                <span className="lmd-modal-hdr-icon">
                                    <FiBox />
                                </span>
                                <div>
                                    <h3>{editingPkg ? 'Edit Health Checkup Package' : 'Create Health Checkup Package'}</h3>
                                    <p className="lmd-modal-hdr-sub">Bundle diagnostic investigations with transparent patient package pricing</p>
                                </div>
                            </div>
                            <button type="button" className="lmd-close-btn" onClick={() => setPkgModalOpen(false)} aria-label="Close modal">
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSavePkg} className="lmd-modal-form-shell">
                            <div className="lmd-modal-body">
                                {/* B. Package Information */}
                                <div className="lmd-form-grid-2">
                                    <div className="lmd-form-group">
                                        <label>Package Name <span className="lmd-req">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Comprehensive Full Body Checkup"
                                            value={pkgForm.packageName}
                                            onChange={(e) => setPkgForm({ ...pkgForm, packageName: e.target.value })}
                                        />
                                    </div>
                                    <div className="lmd-form-group">
                                        <label>Package Code <span className="lmd-req">*</span></label>
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
                                        rows="3"
                                        placeholder="Coverage summary (e.g. Includes Complete Blood Count, Liver Function, Renal Profile, Lipid Profile & Thyroid Panel)..."
                                        value={pkgForm.description}
                                        onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                                    />
                                </div>

                                {/* C. Select Tests Section */}
                                <div className="lmd-form-group">
                                    <div className="lmd-select-tests-header">
                                        <label style={{ margin: 0 }}>
                                            Select Tests to Include <span className="lmd-req">*</span>{' '}
                                            <span className="lmd-pill" style={{ marginLeft: '6px' }}>
                                                {pkgForm.tests.length} selected
                                            </span>
                                        </label>
                                        <input
                                            type="text"
                                            className="lmd-pkg-filter-input"
                                            placeholder="Filter tests by name or code..."
                                            value={pkgTestFilter}
                                            onChange={(e) => setPkgTestFilter(e.target.value)}
                                        />
                                    </div>

                                    <div className="lmd-tests-checklist">
                                        {filteredTestsForPkg.length === 0 ? (
                                            <div className="subtext" style={{ padding: '18px', textAlign: 'center' }}>
                                                No diagnostic tests match your filter.
                                            </div>
                                        ) : (
                                            filteredTestsForPkg.map(t => {
                                                const isSelected = pkgForm.tests.some(id => String(id) === String(t._id));
                                                const testPrice = Number(t.standardPrice || t.price || 0);
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
                                                        <span className="lmd-chk-info">
                                                            <span className="chk-title">{t.testName || t.name}</span>
                                                            <span className="chk-meta">
                                                                {t.testCode || t.code} • {t.department || 'General Pathology'}
                                                            </span>
                                                        </span>
                                                        <span className="chk-price">₹{testPrice.toLocaleString('en-IN')}</span>
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* D. Pricing Summary */}
                                <div className="lmd-pricing-summary-card">
                                    <p className="lmd-psc-title">Package Pricing Summary</p>

                                    <div className="lmd-psc-row">
                                        <span>Individual Tests Total</span>
                                        <strong>₹{selectedTestsTotal.toLocaleString('en-IN')}</strong>
                                    </div>

                                    <div className="lmd-psc-row">
                                        <span>Discounted Package Price <span className="lmd-req">*</span></span>
                                        <div className="lmd-psc-input-box">
                                            <span>₹</span>
                                            <input
                                                type="number"
                                                min="0"
                                                required
                                                value={pkgForm.discountedPrice}
                                                onChange={(e) => setPkgForm({ ...pkgForm, discountedPrice: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    <div className="lmd-psc-row highlight">
                                        <span>Patient Savings</span>
                                        <strong>
                                            ₹{Math.max(0, selectedTestsTotal - (Number(pkgForm.discountedPrice) || 0)).toLocaleString('en-IN')}
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            {/* E. Footer Actions */}
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

            {/* =====================================================================
                MODAL 3A: ADD / EDIT SPECIMEN TYPE
               ===================================================================== */}
            {specimenModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setSpecimenModalOpen(false)}>
                    <div className="lmd-modal-card compact" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <div className="lmd-modal-title-wrap">
                                <span className="lmd-modal-hdr-icon">
                                    <FiDroplet />
                                </span>
                                <div>
                                    <h3>{editingSpecimenIdx !== null ? 'Edit Specimen Type' : 'Add Specimen Type'}</h3>
                                    <p className="lmd-modal-hdr-sub">Define standardized clinical specimen classification</p>
                                </div>
                            </div>
                            <button type="button" className="lmd-close-btn" onClick={() => setSpecimenModalOpen(false)} aria-label="Close modal">
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSpecimen} className="lmd-modal-form-shell">
                            <div className="lmd-modal-body">
                                <div className="lmd-form-grid-2">
                                    <div className="lmd-form-group">
                                        <label>Specimen Code <span className="lmd-req">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. WB, SRM, CSF"
                                            value={specimenForm.specimenCode}
                                            onChange={(e) => setSpecimenForm({ ...specimenForm, specimenCode: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                    <div className="lmd-form-group">
                                        <label>Specimen Name <span className="lmd-req">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Whole Blood"
                                            value={specimenForm.specimenName}
                                            onChange={(e) => setSpecimenForm({ ...specimenForm, specimenName: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="lmd-form-group">
                                    <label>Description</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Clinical collection, handling, or storage guideline..."
                                        value={specimenForm.description}
                                        onChange={(e) => setSpecimenForm({ ...specimenForm, description: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setSpecimenModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="lmd-btn-primary">
                                    {editingSpecimenIdx !== null ? 'Update Specimen' : 'Save Specimen'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL 3B: ADD / EDIT CONTAINER / TUBE STANDARD
               ===================================================================== */}
            {containerModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setContainerModalOpen(false)}>
                    <div className="lmd-modal-card compact" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <div className="lmd-modal-title-wrap">
                                <span className="lmd-modal-hdr-icon">
                                    <FiSliders />
                                </span>
                                <div>
                                    <h3>{editingContainerIdx !== null ? 'Edit Container / Tube Standard' : 'Add Container / Tube Standard'}</h3>
                                    <p className="lmd-modal-hdr-sub">Configure collection vacutainer cap color, additive &amp; draw volume</p>
                                </div>
                            </div>
                            <button type="button" className="lmd-close-btn" onClick={() => setContainerModalOpen(false)} aria-label="Close modal">
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveContainer} className="lmd-modal-form-shell">
                            <div className="lmd-modal-body">
                                <div className="lmd-form-grid-2">
                                    <div className="lmd-form-group">
                                        <label>Container Code <span className="lmd-req">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. EDTA, PLAIN, CITRATE"
                                            value={containerForm.containerCode}
                                            onChange={(e) => setContainerForm({ ...containerForm, containerCode: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                    <div className="lmd-form-group">
                                        <label>Minimum Volume</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 2 ml, 3 ml"
                                            value={containerForm.minimumVolume}
                                            onChange={(e) => setContainerForm({ ...containerForm, minimumVolume: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="lmd-form-group">
                                    <label>Container Name <span className="lmd-req">*</span></label>
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
                                            placeholder="e.g. Lavender, Red, Light Blue, Grey"
                                            value={containerForm.tubeColor}
                                            onChange={(e) => setContainerForm({ ...containerForm, tubeColor: e.target.value })}
                                        />
                                    </div>
                                    <div className="lmd-form-group">
                                        <label>Additive</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. K2 EDTA, Clot Activator"
                                            value={containerForm.additive}
                                            onChange={(e) => setContainerForm({ ...containerForm, additive: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setContainerModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="lmd-btn-primary">
                                    {editingContainerIdx !== null ? 'Update Container' : 'Save Container'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL 4: ADD / EDIT REFERRING DOCTOR
               ===================================================================== */}
            {doctorModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setDoctorModalOpen(false)}>
                    <div className="lmd-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <div className="lmd-modal-title-wrap">
                                <span className="lmd-modal-hdr-icon">
                                    <FiUserCheck />
                                </span>
                                <div>
                                    <h3>{editingDoctor ? 'Edit Referring Doctor' : 'Register New Referring Doctor'}</h3>
                                    <p className="lmd-modal-hdr-sub">External &amp; internal clinical referral directory</p>
                                </div>
                            </div>
                            <button type="button" className="lmd-close-btn" onClick={() => setDoctorModalOpen(false)} aria-label="Close modal">
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveDoctor} className="lmd-modal-form-shell">
                            <div className="lmd-modal-body">
                                <div className="lmd-form-grid-2">
                                    <div className="lmd-form-group">
                                        <label>Doctor Name <span className="lmd-req">*</span></label>
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
                            </div>

                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setDoctorModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="lmd-btn-primary" disabled={savingDoctor}>
                                    {savingDoctor ? 'Saving…' : 'Save Doctor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL 5: CSV IMPORT MODAL
               ===================================================================== */}
            {csvImportModal && (
                <div className="lmd-modal-overlay" onClick={() => setCsvImportModal(false)}>
                    <div className="lmd-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <div className="lmd-modal-title-wrap">
                                <span className="lmd-modal-hdr-icon">
                                    <FiUpload />
                                </span>
                                <div>
                                    <h3>Import Test Catalog from CSV</h3>
                                    <p className="lmd-modal-hdr-sub">Bulk create or update diagnostic tests from comma-separated records</p>
                                </div>
                            </div>
                            <button type="button" className="lmd-close-btn" onClick={() => setCsvImportModal(false)} aria-label="Close modal">
                                <FiX size={18} />
                            </button>
                        </div>

                        <div className="lmd-modal-form-shell">
                            <div className="lmd-modal-body">
                                <p className="subtext" style={{ margin: 0 }}>
                                    Paste standard CSV content below. Required column: <code>TestName</code> or <code>Name</code>.
                                    Optional columns: <code>TestCode</code>, <code>Department</code>, <code>Category</code>, <code>StandardPrice</code>.
                                </p>
                                <textarea
                                    rows="8"
                                    className="lmd-csv-textarea"
                                    placeholder={`TestCode,TestName,Department,StandardPrice\nCBC,Complete Blood Count,Hematology,350\nLFT,Liver Function Test,Biochemistry,650`}
                                    value={csvText}
                                    onChange={(e) => setCsvText(e.target.value)}
                                />
                            </div>

                            <div className="lmd-modal-footer">
                                <button type="button" className="lmd-btn-cancel" onClick={() => setCsvImportModal(false)}>
                                    Cancel
                                </button>
                                <button type="button" className="lmd-btn-primary" onClick={handleImportCsv} disabled={importingCsv || !csvText.trim()}>
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

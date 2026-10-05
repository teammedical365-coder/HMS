import React, { useState, useEffect, useRef, useMemo } from 'react';
import { migrationAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiDatabase,
    FiPlus,
    FiUploadCloud,
    FiFileText,
    FiCheckCircle,
    FiAlertCircle,
    FiClock,
    FiTrash2,
    FiArrowLeft,
    FiArrowRight,
    FiSearch,
    FiFilter,
    FiSave,
    FiCpu,
    FiFolder,
    FiLayers,
    FiCheck,
    FiX,
    FiAlertTriangle,
    FiTag,
    FiDownload,
    FiRefreshCw,
    FiExternalLink,
    FiEye,
    FiUserCheck,
    FiUserX,
    FiLink,
    FiShield,
    FiPlay,
    FiCheckSquare,
    FiActivity
} from 'react-icons/fi';
import './DataMigration.css';

const STEP_NAMES = [
    { num: 1, label: 'Upload' },
    { num: 2, label: 'Analyze' },
    { num: 3, label: 'Mapping' },
    { num: 4, label: 'Review' },
    { num: 5, label: 'Approved' },
    { num: 6, label: 'Preview & Review' },
    { num: 7, label: 'Ready for Import' },
    { num: 8, label: 'Completed' }
];

export default function DataMigration() {
    // Mode: 'dashboard' | 'workspace'
    const [viewMode, setViewMode] = useState('dashboard');
    const [activeTab, setActiveTab] = useState('migrations'); // 'migrations' | 'templates'

    // Dashboard State
    const [stats, setStats] = useState({
        totalMigrations: 0,
        inProgress: 0,
        awaitingMapping: 0,
        approved: 0
    });
    const [sessions, setSessions] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loadingList, setLoadingList] = useState(false);

    // Workspace State
    const [currentStep, setCurrentStep] = useState(1);
    const [session, setSession] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [canonicalSchemas, setCanonicalSchemas] = useState({});
    const [supportedEntities, setSupportedEntities] = useState([]);

    // Mapping Filter & Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('ALL'); // ALL, MAPPED, UNMAPPED, CUSTOM, NEEDS_REVIEW, HIGH, MEDIUM, LOW

    // Custom Field Modal State
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [customFieldForm, setCustomFieldForm] = useState({
        entity: 'Patient',
        fieldLabel: '',
        fieldKey: '',
        dataType: 'Text',
        sourceField: '',
        sourceFile: ''
    });

    // Template Save Form State
    const [templateNameInput, setTemplateNameInput] = useState('');

    // Loading Spinners / Status
    const [isUploading, setIsUploading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isMappingAI, setIsMappingAI] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    // Phase 2 State: Preview, Duplicates & Staging
    const [previewData, setPreviewData] = useState(null);
    const [stagedRecords, setStagedRecords] = useState([]);
    const [totalStagedCount, setTotalStagedCount] = useState(0);
    const [stagedPage, setStagedPage] = useState(1);
    const [stagedLimit] = useState(50);
    const [previewTab, setPreviewTab] = useState('overview'); // overview, valid, warning, error, duplicate, relationships
    const [selectedEntityFilter, setSelectedEntityFilter] = useState('ALL');
    const [previewSearchQuery, setPreviewSearchQuery] = useState('');
    const [isPreparing, setIsPreparing] = useState(false);
    const [isLoadingRecords, setIsLoadingRecords] = useState(false);
    const [selectedRecordDetail, setSelectedRecordDetail] = useState(null);
    const [isUpdatingDuplicate, setIsUpdatingDuplicate] = useState(false);
    const [isMarkingReady, setIsMarkingReady] = useState(false);

    // Phase 3 States: Confirmation, Real-time Import & Verification
    const [showImportModal, setShowImportModal] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({
        currentStage: '',
        processedRecords: 0,
        totalRecords: 0,
        percent: 0
    });
    const [failedRecords, setFailedRecords] = useState([]);
    const [failedTotal, setFailedTotal] = useState(0);
    const [failedPage, setFailedPage] = useState(1);
    const [showFailedDrawer, setShowFailedDrawer] = useState(false);

    const fileInputRef = useRef(null);

    // ─────────────────────────────────────────────────────────────────────────
    // DATA FETCHING
    // ─────────────────────────────────────────────────────────────────────────

    const loadDashboardData = async () => {
        setLoadingList(true);
        try {
            const [sessRes, tmplRes, schemaRes] = await Promise.all([
                migrationAPI.listSessions(),
                migrationAPI.listTemplates(),
                migrationAPI.getCanonicalSchema()
            ]);

            if (sessRes.success) {
                setStats(sessRes.stats || { totalMigrations: 0, inProgress: 0, awaitingMapping: 0, approved: 0 });
                setSessions(sessRes.sessions || []);
            }
            if (tmplRes.success) {
                setTemplates(tmplRes.templates || []);
            }
            if (schemaRes.success) {
                setCanonicalSchemas(schemaRes.schemas || {});
                setSupportedEntities(schemaRes.entities || []);
            }
        } catch (err) {
            console.error('Failed to load migration dashboard data:', err);
            toast.error(err.response?.data?.message || 'Failed to load migration dashboard data');
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        loadDashboardData();
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // WORKSPACE FLOW ACTIONS
    // ─────────────────────────────────────────────────────────────────────────

    const handleStartNewMigration = async () => {
        try {
            const res = await migrationAPI.createSession();
            if (res.success && res.session) {
                setSession(res.session);
                setSelectedFiles([]);
                setCurrentStep(1);
                setViewMode('workspace');
                toast.success(`Migration session ${res.session.migrationId} initialized.`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to initialize migration session.');
        }
    };

    const handleOpenSession = async (migrationId) => {
        try {
            const res = await migrationAPI.getSession(migrationId);
            if (res.success && res.session) {
                setSession(res.session);
                setViewMode('workspace');
                
                // Determine appropriate step based on backend status
                if (['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(res.session.status)) {
                    setCurrentStep(8);
                    if (res.session.importSummary?.failed > 0) {
                        loadFailedRecords(migrationId, 1);
                    }
                } else if (['IMPORTING', 'VERIFYING'].includes(res.session.status)) {
                    setCurrentStep(8);
                    setImportProgress(res.session.importProgress || { currentStage: 'Importing in progress...', processedRecords: 0, totalRecords: 1, percent: 0 });
                } else if (res.session.status === 'READY_FOR_IMPORT') {
                    setCurrentStep(7);
                    loadPreviewData(migrationId);
                } else if (['PREVIEW_READY', 'REVIEW_REQUIRED', 'VALIDATING', 'TRANSFORMING', 'PREPARING'].includes(res.session.status)) {
                    setCurrentStep(6);
                    loadPreviewData(migrationId);
                    loadStagedRecords(migrationId, 1, 'ALL', 'overview');
                } else if (res.session.status === 'APPROVED') {
                    setCurrentStep(5);
                } else if (res.session.mappings && res.session.mappings.length > 0) {
                    setCurrentStep(3);
                } else if (res.session.files && res.session.files.length > 0) {
                    setCurrentStep(2);
                } else {
                    setCurrentStep(1);
                }
            }
        } catch (err) {
            toast.error('Failed to open migration session.');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 2 ACTIONS: PREPARE, VALIDATE, PREVIEW, DUPLICATES, MARK READY
    // ─────────────────────────────────────────────────────────────────────────

    const loadPreviewData = async (migrationId) => {
        try {
            const res = await migrationAPI.getPreview(migrationId);
            if (res.success && res.session) {
                setPreviewData(res.session);
                if (res.session.previewSummary) {
                    setSession(prev => ({
                        ...prev,
                        status: res.session.status,
                        previewSummary: res.session.previewSummary
                    }));
                }
            }
        } catch (err) {
            console.error('Failed to load preview data:', err);
        }
    };

    const loadStagedRecords = async (migrationId, page = 1, entity = 'ALL', tab = previewTab, search = previewSearchQuery) => {
        setIsLoadingRecords(true);
        try {
            const params = { page, limit: stagedLimit };
            if (entity && entity !== 'ALL') params.entity = entity;
            if (search) params.search = search;

            if (tab === 'valid') params.status = 'VALID';
            else if (tab === 'warning') params.status = 'WARNING';
            else if (tab === 'error') params.status = 'ERROR';
            else if (tab === 'duplicate') params.status = 'DUPLICATE';

            const res = await migrationAPI.getStagedRecords(migrationId, params);
            if (res.success) {
                setStagedRecords(res.records || []);
                setTotalStagedCount(res.totalRecords || 0);
                setStagedPage(res.page || 1);
            }
        } catch (err) {
            console.error('Failed to load staged records:', err);
            toast.error('Failed to load staged records.');
        } finally {
            setIsLoadingRecords(false);
        }
    };

    const handlePrepareMigration = async () => {
        if (!session) return;
        setIsPreparing(true);
        const toastId = toast.loading('Preparing data: transforming values, resolving relationships & validating...');
        try {
            const res = await migrationAPI.prepareAndValidate(session.migrationId);
            if (res.success) {
                toast.success('Data preparation, relationships, and validation complete!', { id: toastId });
                setSession(prev => ({
                    ...prev,
                    status: res.status,
                    previewSummary: res.previewSummary
                }));
                setCurrentStep(6);
                await loadPreviewData(session.migrationId);
                await loadStagedRecords(session.migrationId, 1, 'ALL', 'overview');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Preparation failed.', { id: toastId });
        } finally {
            setIsPreparing(false);
        }
    };

    const handleOpenRecordDetail = async (recordId) => {
        try {
            const res = await migrationAPI.getRecordDetail(session.migrationId, recordId);
            if (res.success && res.record) {
                setSelectedRecordDetail(res.record);
            }
        } catch (err) {
            toast.error('Failed to fetch record details.');
        }
    };

    const handleDuplicateResolution = async (recordId, resolution) => {
        setIsUpdatingDuplicate(true);
        try {
            const res = await migrationAPI.updateDuplicateDecision(session.migrationId, recordId, { resolution });
            if (res.success) {
                toast.success(`Duplicate decision recorded: ${resolution}`);
                setStagedRecords(prev => prev.map(r => (r.stagingId === recordId || r._id === recordId) ? res.record : r));
                if (selectedRecordDetail && (selectedRecordDetail.stagingId === recordId || selectedRecordDetail._id === recordId)) {
                    setSelectedRecordDetail(res.record);
                }
                await loadPreviewData(session.migrationId);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update duplicate decision.');
        } finally {
            setIsUpdatingDuplicate(false);
        }
    };

    const handleMarkReadyForImport = async () => {
        if (!session) return;
        setIsMarkingReady(true);
        try {
            const res = await migrationAPI.markReadyForImport(session.migrationId);
            if (res.success) {
                toast.success('Migration successfully certified READY FOR IMPORT!');
                setSession(prev => ({ ...prev, status: res.status }));
                setCurrentStep(7);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to mark ready for import.');
        } finally {
            setIsMarkingReady(false);
        }
    };

    const handleExportReport = () => {
        if (!session) return;
        const url = migrationAPI.getExportReportUrl(session.migrationId);
        window.open(url, '_blank');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 3 ACTIONS: EXECUTE IMPORT, REAL-TIME POLLING & FAILED RECORDS
    // ─────────────────────────────────────────────────────────────────────────

    const handleStartImport = async () => {
        if (!session?.migrationId) return;
        setIsImporting(true);
        setShowImportModal(false);
        setCurrentStep(8);
        setImportProgress({
            currentStage: 'Initiating production import...',
            processedRecords: 0,
            totalRecords: session.previewSummary?.totalRecords || 1,
            percent: 0
        });

        try {
            const res = await migrationAPI.executeImport(session.migrationId);
            if (res.success) {
                setSession(prev => ({
                    ...prev,
                    status: res.status,
                    importSummary: res.importSummary
                }));
                if (res.importSummary?.failed > 0) {
                    loadFailedRecords(session.migrationId, 1);
                }
                toast.success(`Import finished with status: ${res.status}`);
            } else {
                toast.error(res.message || 'Import failed.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to execute production import.');
        } finally {
            setIsImporting(false);
        }
    };

    const loadFailedRecords = async (migrationId, page = 1) => {
        try {
            const res = await migrationAPI.getFailedRecords(migrationId, { page, limit: 20 });
            if (res.success) {
                setFailedRecords(res.records || []);
                setFailedTotal(res.totalFailed || 0);
                setFailedPage(page);
            }
        } catch (err) {
            console.error('Failed to load failed records:', err);
        }
    };

    const handleExportFailedReport = () => {
        if (!session?.migrationId) return;
        window.open(migrationAPI.getExportFailedReportUrl(session.migrationId), '_blank');
    };

    // Polling effect for background import progress
    useEffect(() => {
        let interval = null;
        if (session?.migrationId && (session?.status === 'IMPORTING' || session?.status === 'VERIFYING' || isImporting)) {
            interval = setInterval(async () => {
                try {
                    const res = await migrationAPI.getImportProgress(session.migrationId);
                    if (res.success) {
                        if (res.importProgress) setImportProgress(res.importProgress);
                        if (res.status === 'COMPLETED' || res.status === 'COMPLETED_WITH_WARNINGS' || res.status === 'FAILED') {
                            setSession(prev => ({
                                ...prev,
                                status: res.status,
                                importSummary: res.importSummary || prev.importSummary
                            }));
                            setIsImporting(false);
                            if (res.importSummary?.failed > 0) {
                                loadFailedRecords(session.migrationId, 1);
                            }
                            clearInterval(interval);
                        }
                    }
                } catch (err) {
                    console.error('Progress polling error:', err);
                }
            }, 1500);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [session?.status, session?.migrationId, isImporting]);

    // Step 1: Upload Files
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setSelectedFiles(prev => [...prev, ...newFiles]);
        }
    };

    const handleRemoveSelectedFile = (idx) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleUploadAndAnalyze = async () => {
        if (!session) return;
        if (selectedFiles.length === 0 && (!session.files || session.files.length === 0)) {
            toast.error('Please select at least one file (CSV, XLS, XLSX, JSON).');
            return;
        }

        setIsUploading(true);
        try {
            let currentSession = session;
            if (selectedFiles.length > 0) {
                const formData = new FormData();
                selectedFiles.forEach(f => formData.append('files', f));
                const uploadRes = await migrationAPI.uploadFiles(session.migrationId, formData);
                if (uploadRes.success) {
                    currentSession = uploadRes.session;
                    setSession(uploadRes.session);
                    toast.success('Files uploaded and parsed successfully.');
                }
            }

            // Move to Step 2: Analyze
            setCurrentStep(2);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed.');
        } finally {
            setIsUploading(false);
        }
    };

    // Step 2: Continue to AI Mapping
    const handleTriggerAIMapping = async () => {
        if (!session) return;
        setIsMappingAI(true);
        try {
            const res = await migrationAPI.generateAiMapping(session.migrationId);
            if (res.success && res.session) {
                setSession(res.session);
                setCurrentStep(3);
                toast.success('AI mapping completed with validation against canonical schema.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'AI Mapping failed. Using heuristic fallback.');
        } finally {
            setIsMappingAI(false);
        }
    };

    // Step 3: Manual Mapping Edit
    const handleUpdateFieldMapping = async (sourceField, targetField, mappingType = 'DIRECT') => {
        if (!session) return;
        try {
            const res = await migrationAPI.updateMapping(session.migrationId, {
                sourceField,
                targetField,
                mappingType,
                status: 'ACCEPTED'
            });

            if (res.success && res.mapping) {
                setSession(prev => {
                    const newMappings = prev.mappings.map(m => 
                        m.sourceField === sourceField ? res.mapping : m
                    );
                    return {
                        ...prev,
                        mappings: newMappings,
                        summary: res.summary || prev.summary
                    };
                });
                toast.success(`Updated mapping for '${sourceField}'`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update mapping.');
        }
    };

    // Accept High Confidence
    const handleAcceptHighConfidence = async () => {
        if (!session) return;
        try {
            const res = await migrationAPI.acceptHighConfidence(session.migrationId);
            if (res.success && res.session) {
                setSession(res.session);
                toast.success(res.message);
            }
        } catch (err) {
            toast.error('Failed to accept high confidence mappings.');
        }
    };

    // Custom Field Modal Handlers
    const handleOpenCustomModal = (sourceField = '', entity = '') => {
        const ent = entity || (session?.detectedEntities?.[0] || 'Patient');
        setCustomFieldForm({
            entity: ent,
            fieldLabel: sourceField ? sourceField.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '',
            fieldKey: sourceField ? sourceField.toLowerCase().replace(/[^a-z0-9_]/g, '_') : '',
            dataType: 'Text',
            sourceField: sourceField || '',
            sourceFile: ''
        });
        setShowCustomModal(true);
    };

    const handleSaveCustomField = async (e) => {
        e.preventDefault();
        if (!session) return;
        if (!customFieldForm.fieldLabel) {
            toast.error('Field label is required.');
            return;
        }

        try {
            const res = await migrationAPI.createCustomField(session.migrationId, customFieldForm);
            if (res.success && res.session) {
                setSession(res.session);
                setShowCustomModal(false);
                toast.success(`Custom field '${customFieldForm.fieldLabel}' created.`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create custom field.');
        }
    };

    // Step 4: Approve Mapping
    const handleApproveMapping = async () => {
        if (!session) return;
        setIsApproving(true);
        try {
            const res = await migrationAPI.approveMapping(session.migrationId);
            if (res.success && res.session) {
                setSession(res.session);
                setCurrentStep(5);
                setTemplateNameInput(`${session.detectedEntities.join(', ')} Mapping Template`);
                toast.success('Mapping approved! No hospital records have been imported yet.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Approval failed.');
        } finally {
            setIsApproving(false);
        }
    };

    // Step 5: Save Template
    const handleSaveTemplate = async () => {
        if (!session) return;
        setIsSavingTemplate(true);
        try {
            const res = await migrationAPI.saveTemplate(session.migrationId, {
                templateName: templateNameInput
            });
            if (res.success) {
                toast.success('Template saved successfully for future migrations!');
                setSession(res.session);
                loadDashboardData();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save template.');
        } finally {
            setIsSavingTemplate(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // FILTERED MAPPINGS
    // ─────────────────────────────────────────────────────────────────────────

    const filteredMappings = useMemo(() => {
        if (!session || !session.mappings) return [];
        return session.mappings.filter(m => {
            // Search query
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const sMatch = m.sourceField.toLowerCase().includes(q);
                const tMatch = (m.targetField || '').toLowerCase().includes(q);
                const lMatch = (m.targetFieldLabel || '').toLowerCase().includes(q);
                if (!sMatch && !tMatch && !lMatch) return false;
            }

            // Filter category
            if (filterCategory === 'MAPPED') return !!m.targetField && m.mappingType !== 'IGNORE';
            if (filterCategory === 'UNMAPPED') return !m.targetField && m.mappingType !== 'IGNORE';
            if (filterCategory === 'CUSTOM') return m.mappingType === 'CUSTOM_FIELD' || m.isCustomField;
            if (filterCategory === 'NEEDS_REVIEW') return m.status === 'NEEDS_REVIEW' || m.confidenceLevel === 'LOW';
            if (filterCategory === 'HIGH') return m.confidenceLevel === 'HIGH';
            if (filterCategory === 'MEDIUM') return m.confidenceLevel === 'MEDIUM';
            if (filterCategory === 'LOW') return m.confidenceLevel === 'LOW';
            return true;
        });
    }, [session?.mappings, searchQuery, filterCategory]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER: DASHBOARD VIEW
    // ─────────────────────────────────────────────────────────────────────────

    if (viewMode === 'dashboard') {
        return (
            <div className="migration-container">
                {/* Header */}
                <div className="migration-header">
                    <div className="migration-title-area">
                        <h1><FiDatabase style={{ color: '#0284c7' }} /> Data Migration</h1>
                        <p>Prepare and map your existing hospital legacy data for Medical365</p>
                    </div>
                    <div className="migration-header-actions">
                        <button className="btn-primary" onClick={handleStartNewMigration}>
                            <FiPlus size={18} /> New Migration
                        </button>
                    </div>
                </div>

                {/* Summary Stat Cards */}
                <div className="stat-cards-grid">
                    <div className="stat-card">
                        <div className="stat-icon-wrap stat-icon-blue"><FiLayers /></div>
                        <div className="stat-content">
                            <span className="stat-label">Total Migrations</span>
                            <span className="stat-value">{stats.totalMigrations}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon-wrap stat-icon-amber"><FiClock /></div>
                        <div className="stat-content">
                            <span className="stat-label">In Progress</span>
                            <span className="stat-value">{stats.inProgress}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon-wrap stat-icon-indigo"><FiCpu /></div>
                        <div className="stat-content">
                            <span className="stat-label">Awaiting Mapping</span>
                            <span className="stat-value">{stats.awaitingMapping}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon-wrap stat-icon-green"><FiCheckCircle /></div>
                        <div className="stat-content">
                            <span className="stat-label">Approved</span>
                            <span className="stat-value">{stats.approved}</span>
                        </div>
                    </div>
                </div>

                {/* History & Templates Tabs */}
                <div className="data-table-card">
                    <div className="data-table-tabs">
                        <button 
                            className={`data-table-tab ${activeTab === 'migrations' ? 'active' : ''}`}
                            onClick={() => setActiveTab('migrations')}
                        >
                            Recent Migrations ({sessions.length})
                        </button>
                        <button 
                            className={`data-table-tab ${activeTab === 'templates' ? 'active' : ''}`}
                            onClick={() => setActiveTab('templates')}
                        >
                            Saved Templates ({templates.length})
                        </button>
                    </div>

                    {activeTab === 'migrations' ? (
                        <div className="mapping-table-wrap" style={{ border: 'none', margin: 0 }}>
                            {loadingList ? (
                                <div className="empty-state">Loading migration history...</div>
                            ) : sessions.length === 0 ? (
                                <div className="empty-state">
                                    <FiFolder className="empty-icon" />
                                    <h3>No migration sessions found</h3>
                                    <p>Click "+ New Migration" to upload and map legacy hospital records.</p>
                                </div>
                            ) : (
                                <table className="mapping-table">
                                    <thead>
                                        <tr>
                                            <th>Migration ID</th>
                                            <th>Date</th>
                                            <th>Files</th>
                                            <th>Entities Detected</th>
                                            <th>Status</th>
                                            <th>Created By</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sessions.map(s => (
                                            <tr key={s._id || s.migrationId}>
                                                <td style={{ fontWeight: 700, color: '#0284c7' }}>{s.migrationId}</td>
                                                <td>{new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                                <td>{s.files?.length || 0} file(s)</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {(s.detectedEntities || []).map(ent => (
                                                            <span key={ent} className="format-badge">{ent}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`type-pill ${
                                                        s.status === 'COMPLETED' ? 'type-custom' :
                                                        s.status === 'COMPLETED_WITH_WARNINGS' ? 'type-transform' :
                                                        s.status === 'READY_FOR_IMPORT' ? 'type-custom' :
                                                        s.status === 'APPROVED' ? 'type-custom' :
                                                        s.status === 'MAPPING_REVIEW' ? 'type-transform' :
                                                        s.status === 'ANALYZING' ? 'type-direct' : 'type-ignore'
                                                    }`} style={{
                                                        background: s.status === 'COMPLETED' ? '#dcfce7' : s.status === 'COMPLETED_WITH_WARNINGS' ? '#fef3c7' : s.status === 'READY_FOR_IMPORT' ? '#e0f2fe' : undefined,
                                                        color: s.status === 'COMPLETED' ? '#15803d' : s.status === 'COMPLETED_WITH_WARNINGS' ? '#b45309' : s.status === 'READY_FOR_IMPORT' ? '#0369a1' : undefined
                                                    }}>
                                                        {s.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td>{s.createdByName || 'Hospital Admin'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button 
                                                        className="btn-secondary" 
                                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleOpenSession(s.migrationId)}
                                                    >
                                                        {['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(s.status) ? 'View Results' :
                                                         s.status === 'READY_FOR_IMPORT' ? 'Import Ready' :
                                                         s.status === 'APPROVED' ? 'View Mapping' : 'Open Workspace'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ) : (
                        <div className="mapping-table-wrap" style={{ border: 'none', margin: 0 }}>
                            {templates.length === 0 ? (
                                <div className="empty-state">
                                    <FiTag className="empty-icon" />
                                    <h3>No saved mapping templates</h3>
                                    <p>Approve a migration mapping to save it as a reusable template.</p>
                                </div>
                            ) : (
                                <table className="mapping-table">
                                    <thead>
                                        <tr>
                                            <th>Template Name</th>
                                            <th>Entity</th>
                                            <th>Format</th>
                                            <th>Fields Mapped</th>
                                            <th>Custom Fields</th>
                                            <th>Version</th>
                                            <th>Saved Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {templates.map(t => (
                                            <tr key={t._id || t.templateId}>
                                                <td style={{ fontWeight: 600, color: '#0f172a' }}>{t.name}</td>
                                                <td><span className="format-badge">{t.entity}</span></td>
                                                <td>{t.sourceFormat || 'CSV/Excel'}</td>
                                                <td>{t.mappings?.length || 0} fields</td>
                                                <td>{t.customFields?.length || 0} custom</td>
                                                <td>v{t.version || 1}</td>
                                                <td>{new Date(t.createdAt).toLocaleDateString('en-GB')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER: WORKSPACE VIEW WITH STEPPER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="migration-container">
            {/* Header */}
            <div className="migration-header">
                <div className="migration-title-area">
                    <h1>
                        <FiDatabase style={{ color: '#0284c7' }} /> 
                        Data Migration 
                        <span style={{ fontSize: '16px', color: '#64748b', fontWeight: 500 }}>
                            ({session?.migrationId || 'New'})
                        </span>
                    </h1>
                    <p>Prepare and map your existing hospital legacy data for Medical365</p>
                </div>
                <div className="migration-header-actions">
                    <button className="btn-secondary" onClick={() => { setViewMode('dashboard'); loadDashboardData(); }}>
                        <FiArrowLeft /> Back to Migrations
                    </button>
                </div>
            </div>

            {/* Stepper Navigation */}
            <div className="stepper-nav">
                {STEP_NAMES.map((step, idx) => {
                    const isCompleted = currentStep > step.num;
                    const isActive = currentStep === step.num;
                    return (
                        <React.Fragment key={step.num}>
                            <div className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                                <div className="step-num">
                                    {isCompleted ? <FiCheck /> : step.num}
                                </div>
                                <span>{step.label}</span>
                            </div>
                            {idx < STEP_NAMES.length - 1 && (
                                <div className={`stepper-line ${isCompleted ? 'completed' : ''}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* STEP 1: UPLOAD */}
            {currentStep === 1 && (
                <div className="upload-card">
                    <div 
                        className="dropzone-area"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <FiUploadCloud className="dropzone-icon" />
                        <div className="dropzone-title">Upload Hospital Legacy Data</div>
                        <p className="dropzone-desc">
                            Drag & drop or browse CSV, Excel (XLS, XLSX) or JSON files exported from your legacy hospital system.
                        </p>
                        <div className="format-badges">
                            <span className="format-badge">CSV</span>
                            <span className="format-badge">XLS</span>
                            <span className="format-badge">XLSX</span>
                            <span className="format-badge">JSON</span>
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            multiple 
                            accept=".csv, .xlsx, .xls, .json"
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* Selected Files List */}
                    {selectedFiles.length > 0 && (
                        <div className="uploaded-files-list">
                            <div className="uploaded-files-header">Selected Files to Analyze ({selectedFiles.length})</div>
                            {selectedFiles.map((file, idx) => (
                                <div key={idx} className="file-item-card">
                                    <div className="file-info">
                                        <FiFileText className="file-icon" />
                                        <div>
                                            <div className="file-name">{file.name}</div>
                                            <div className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB • {file.name.split('.').pop().toUpperCase()}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="file-status-pill status-ready">Ready</span>
                                        <button className="btn-remove-file" onClick={() => handleRemoveSelectedFile(idx)}>
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button className="btn-secondary" onClick={() => setViewMode('dashboard')}>Cancel</button>
                        <button 
                            className="btn-primary" 
                            disabled={selectedFiles.length === 0 || isUploading}
                            onClick={handleUploadAndAnalyze}
                        >
                            {isUploading ? 'Uploading & Parsing...' : 'Analyze Data'} <FiArrowRight />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: ANALYZE */}
            {currentStep === 2 && (
                <div className="analysis-card">
                    <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px 0', color: '#0f172a' }}>
                        File & Entity Analysis
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
                        The system has parsed your uploaded files and analyzed schema structures.
                    </p>

                    <ul className="analysis-checklist">
                        <li className="analysis-item"><FiCheckCircle className="check-icon" /> Reading & validating uploaded files</li>
                        <li className="analysis-item"><FiCheckCircle className="check-icon" /> Detecting spreadsheet sheets and row counts</li>
                        <li className="analysis-item"><FiCheckCircle className="check-icon" /> Extracting sanitized headers and data types</li>
                        <li className="analysis-item"><FiCheckCircle className="check-icon" /> Matching entity signatures and confidence scoring</li>
                    </ul>

                    {/* Detected Entities */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                            Detected Entities by File
                        </div>
                        {(session?.files || []).map((f, idx) => (
                            <div key={idx} className="detected-entity-box">
                                <div className="entity-info-left">
                                    <FiFileText size={20} color="#059669" />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{f.originalName}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            {f.rowCount} rows • {f.headers?.length || 0} columns • {f.fileType}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="entity-badge">{f.detectedEntity}</span>
                                    <span className="conf-pill conf-high">
                                        {Math.round((f.entityConfidence || 0.9) * 100)}% Match
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn-secondary" onClick={() => setCurrentStep(1)}>
                            <FiArrowLeft /> Back to Upload
                        </button>
                        <button 
                            className="btn-primary" 
                            disabled={isMappingAI}
                            onClick={handleTriggerAIMapping}
                        >
                            {isMappingAI ? 'Running AI Mapping...' : 'Continue to Mapping'} <FiArrowRight />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: MAPPING */}
            {currentStep === 3 && (
                <div className="mapping-card">
                    {/* Toolbar */}
                    <div className="mapping-toolbar">
                        <div className="search-box">
                            <FiSearch className="search-icon" />
                            <input 
                                type="text"
                                className="search-input"
                                placeholder="Search source or target field..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="filter-tabs">
                            {[
                                { key: 'ALL', label: 'All' },
                                { key: 'MAPPED', label: 'Mapped' },
                                { key: 'UNMAPPED', label: 'Unmapped' },
                                { key: 'CUSTOM', label: 'Custom' },
                                { key: 'NEEDS_REVIEW', label: 'Needs Review' },
                                { key: 'HIGH', label: 'High Confidence' },
                                { key: 'MEDIUM', label: 'Medium' },
                                { key: 'LOW', label: 'Low' }
                            ].map(tab => (
                                <button 
                                    key={tab.key}
                                    className={`filter-tab ${filterCategory === tab.key ? 'active' : ''}`}
                                    onClick={() => setFilterCategory(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <button className="btn-secondary" onClick={handleAcceptHighConfidence} title="Accept >= 90% confidence matches">
                            <FiCheckCircle color="#059669" /> Accept High Confidence Suggestions
                        </button>
                    </div>

                    {/* Mapping Table */}
                    <div className="mapping-table-wrap">
                        <table className="mapping-table">
                            <thead>
                                <tr>
                                    <th>Source Field</th>
                                    <th>Sample Value</th>
                                    <th>Medical365 Target Field</th>
                                    <th>Mapping Type</th>
                                    <th>Confidence</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMappings.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                                            No fields matched the current filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMappings.map((m, idx) => {
                                        const entity = m.entity || session?.detectedEntities?.[0] || 'Patient';
                                        const validFields = canonicalSchemas[entity] || [];

                                        return (
                                            <tr key={idx}>
                                                {/* Source Field */}
                                                <td>
                                                    <div className="source-field-cell">
                                                        <span>{m.sourceField}</span>
                                                        <span className="sample-val-sub">{m.reason}</span>
                                                    </div>
                                                </td>

                                                {/* Sample Value */}
                                                <td style={{ color: '#475569', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {m.sampleValue || <span style={{ color: '#94a3b8' }}>—</span>}
                                                </td>

                                                {/* Medical365 Target Field Dropdown */}
                                                <td>
                                                    <select 
                                                        className="target-select"
                                                        value={m.targetField || (m.mappingType === 'CUSTOM_FIELD' ? '__CUSTOM__' : '__UNMAPPED__')}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === '__CUSTOM__') {
                                                                handleOpenCustomModal(m.sourceField, entity);
                                                            } else if (val === '__UNMAPPED__') {
                                                                handleUpdateFieldMapping(m.sourceField, null, 'UNMAPPED');
                                                            } else if (val === '__IGNORE__') {
                                                                handleUpdateFieldMapping(m.sourceField, null, 'IGNORE');
                                                            } else {
                                                                handleUpdateFieldMapping(m.sourceField, val, 'DIRECT');
                                                            }
                                                        }}
                                                    >
                                                        <option value="__UNMAPPED__">-- Unmapped --</option>
                                                        <optgroup label="Canonical Fields">
                                                            {validFields.map(f => (
                                                                <option key={f.fieldName} value={f.fieldName}>
                                                                    {f.label} ({f.fieldName})
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                        <optgroup label="Special Actions">
                                                            <option value="__CUSTOM__">+ Create Custom Field</option>
                                                            <option value="__IGNORE__">Ignore this field</option>
                                                        </optgroup>
                                                    </select>
                                                </td>

                                                {/* Mapping Type */}
                                                <td>
                                                    <span className={`type-pill ${
                                                        m.mappingType === 'DIRECT' ? 'type-direct' :
                                                        m.mappingType === 'COMBINED' ? 'type-combined' :
                                                        m.mappingType === 'TRANSFORM' ? 'type-transform' :
                                                        m.mappingType === 'CUSTOM_FIELD' ? 'type-custom' :
                                                        m.mappingType === 'IGNORE' ? 'type-ignore' : 'type-unmapped'
                                                    }`}>
                                                        {m.mappingType}
                                                    </span>
                                                </td>

                                                {/* Confidence Indicator */}
                                                <td>
                                                    <span className={`conf-pill ${
                                                        m.confidenceLevel === 'HIGH' ? 'conf-high' :
                                                        m.confidenceLevel === 'MEDIUM' ? 'conf-medium' : 'conf-low'
                                                    }`}>
                                                        {Math.round((m.confidence || 0) * 100)}% {m.confidenceLevel}
                                                    </span>
                                                </td>

                                                {/* Status */}
                                                <td>
                                                    {m.status === 'ACCEPTED' ? (
                                                        <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                                                            <FiCheck /> Accepted
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                                                            <FiAlertCircle /> Needs Review
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn-secondary" onClick={() => setCurrentStep(2)}>
                            <FiArrowLeft /> Back to Analysis
                        </button>
                        <button className="btn-primary" onClick={() => setCurrentStep(4)}>
                            Continue to Review Summary <FiArrowRight />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: REVIEW SUMMARY */}
            {currentStep === 4 && (
                <div className="analysis-card">
                    <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px 0', color: '#0f172a' }}>
                        Migration Mapping Summary
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
                        Review the finalized field mapping and custom field schema before approving.
                    </p>

                    {/* Summary Statistics Grid */}
                    <div className="summary-grid">
                        <div className="summary-card">
                            <div className="summary-card-val">{session?.summary?.totalFiles || 0}</div>
                            <div className="summary-card-lbl">Files</div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-val">{session?.summary?.totalEntities || 0}</div>
                            <div className="summary-card-lbl">Entities</div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-val">{session?.summary?.totalFields || 0}</div>
                            <div className="summary-card-lbl">Total Fields</div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-val" style={{ color: '#059669' }}>{session?.summary?.mappedFields || 0}</div>
                            <div className="summary-card-lbl">Mapped Fields</div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-val" style={{ color: '#d97706' }}>{session?.summary?.needsReviewFields || 0}</div>
                            <div className="summary-card-lbl">Needs Review</div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-val" style={{ color: '#4f46e5' }}>{session?.summary?.customFields || 0}</div>
                            <div className="summary-card-lbl">Custom Fields</div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-val" style={{ color: '#64748b' }}>{session?.summary?.ignoredFields || 0}</div>
                            <div className="summary-card-lbl">Ignored</div>
                        </div>
                    </div>

                    {/* MANDATORY PHASE 1 DISCLAIMER */}
                    <div className="disclaimer-banner">
                        <FiAlertTriangle />
                        <div>
                            <strong>No hospital records will be imported in this phase.</strong>
                            <div style={{ fontSize: '13px', marginTop: '2px', opacity: 0.9 }}>
                                Phase 1 saves and validates the approved mapping template only. Production clinical and financial databases remain untouched.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn-secondary" onClick={() => setCurrentStep(3)}>
                            <FiArrowLeft /> Back to Mapping
                        </button>
                        <button 
                            className="btn-success" 
                            disabled={isApproving}
                            onClick={handleApproveMapping}
                        >
                            {isApproving ? 'Approving...' : 'Approve Mapping'} <FiCheckCircle />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 5: APPROVED */}
            {currentStep === 5 && (
                <div className="approved-success-card">
                    <div className="approved-icon-circle">
                        <FiCheckCircle />
                    </div>
                    <h2>Mapping Approved</h2>
                    <p>
                        Your mapping template has been validated and approved.
                        <br />
                        <strong>No hospital records have been imported yet.</strong>
                    </p>

                    {/* Template Saving Box */}
                    <div className="template-save-box">
                        <label>Template Name for Future Reusability</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                                type="text"
                                className="template-input"
                                value={templateNameInput}
                                onChange={(e) => setTemplateNameInput(e.target.value)}
                                placeholder="E.g. Hospital A Patient Migration Template"
                            />
                            <button 
                                className="btn-primary" 
                                disabled={isSavingTemplate || session?.templateSaved}
                                onClick={handleSaveTemplate}
                            >
                                <FiSave /> {session?.templateSaved ? 'Saved' : 'Save Template'}
                            </button>
                        </div>
                    </div>

                    <div className="approved-actions-row">
                        <button className="btn-secondary" onClick={() => setCurrentStep(3)}>
                            View Final Mapping
                        </button>
                        <button 
                            className="btn-primary" 
                            onClick={handlePrepareMigration}
                            disabled={isPreparing}
                            style={{ background: '#0284c7', fontSize: '14px', padding: '10px 20px' }}
                        >
                            {isPreparing ? (
                                <><FiRefreshCw className="spin-icon" /> Preparing Migration...</>
                            ) : (
                                <><FiCpu /> Prepare Migration (Phase 2)</>
                            )}
                        </button>
                        {['PREVIEW_READY', 'REVIEW_REQUIRED', 'READY_FOR_IMPORT'].includes(session?.status) && (
                            <button 
                                className="btn-success" 
                                onClick={() => { 
                                    setCurrentStep(6); 
                                    loadPreviewData(session.migrationId); 
                                    loadStagedRecords(session.migrationId, 1, 'ALL', 'overview'); 
                                }}
                            >
                                <FiEye /> View Preview
                            </button>
                        )}
                        <button className="btn-secondary" onClick={() => { setViewMode('dashboard'); loadDashboardData(); }}>
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 6: MIGRATION PREVIEW, VALIDATION & DUPLICATE REVIEW */}
            {currentStep === 6 && (
                <div className="preview-container">
                    {/* Status Alert Banner */}
                    {(session?.previewSummary?.errorRecords || 0) > 0 ? (
                        <div className="preview-banner banner-alert">
                            <div className="banner-content">
                                <FiAlertCircle className="banner-icon" />
                                <div>
                                    <strong>Migration requires attention:</strong> {session?.previewSummary?.errorRecords} records have validation or broken relationship errors that must be resolved before proceeding.
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                    className="btn-secondary" 
                                    style={{ borderColor: '#fca5a5', color: '#991b1b', background: '#ffffff', padding: '6px 12px' }}
                                    onClick={() => {
                                        setPreviewTab('error');
                                        loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'error', previewSearchQuery);
                                    }}
                                >
                                    Review Errors
                                </button>
                                {(session?.previewSummary?.duplicateRecords || 0) > 0 && (
                                    <button 
                                        className="btn-secondary" 
                                        style={{ borderColor: '#e9d5ff', color: '#7e22ce', background: '#ffffff', padding: '6px 12px' }}
                                        onClick={() => {
                                            setPreviewTab('duplicate');
                                            loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'duplicate', previewSearchQuery);
                                        }}
                                    >
                                        Review Duplicates
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (session?.previewSummary?.warningRecords || 0) > 0 ? (
                        <div className="preview-banner banner-warning">
                            <div className="banner-content">
                                <FiAlertTriangle className="banner-icon" />
                                <div>
                                    <strong>Migration is ready for review:</strong> All required fields are valid. {session?.previewSummary?.warningRecords} warnings or duplicates identified for optional inspection.
                                </div>
                            </div>
                            <button 
                                className="btn-secondary" 
                                style={{ borderColor: '#fde68a', color: '#92400e', background: '#ffffff', padding: '6px 12px' }}
                                onClick={() => {
                                    setPreviewTab('warning');
                                    loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'warning', previewSearchQuery);
                                }}
                            >
                                Review Warnings
                            </button>
                        </div>
                    ) : (
                        <div className="preview-banner banner-success">
                            <div className="banner-content">
                                <FiCheckCircle className="banner-icon" />
                                <div>
                                    <strong>Migration is ready for import:</strong> All {session?.previewSummary?.totalRecords || 0} records across {session?.detectedEntities?.length || 0} entities have been successfully validated!
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Top KPI Metric Cards */}
                    <div className="preview-metric-cards">
                        <div className="preview-metric-card metric-total">
                            <div className="metric-card-icon"><FiDatabase /></div>
                            <div className="metric-card-info">
                                <div className="metric-card-value">{session?.previewSummary?.totalRecords?.toLocaleString() || 0}</div>
                                <div className="metric-card-label">Total Records</div>
                            </div>
                        </div>
                        <div className="preview-metric-card metric-valid">
                            <div className="metric-card-icon"><FiCheckCircle /></div>
                            <div className="metric-card-info">
                                <div className="metric-card-value">{session?.previewSummary?.validRecords?.toLocaleString() || 0}</div>
                                <div className="metric-card-label">Valid Records</div>
                            </div>
                        </div>
                        <div className="preview-metric-card metric-warning">
                            <div className="metric-card-icon"><FiAlertTriangle /></div>
                            <div className="metric-card-info">
                                <div className="metric-card-value">{session?.previewSummary?.warningRecords?.toLocaleString() || 0}</div>
                                <div className="metric-card-label">Warnings</div>
                            </div>
                        </div>
                        <div className="preview-metric-card metric-error">
                            <div className="metric-card-icon"><FiAlertCircle /></div>
                            <div className="metric-card-info">
                                <div className="metric-card-value">{session?.previewSummary?.errorRecords?.toLocaleString() || 0}</div>
                                <div className="metric-card-label">Errors</div>
                            </div>
                        </div>
                        <div className="preview-metric-card metric-duplicate">
                            <div className="metric-card-icon"><FiLayers /></div>
                            <div className="metric-card-info">
                                <div className="metric-card-value">{session?.previewSummary?.duplicateRecords?.toLocaleString() || 0}</div>
                                <div className="metric-card-label">Duplicates</div>
                            </div>
                        </div>
                        <div className="preview-metric-card metric-relationships">
                            <div className="metric-card-icon"><FiLink /></div>
                            <div className="metric-card-info">
                                <div className="metric-card-value">
                                    {session?.previewSummary?.relationshipsSummary?.resolvedReferences || 0} / {session?.previewSummary?.relationshipsSummary?.totalReferences || 0}
                                </div>
                                <div className="metric-card-label">Resolved References</div>
                            </div>
                        </div>
                    </div>

                    {/* Entity Breakdown Section */}
                    {session?.previewSummary?.entitiesBreakdown?.length > 0 && (
                        <div className="entity-breakdown-section">
                            <h3><FiLayers /> Entity Breakdown</h3>
                            <div className="entity-cards-grid">
                                {session.previewSummary.entitiesBreakdown.map(eb => {
                                    const isSelected = selectedEntityFilter === eb.entity;
                                    return (
                                        <div 
                                            key={eb.entity} 
                                            className={`entity-summary-card ${isSelected ? 'selected' : ''}`}
                                            onClick={() => {
                                                const next = isSelected ? 'ALL' : eb.entity;
                                                setSelectedEntityFilter(next);
                                                loadStagedRecords(session.migrationId, 1, next, previewTab, previewSearchQuery);
                                            }}
                                        >
                                            <div className="entity-card-header">
                                                <span className="entity-card-name">{eb.entity}</span>
                                                <span className="entity-card-total">{eb.totalRecords}</span>
                                            </div>
                                            <div className="entity-pills-row">
                                                <span className="mini-pill valid">✓ {eb.valid}</span>
                                                {eb.warnings > 0 && <span className="mini-pill warning">⚠ {eb.warnings}</span>}
                                                {eb.errors > 0 && <span className="mini-pill error">✗ {eb.errors}</span>}
                                                {eb.duplicates > 0 && <span className="mini-pill duplicate">⧉ {eb.duplicates}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Filter, Tabs & Search Toolbar */}
                    <div className="preview-toolbar">
                        <div className="preview-tabs-list">
                            <button 
                                className={`preview-tab-btn ${previewTab === 'overview' ? 'active' : ''}`}
                                onClick={() => {
                                    setPreviewTab('overview');
                                    loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'overview', previewSearchQuery);
                                }}
                            >
                                Overview <span className="tab-badge">{session?.previewSummary?.totalRecords || 0}</span>
                            </button>
                            <button 
                                className={`preview-tab-btn ${previewTab === 'valid' ? 'active' : ''}`}
                                onClick={() => {
                                    setPreviewTab('valid');
                                    loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'valid', previewSearchQuery);
                                }}
                            >
                                Valid Records <span className="tab-badge">{session?.previewSummary?.validRecords || 0}</span>
                            </button>
                            <button 
                                className={`preview-tab-btn ${previewTab === 'warning' ? 'active' : ''}`}
                                onClick={() => {
                                    setPreviewTab('warning');
                                    loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'warning', previewSearchQuery);
                                }}
                            >
                                Warnings <span className="tab-badge">{session?.previewSummary?.warningRecords || 0}</span>
                            </button>
                            <button 
                                className={`preview-tab-btn ${previewTab === 'error' ? 'active' : ''}`}
                                onClick={() => {
                                    setPreviewTab('error');
                                    loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'error', previewSearchQuery);
                                }}
                            >
                                Errors <span className="tab-badge">{session?.previewSummary?.errorRecords || 0}</span>
                            </button>
                            <button 
                                className={`preview-tab-btn ${previewTab === 'duplicate' ? 'active' : ''}`}
                                onClick={() => {
                                    setPreviewTab('duplicate');
                                    loadStagedRecords(session.migrationId, 1, selectedEntityFilter, 'duplicate', previewSearchQuery);
                                }}
                            >
                                Possible Duplicates <span className="tab-badge">{session?.previewSummary?.duplicateRecords || 0}</span>
                            </button>
                        </div>

                        <div className="preview-search-row">
                            <select 
                                className="form-control" 
                                style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
                                value={selectedEntityFilter}
                                onChange={(e) => {
                                    setSelectedEntityFilter(e.target.value);
                                    loadStagedRecords(session.migrationId, 1, e.target.value, previewTab, previewSearchQuery);
                                }}
                            >
                                <option value="ALL">All Entities</option>
                                {(session?.detectedEntities || supportedEntities).map(ent => (
                                    <option key={ent} value={ent}>{ent}</option>
                                ))}
                            </select>

                            <input 
                                type="text" 
                                className="preview-search-input"
                                placeholder="Search Name, Phone, ID..."
                                value={previewSearchQuery}
                                onChange={(e) => setPreviewSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        loadStagedRecords(session.migrationId, 1, selectedEntityFilter, previewTab, previewSearchQuery);
                                    }
                                }}
                            />

                            <button 
                                className="btn-secondary" 
                                style={{ padding: '7px 12px', fontSize: '13px' }}
                                onClick={() => loadStagedRecords(session.migrationId, 1, selectedEntityFilter, previewTab, previewSearchQuery)}
                            >
                                <FiSearch /> Search
                            </button>

                            <button 
                                className="btn-secondary" 
                                style={{ padding: '7px 12px', fontSize: '13px' }}
                                onClick={handlePrepareMigration}
                                disabled={isPreparing}
                                title="Re-run transformation and validation"
                            >
                                <FiRefreshCw className={isPreparing ? 'spin-icon' : ''} /> Re-validate
                            </button>

                            <button 
                                className="btn-secondary" 
                                style={{ padding: '7px 12px', fontSize: '13px' }}
                                onClick={handleExportReport}
                                title="Download CSV preview report"
                            >
                                <FiDownload /> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* TAB CONTENT: DUPLICATES VIEW */}
                    {previewTab === 'duplicate' ? (
                        <div className="records-table-container">
                            {isLoadingRecords ? (
                                <div className="empty-state">
                                    <FiRefreshCw className="spin-icon empty-icon" />
                                    <p>Loading duplicate records...</p>
                                </div>
                            ) : stagedRecords.length === 0 ? (
                                <div className="empty-state">
                                    <FiCheckCircle className="empty-icon" style={{ color: '#10b981' }} />
                                    <h3>No Duplicates Found</h3>
                                    <p>All records appear unique within this migration and existing hospital records.</p>
                                </div>
                            ) : (
                                <div className="duplicates-list">
                                    {stagedRecords.map(rec => (
                                        <div key={rec._id || rec.stagingId} className="duplicate-review-card">
                                            <div className="duplicate-card-header">
                                                <div>
                                                    <span className="staging-badge">{rec.stagingId}</span>
                                                    <span style={{ marginLeft: '10px', fontWeight: 600, color: '#0f172a' }}>
                                                        {rec.entity} — {rec.transformedData?.name || rec.sourceData?.Name || 'Unnamed'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span className={`duplicate-match-type ${rec.duplicateInfo?.matchType === 'EXACT_DUPLICATE' ? 'exact' : 'possible'}`}>
                                                        {rec.duplicateInfo?.matchType === 'EXACT_DUPLICATE' ? 'Exact Duplicate' : 'Possible Duplicate'}
                                                    </span>
                                                    {rec.duplicateInfo?.resolution && rec.duplicateInfo?.resolution !== 'PENDING' && (
                                                        <span className="status-badge status-valid">
                                                            Decision: {rec.duplicateInfo.resolution}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="duplicate-columns-comparison">
                                                <div className="dup-column">
                                                    <h4>Source File Record</h4>
                                                    <div className="key-value-list">
                                                        <div className="key-value-row">
                                                            <span className="key-label">Name:</span>
                                                            <span className="key-val">{rec.transformedData?.name || rec.sourceData?.Name || 'N/A'}</span>
                                                        </div>
                                                        <div className="key-value-row">
                                                            <span className="key-label">Phone:</span>
                                                            <span className="key-val">{rec.transformedData?.phone || rec.sourceData?.Phone || 'N/A'}</span>
                                                        </div>
                                                        <div className="key-value-row">
                                                            <span className="key-label">UHID / MRN:</span>
                                                            <span className="key-val">{rec.transformedData?.uhid || rec.legacyId || 'N/A'}</span>
                                                        </div>
                                                        <div className="key-value-row">
                                                            <span className="key-label">DOB:</span>
                                                            <span className="key-val">{rec.transformedData?.dob || 'N/A'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="dup-column">
                                                    <h4>Matched Record Details</h4>
                                                    <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#334155' }}>
                                                        {rec.duplicateInfo?.matchedRecordSummary || 'Matching record details found.'}
                                                    </p>
                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {(rec.duplicateInfo?.matchedFields || []).map(f => (
                                                            <span key={f} className="mini-pill error">Matched on: {f}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="dup-actions-row">
                                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                    * Decision sets import instruction for Phase 3. No production data is modified in Phase 2.
                                                </div>
                                                <div className="dup-actions-buttons">
                                                    <button 
                                                        className="btn-dup-existing"
                                                        disabled={isUpdatingDuplicate}
                                                        onClick={() => handleDuplicateResolution(rec.stagingId || rec._id, 'USE_EXISTING')}
                                                    >
                                                        <FiUserCheck /> Use Existing
                                                    </button>
                                                    <button 
                                                        className="btn-dup-new"
                                                        disabled={isUpdatingDuplicate}
                                                        onClick={() => handleDuplicateResolution(rec.stagingId || rec._id, 'CREATE_NEW')}
                                                    >
                                                        <FiPlus /> Create New
                                                    </button>
                                                    <button 
                                                        className="btn-dup-skip"
                                                        disabled={isUpdatingDuplicate}
                                                        onClick={() => handleDuplicateResolution(rec.stagingId || rec._id, 'SKIP')}
                                                    >
                                                        <FiUserX /> Skip Record
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* TAB CONTENT: STAGED RECORDS TABLE */
                        <div className="records-table-container">
                            {isLoadingRecords ? (
                                <div className="empty-state">
                                    <FiRefreshCw className="spin-icon empty-icon" />
                                    <p>Loading staged records...</p>
                                </div>
                            ) : stagedRecords.length === 0 ? (
                                <div className="empty-state">
                                    <FiFolder className="empty-icon" />
                                    <h3>No Records Match Filter</h3>
                                    <p>Try clearing filters or changing search query.</p>
                                </div>
                            ) : (
                                <table className="records-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Staging ID</th>
                                            <th>Legacy ID</th>
                                            <th>Entity</th>
                                            <th>Primary Name / Title</th>
                                            <th>Phone / Identifier</th>
                                            <th>Status</th>
                                            <th>Issues</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stagedRecords.map((rec) => {
                                            const issues = rec.issues || [];
                                            const errorCount = issues.filter(i => i.severity === 'ERROR').length;
                                            const warningCount = issues.filter(i => i.severity === 'WARNING').length;

                                            return (
                                                <tr key={rec._id || rec.stagingId}>
                                                    <td>{rec.rowNumber}</td>
                                                    <td>
                                                        <span className="staging-badge">{rec.stagingId}</span>
                                                    </td>
                                                    <td style={{ color: '#64748b' }}>{rec.legacyId || '—'}</td>
                                                    <td>
                                                        <span className="format-badge">{rec.entity}</span>
                                                    </td>
                                                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                                                        {rec.transformedData?.name || rec.transformedData?.title || rec.sourceData?.Name || '—'}
                                                    </td>
                                                    <td>
                                                        {rec.transformedData?.phone || rec.transformedData?.uhid || rec.transformedData?.doctorId || rec.transformedData?.code || '—'}
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge status-${(rec.status || 'VALID').toLowerCase()}`}>
                                                            {rec.status === 'VALID' && <FiCheckCircle />}
                                                            {rec.status === 'WARNING' && <FiAlertTriangle />}
                                                            {rec.status === 'ERROR' && <FiAlertCircle />}
                                                            {rec.status === 'DUPLICATE' && <FiLayers />}
                                                            {rec.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {errorCount > 0 && (
                                                            <span className="mini-pill error" style={{ marginRight: '4px' }}>
                                                                {errorCount} Err
                                                            </span>
                                                        )}
                                                        {warningCount > 0 && (
                                                            <span className="mini-pill warning">
                                                                {warningCount} Warn
                                                            </span>
                                                        )}
                                                        {errorCount === 0 && warningCount === 0 && (
                                                            <span style={{ color: '#16a34a', fontSize: '12px' }}>✓ Valid</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button 
                                                            className="btn-secondary" 
                                                            style={{ padding: '5px 10px', fontSize: '12px' }}
                                                            onClick={() => handleOpenRecordDetail(rec.stagingId || rec._id)}
                                                        >
                                                            <FiEye /> Compare
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* Pagination Bar */}
                    {totalStagedCount > stagedLimit && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>
                                Showing {(stagedPage - 1) * stagedLimit + 1} to {Math.min(stagedPage * stagedLimit, totalStagedCount)} of {totalStagedCount} records
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                    className="btn-secondary"
                                    disabled={stagedPage <= 1}
                                    onClick={() => loadStagedRecords(session.migrationId, stagedPage - 1, selectedEntityFilter, previewTab, previewSearchQuery)}
                                >
                                    Previous
                                </button>
                                <span style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                    Page {stagedPage}
                                </span>
                                <button 
                                    className="btn-secondary"
                                    disabled={stagedPage * stagedLimit >= totalStagedCount}
                                    onClick={() => loadStagedRecords(session.migrationId, stagedPage + 1, selectedEntityFilter, previewTab, previewSearchQuery)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Bottom Final Review Action Bar */}
                    <div className="approved-actions-row" style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                                Phase 2 Migration Certification
                            </div>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>
                                Certifying this migration marks it as READY_FOR_IMPORT. No production data is written until Phase 3.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button className="btn-secondary" onClick={handleExportReport}>
                                <FiDownload /> Export Report
                            </button>
                            {session?.status === 'READY_FOR_IMPORT' ? (
                                <button 
                                    className="btn-primary" 
                                    style={{ background: '#0284c7', padding: '10px 22px', fontSize: '14px', fontWeight: 600 }}
                                    onClick={() => setShowImportModal(true)}
                                >
                                    <FiPlay /> Import Data
                                </button>
                            ) : (
                                <button 
                                    className="btn-primary" 
                                    style={{ background: '#10b981', padding: '10px 22px', fontSize: '14px' }}
                                    onClick={handleMarkReadyForImport}
                                    disabled={isMarkingReady}
                                >
                                    <FiCheckCircle /> {isMarkingReady ? 'Certifying...' : 'Mark Ready for Import'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 7: READY FOR IMPORT CERTIFICATION */}
            {currentStep === 7 && (
                <div className="certified-import-card">
                    <div className="cert-icon-circle">
                        <FiShield />
                    </div>
                    <span className="cert-pill">
                        READY_FOR_IMPORT
                    </span>
                    <h2 style={{ margin: '0 0 10px 0', fontSize: '24px', color: '#0f172a' }}>
                        Migration Certified for Import
                    </h2>
                    <p style={{ color: '#475569', fontSize: '15px', lineHeight: 1.6, marginBottom: '24px' }}>
                        Migration session <strong>{session?.migrationId}</strong> has been completely processed, transformed, cross-referenced, and validated.
                        <br />
                        <strong>READY FOR SAFE DATABASE IMPORT (PHASE 3)</strong>
                    </p>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' }}>
                            <div>
                                <span style={{ color: '#64748b' }}>Total Validated Records:</span>{' '}
                                <strong>{session?.previewSummary?.totalRecords || 0}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b' }}>Certified Entities:</span>{' '}
                                <strong>{session?.detectedEntities?.join(', ') || 'Patient'}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b' }}>Resolved Relationships:</span>{' '}
                                <strong>{session?.previewSummary?.relationshipsSummary?.resolvedReferences || 0}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b' }}>Status:</span>{' '}
                                <strong style={{ color: '#16a34a' }}>READY_FOR_IMPORT</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" onClick={() => setCurrentStep(6)}>
                            <FiEye /> Review Preview
                        </button>
                        <button className="btn-secondary" onClick={handleExportReport}>
                            <FiDownload /> Download Certification Report
                        </button>
                        <button 
                            className="btn-primary" 
                            style={{ background: '#0284c7', padding: '10px 24px', fontSize: '14px', fontWeight: 600 }}
                            onClick={() => setShowImportModal(true)}
                        >
                            <FiPlay /> Import Data
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 8: MIGRATION IMPORT & COMPLETION (PHASE 3) */}
            {currentStep === 8 && (
                <div className="step-content">
                    {/* Real-Time Progress View if IMPORTING or VERIFYING */}
                    {(session?.status === 'IMPORTING' || session?.status === 'VERIFYING' || isImporting) && (
                        <div className="realtime-progress-panel">
                            <div className="progress-header-row">
                                <div className="progress-stage-title">
                                    <FiRefreshCw className="spin" size={24} style={{ color: '#0284c7' }} />
                                    <span>{importProgress.currentStage || 'Executing Safe Database Import...'}</span>
                                </div>
                                <span style={{ fontSize: '18px', fontWeight: 700, color: '#0284c7' }}>
                                    {importProgress.percent || 0}%
                                </span>
                            </div>

                            <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${importProgress.percent || 5}%` }}></div>
                            </div>

                            <div className="progress-live-kpis">
                                <div className="live-kpi-card">
                                    <div className="live-kpi-val">{importProgress.processedRecords || 0} / {importProgress.totalRecords || session?.previewSummary?.totalRecords || 0}</div>
                                    <div className="live-kpi-lbl">Records Processed</div>
                                </div>
                                <div className="live-kpi-card">
                                    <div className="live-kpi-val" style={{ color: '#16a34a' }}>{session?.importSummary?.successfullyImported || 0}</div>
                                    <div className="live-kpi-lbl">Successfully Imported</div>
                                </div>
                                <div className="live-kpi-card">
                                    <div className="live-kpi-val" style={{ color: '#dc2626' }}>{session?.importSummary?.failed || 0}</div>
                                    <div className="live-kpi-lbl">Failed</div>
                                </div>
                                <div className="live-kpi-card">
                                    <div className="live-kpi-val" style={{ color: '#64748b' }}>{session?.importSummary?.skipped || 0}</div>
                                    <div className="live-kpi-lbl">Skipped</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Completion View when COMPLETED or COMPLETED_WITH_WARNINGS */}
                    {['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'].includes(session?.status) && !isImporting && (
                        <div>
                            {/* Status Hero Banner */}
                            {session?.status === 'COMPLETED' ? (
                                <div style={{
                                    background: '#ecfdf5',
                                    border: '2px solid #10b981',
                                    borderRadius: '16px',
                                    padding: '24px 28px',
                                    marginBottom: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '20px'
                                }}>
                                    <div style={{
                                        width: '56px',
                                        height: '56px',
                                        borderRadius: '50%',
                                        background: '#10b981',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '28px',
                                        flexShrink: 0
                                    }}>
                                        <FiCheckCircle />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', color: '#065f46' }}>
                                            Migration Completed Successfully!
                                        </h2>
                                        <p style={{ margin: 0, color: '#047857', fontSize: '14px', lineHeight: 1.5 }}>
                                            All valid hospital records have been safely imported into Medical365 production database collections with complete relational integrity.
                                        </p>
                                    </div>
                                </div>
                            ) : session?.status === 'COMPLETED_WITH_WARNINGS' ? (
                                <div style={{
                                    background: '#fffbeb',
                                    border: '2px solid #f59e0b',
                                    borderRadius: '16px',
                                    padding: '24px 28px',
                                    marginBottom: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '20px'
                                }}>
                                    <div style={{
                                        width: '56px',
                                        height: '56px',
                                        borderRadius: '50%',
                                        background: '#f59e0b',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '28px',
                                        flexShrink: 0
                                    }}>
                                        <FiAlertTriangle />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', color: '#92400e' }}>
                                            Migration Completed With Warnings
                                        </h2>
                                        <p style={{ margin: 0, color: '#b45309', fontSize: '14px', lineHeight: 1.5 }}>
                                            Production import succeeded for valid records. Some records were excluded due to validation errors or duplicate decisions. Review the detailed breakdown below.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    background: '#fef2f2',
                                    border: '2px solid #ef4444',
                                    borderRadius: '16px',
                                    padding: '24px 28px',
                                    marginBottom: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '20px'
                                }}>
                                    <div style={{
                                        width: '56px',
                                        height: '56px',
                                        borderRadius: '50%',
                                        background: '#ef4444',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '28px',
                                        flexShrink: 0
                                    }}>
                                        <FiAlertCircle />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', color: '#991b1b' }}>
                                            Migration Failed
                                        </h2>
                                        <p style={{ margin: 0, color: '#b91c1c', fontSize: '14px', lineHeight: 1.5 }}>
                                            The migration import encountered critical errors and could not complete.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* KPI Metrics Summary Grid */}
                            <div className="preview-metrics-grid" style={{ marginBottom: '24px' }}>
                                <div className="metric-card">
                                    <div className="metric-icon total"><FiDatabase /></div>
                                    <div className="metric-info">
                                        <span className="metric-val">{session?.importSummary?.totalSourceRecords || session?.previewSummary?.totalRecords || 0}</span>
                                        <span className="metric-label">Total Source Records</span>
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-icon valid"><FiCheckCircle /></div>
                                    <div className="metric-info">
                                        <span className="metric-val" style={{ color: '#16a34a' }}>{session?.importSummary?.successfullyImported || 0}</span>
                                        <span className="metric-label">Successfully Imported</span>
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-icon errors"><FiAlertCircle /></div>
                                    <div className="metric-info">
                                        <span className="metric-val" style={{ color: '#dc2626' }}>{session?.importSummary?.failed || 0}</span>
                                        <span className="metric-label">Failed Records</span>
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-icon total"><FiEyeOff /></div>
                                    <div className="metric-info">
                                        <span className="metric-val" style={{ color: '#64748b' }}>{session?.importSummary?.skipped || 0}</span>
                                        <span className="metric-label">Skipped Records</span>
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-icon warnings"><FiAlertTriangle /></div>
                                    <div className="metric-info">
                                        <span className="metric-val" style={{ color: '#d97706' }}>{session?.importSummary?.warnings || 0}</span>
                                        <span className="metric-label">Warnings</span>
                                    </div>
                                </div>
                            </div>

                            {/* Entity-wise Import Results Table */}
                            <div className="card" style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 16px 0' }}>
                                    Entity-Wise Import Breakdown
                                </h3>
                                <div className="table-responsive">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Target Entity</th>
                                                <th>Source Count</th>
                                                <th>Imported</th>
                                                <th>Failed</th>
                                                <th>Skipped</th>
                                                <th>Warnings</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(session?.importSummary?.entitiesBreakdown || []).map((eb, idx) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <span className="entity-tag" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                                            {eb.entity}
                                                        </span>
                                                    </td>
                                                    <td><strong>{eb.sourceCount || 0}</strong></td>
                                                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{eb.imported || 0}</td>
                                                    <td style={{ color: eb.failed > 0 ? '#dc2626' : '#64748b', fontWeight: eb.failed > 0 ? 600 : 400 }}>
                                                        {eb.failed || 0}
                                                    </td>
                                                    <td style={{ color: '#64748b' }}>{eb.skipped || 0}</td>
                                                    <td style={{ color: eb.warnings > 0 ? '#d97706' : '#64748b' }}>{eb.warnings || 0}</td>
                                                    <td>
                                                        {eb.failed > 0 ? (
                                                            <span className="badge badge-danger">Incomplete</span>
                                                        ) : (
                                                            <span className="badge badge-success">✓ Complete</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Automated Verification Panel */}
                            <div className="verification-panel">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FiCheckSquare style={{ color: '#10b981' }} /> Automated Post-Import Verification
                                    </h3>
                                    <span className={`badge ${session?.importSummary?.verification?.status === 'PASSED' ? 'badge-success' : 'badge-warning'}`}>
                                        {session?.importSummary?.verification?.status || 'PASSED'}
                                    </span>
                                </div>

                                {(session?.importSummary?.verification?.checks || []).map((chk, cIdx) => (
                                    <div key={cIdx} className={`verification-check-card ${chk.passed ? 'passed' : 'warning'}`}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {chk.passed ? (
                                                <FiCheckCircle style={{ color: '#16a34a', fontSize: '18px' }} />
                                            ) : (
                                                <FiAlertTriangle style={{ color: '#d97706', fontSize: '18px' }} />
                                            )}
                                            <div>
                                                <strong>{chk.name}</strong>
                                                <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>
                                                    {chk.message}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: chk.passed ? '#16a34a' : '#d97706' }}>
                                            {chk.passed ? 'VERIFIED' : 'REVIEW'}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Failed Records Section (if any records failed) */}
                            {session?.importSummary?.failed > 0 && (
                                <div className="failed-records-panel">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#991b1b', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FiAlertCircle /> Failed Records Report ({session?.importSummary?.failed})
                                            </h3>
                                            <div style={{ fontSize: '13px', color: '#7f1d1d' }}>
                                                These records could not be safely imported into Medical365. No broken records were created.
                                            </div>
                                        </div>
                                        <button className="btn-secondary" style={{ borderColor: '#fca5a5', color: '#991b1b' }} onClick={handleExportFailedReport}>
                                            <FiDownload /> Export Failed Records CSV
                                        </button>
                                    </div>

                                    {failedRecords.length > 0 && (
                                        <table className="failed-table">
                                            <thead>
                                                <tr>
                                                    <th>Entity</th>
                                                    <th>Row #</th>
                                                    <th>Staging ID</th>
                                                    <th>Legacy ID</th>
                                                    <th>Failure Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {failedRecords.map((fr, fIdx) => (
                                                    <tr key={fIdx}>
                                                        <td><span className="entity-tag">{fr.entity}</span></td>
                                                        <td>{fr.rowNumber}</td>
                                                        <td><code>{fr.stagingId}</code></td>
                                                        <td><code>{fr.legacyId || '—'}</code></td>
                                                        <td className="failed-reason-text">{fr.importError || 'Validation error'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* Bottom Action Footer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '20px' }}>
                                <div style={{ fontSize: '13px', color: '#64748b' }}>
                                    Migration <strong>{session?.migrationId}</strong> completed at {session?.importSummary?.completedAt ? new Date(session.importSummary.completedAt).toLocaleString() : new Date().toLocaleString()}.
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="btn-secondary" onClick={handleExportReport}>
                                        <FiDownload /> Download Preview Report
                                    </button>
                                    <button className="btn-primary" onClick={() => { setViewMode('dashboard'); loadDashboardData(); }}>
                                        <FiCheckCircle /> Back to Migration Dashboard
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* IMPORT CONFIRMATION MODAL */}
            {showImportModal && (
                <div className="modal-overlay">
                    <div className="import-confirm-content">
                        <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#dbeafe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                    <FiPlay />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Confirm Production Import</h3>
                                    <div style={{ fontSize: '13px', color: '#64748b' }}>Session: {session?.migrationId}</div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowImportModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        <div className="modal-body" style={{ paddingTop: '16px' }}>
                            <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                                Are you sure you want to import this data into Medical365 production database?
                            </p>

                            <div className="confirm-breakdown-box">
                                <div className="confirm-row">
                                    <span>Total Records:</span>
                                    <strong>{session?.previewSummary?.totalRecords || 0}</strong>
                                </div>
                                <div className="confirm-row">
                                    <span>Valid Records:</span>
                                    <strong style={{ color: '#16a34a' }}>{session?.previewSummary?.validRecords || 0}</strong>
                                </div>
                                <div className="confirm-row">
                                    <span>Warnings (Importable):</span>
                                    <strong style={{ color: '#d97706' }}>{session?.previewSummary?.warningRecords || 0}</strong>
                                </div>
                                <div className="confirm-row">
                                    <span>Duplicates (Phase 2 Decisions):</span>
                                    <strong style={{ color: '#64748b' }}>{session?.previewSummary?.duplicateRecords || 0}</strong>
                                </div>
                                <div className="confirm-row" style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                                    <span style={{ fontWeight: 600 }}>Records to Import:</span>
                                    <strong style={{ color: '#0284c7', fontSize: '15px' }}>
                                        {(session?.previewSummary?.validRecords || 0) + (session?.previewSummary?.warningRecords || 0)}
                                    </strong>
                                </div>
                            </div>

                            <div className="import-warning-banner">
                                <FiAlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <strong>Important Safety Notice:</strong>
                                    <div>
                                        This action will create records in the Medical365 database and cannot be treated as a preview.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                className="btn-primary" 
                                style={{ background: '#0284c7', padding: '10px 22px' }}
                                onClick={handleStartImport}
                                disabled={isImporting}
                            >
                                <FiPlay /> {isImporting ? 'Starting Import...' : 'Start Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SIDE-BY-SIDE RECORD DETAIL MODAL */}
            {selectedRecordDetail && (
                <div className="record-modal-overlay" onClick={() => setSelectedRecordDetail(null)}>
                    <div className="record-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="staging-badge">{selectedRecordDetail.stagingId}</span>
                                <span style={{ marginLeft: '12px', fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>
                                    {selectedRecordDetail.entity} Record Detail (Row #{selectedRecordDetail.rowNumber})
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className={`status-badge status-${(selectedRecordDetail.status || 'VALID').toLowerCase()}`}>
                                    {selectedRecordDetail.status}
                                </span>
                                <button 
                                    onClick={() => setSelectedRecordDetail(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                                >
                                    <FiX size={22} />
                                </button>
                            </div>
                        </div>

                        <div className="record-modal-body">
                            {/* Side by side comparison */}
                            <div className="side-by-side-comparison">
                                {/* Left: Source Legacy Data */}
                                <div className="comparison-box">
                                    <h4><FiFileText /> Source Data (Legacy Hospital)</h4>
                                    <div className="key-value-list">
                                        {Object.entries(selectedRecordDetail.sourceData || {}).map(([k, v]) => (
                                            <div key={k} className="key-value-row">
                                                <span className="key-label">{k}</span>
                                                <span className="key-val">{String(v || '—')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right: Transformed Medical365 Data */}
                                <div className="comparison-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                    <h4 style={{ color: '#166534' }}><FiCheckCircle /> Transformed Data (Medical365)</h4>
                                    <div className="key-value-list">
                                        {Object.entries(selectedRecordDetail.transformedData || {})
                                            .filter(([k]) => k !== 'customFields')
                                            .map(([k, v]) => (
                                                <div key={k} className="key-value-row">
                                                    <span className="key-label" style={{ color: '#166534' }}>{k}</span>
                                                    <span className="key-val" style={{ color: '#14532d' }}>{String(v || '—')}</span>
                                                </div>
                                            ))}
                                    </div>

                                    {/* Custom Fields Preview */}
                                    {selectedRecordDetail.transformedData?.customFields && 
                                     Object.keys(selectedRecordDetail.transformedData.customFields).length > 0 && (
                                        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #bbf7d0' }}>
                                            <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#15803d' }}>
                                                Custom Fields
                                            </h5>
                                            <div className="key-value-list">
                                                {Object.entries(selectedRecordDetail.transformedData.customFields).map(([ck, cv]) => (
                                                    <div key={ck} className="key-value-row">
                                                        <span className="key-label">{ck}</span>
                                                        <span className="key-val">{String(cv || '—')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Validation & Relationships Section */}
                            <div className="validation-checklist-box">
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0f172a' }}>
                                    <FiCheckCircle /> Validation & Relationship Checklist
                                </h4>

                                {/* Relationships Resolution List */}
                                {(selectedRecordDetail.relationships || []).length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#334155', marginBottom: '8px' }}>
                                            Foreign References:
                                        </div>
                                        {selectedRecordDetail.relationships.map((rel, rIdx) => (
                                            <div 
                                                key={rIdx} 
                                                style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between',
                                                    padding: '8px 12px',
                                                    background: rel.status === 'RESOLVED' ? '#f0fdf4' : '#fef2f2',
                                                    border: `1px solid ${rel.status === 'RESOLVED' ? '#bbf7d0' : '#fecaca'}`,
                                                    borderRadius: '6px',
                                                    marginBottom: '6px',
                                                    fontSize: '13px'
                                                }}
                                            >
                                                <div>
                                                    <strong>{rel.targetEntity}</strong> (via field <code>{rel.field}</code> = "{rel.legacyId}")
                                                </div>
                                                <div>
                                                    {rel.status === 'RESOLVED' ? (
                                                        <span style={{ color: '#16a34a', fontWeight: 600 }}>
                                                            ✓ Resolved &rarr; {rel.resolvedStagingId}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                                                            ✗ Broken reference: {rel.error}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Identified Issues List */}
                                {(selectedRecordDetail.issues || []).length > 0 ? (
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#334155', marginBottom: '8px' }}>
                                            Identified Issues:
                                        </div>
                                        {selectedRecordDetail.issues.map((iss, iIdx) => (
                                            <div key={iIdx} className={`issue-item-card ${iss.severity}`}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <strong>[{iss.category}] {iss.field ? `Field: ${iss.field}` : ''}</strong>
                                                    <span style={{ fontWeight: 700, fontSize: '11px' }}>{iss.severity}</span>
                                                </div>
                                                <div>{iss.message}</div>
                                                {iss.suggestedAction && (
                                                    <div style={{ marginTop: '4px', fontSize: '12px', fontStyle: 'italic', opacity: 0.9 }}>
                                                        Suggested action: {iss.suggestedAction}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ color: '#16a34a', fontSize: '13px', padding: '8px 0' }}>
                                        ✓ No validation or structural issues detected. All required fields and types match canonical Medical365 specifications.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="record-modal-header" style={{ justifyContent: 'flex-end', background: '#f8fafc' }}>
                            <button className="btn-primary" onClick={() => setSelectedRecordDetail(null)}>
                                Close Record Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOM FIELD CREATION MODAL */}
            {showCustomModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Create Custom Field Definition</h3>
                            <button 
                                onClick={() => setShowCustomModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                            >
                                <FiX size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCustomField}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Entity Target</label>
                                    <select 
                                        className="form-control"
                                        value={customFieldForm.entity}
                                        onChange={(e) => setCustomFieldForm(prev => ({ ...prev, entity: e.target.value }))}
                                    >
                                        {supportedEntities.map(ent => (
                                            <option key={ent} value={ent}>{ent}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Field Label</label>
                                    <input 
                                        type="text"
                                        className="form-control"
                                        placeholder="E.g. Father Name"
                                        value={customFieldForm.fieldLabel}
                                        onChange={(e) => {
                                            const label = e.target.value;
                                            const key = label.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                                            setCustomFieldForm(prev => ({ ...prev, fieldLabel: label, fieldKey: key }));
                                        }}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Field Key (Snake Case)</label>
                                    <input 
                                        type="text"
                                        className="form-control"
                                        placeholder="E.g. father_name"
                                        value={customFieldForm.fieldKey}
                                        onChange={(e) => setCustomFieldForm(prev => ({ ...prev, fieldKey: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Data Type</label>
                                    <select 
                                        className="form-control"
                                        value={customFieldForm.dataType}
                                        onChange={(e) => setCustomFieldForm(prev => ({ ...prev, dataType: e.target.value }))}
                                    >
                                        <option value="Text">Text</option>
                                        <option value="Number">Number</option>
                                        <option value="Date">Date</option>
                                        <option value="Boolean">Boolean</option>
                                        <option value="Select">Select</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowCustomModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">
                                    Create Custom Field
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

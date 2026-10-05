import React, { useState, useEffect, useCallback } from 'react';
import { 
    FiServer, FiDatabase, FiCloud, FiCheckCircle, FiAlertCircle, 
    FiAlertTriangle, FiRefreshCw, FiCopy, FiCheck, FiX, FiShield, 
    FiTerminal, FiActivity, FiCpu, FiClock, FiLink2, FiPlay, FiRotateCcw, FiLayers, FiList,
    FiSearch, FiFilter, FiGitMerge, FiUser, FiInfo, FiHardDrive, FiDownloadCloud, FiTrash2, FiArchive
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { localAgentAPI, localSyncAPI } from '../../utils/api';
import './LocalSync.css';

export default function LocalSync() {
    const [loading, setLoading] = useState(true);
    const [statusData, setStatusData] = useState(null);
    const [syncData, setSyncData] = useState(null);
    const [testingDb, setTestingDb] = useState(false);
    const [testingCloud, setTestingCloud] = useState(false);
    const [startingInitialSync, setStartingInitialSync] = useState(false);
    const [syncingNow, setSyncingNow] = useState(false);
    const [retryingFailed, setRetryingFailed] = useState(false);
    const [showPairModal, setShowPairModal] = useState(false);
    const [provisionData, setProvisionData] = useState(null);
    const [copiedToken, setCopiedToken] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState(false);
    const [revoking, setRevoking] = useState(false);

    // ── Phase 3 & Phase 5 State ────────────────────────────────────────────────
    const [uploadData, setUploadData] = useState(null);
    const [conflictsList, setConflictsList] = useState([]);
    const [pendingConflictCount, setPendingConflictCount] = useState(0);
    const [activePhase3Tab, setActivePhase3Tab] = useState('activity'); // 'activity' | 'conflicts'
    const [conflictStatusFilter, setConflictStatusFilter] = useState('PENDING'); // 'PENDING' | 'RESOLVED' | 'ALL'
    const [conflictEntityFilter, setConflictEntityFilter] = useState('ALL');
    const [conflictSearchTerm, setConflictSearchTerm] = useState('');

    // Conflict Resolution Modal State (Phase 5)
    const [selectedConflict, setSelectedConflict] = useState(null);
    const [showConflictModal, setShowConflictModal] = useState(false);
    const [conflictDetailLoading, setConflictDetailLoading] = useState(false);
    const [conflictDetailData, setConflictDetailData] = useState(null);
    const [mergeFieldSelections, setMergeFieldSelections] = useState({});
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolvingConflict, setResolvingConflict] = useState(false);
    const [viewMode, setViewMode] = useState('diff'); // 'diff' | 'json'

    // ── Phase 6: Production Readiness State ─────────────────────────────────
    const [syncHealth, setSyncHealth] = useState(null);
    const [integrityReport, setIntegrityReport] = useState(null);
    const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);
    const [backupStatus, setBackupStatus] = useState(null);
    const [rebuildStatus, setRebuildStatus] = useState(null);
    const [rebuildingDb, setRebuildingDb] = useState(false);
    const [showRebuildModal, setShowRebuildModal] = useState(false);
    const [rebuildConfirmText, setRebuildConfirmText] = useState('');

    const loadStatus = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await localAgentAPI.getStatus();
            if (res.success) {
                setStatusData(res);
            }
        } catch (err) {
            if (!silent) {
                toast.error(err.response?.data?.message || 'Failed to load local agent status.');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadSyncStatus = async (silent = false) => {
        try {
            const res = await localSyncAPI.getSyncStatus();
            if (res.success) {
                setSyncData(res);
            }
        } catch (err) {
            if (!silent) console.error('Failed to load sync status:', err.message);
        }
    };

    const loadUploadStats = async () => {
        try {
            const res = await localSyncAPI.getUploadStats();
            if (res.success) {
                setUploadData(res);
            }
        } catch (err) {
            // silent catch
        }
    };

    const loadConflicts = async (status = conflictStatusFilter) => {
        try {
            const params = {};
            if (status && status !== 'ALL') {
                params.status = status;
            }
            const res = await localSyncAPI.getConflicts(params);
            if (res.success) {
                const list = res.data?.conflicts || res.conflicts || [];
                setConflictsList(list);
                if (res.data?.pendingCount !== undefined) {
                    setPendingConflictCount(res.data.pendingCount);
                } else {
                    const pending = list.filter(c => c.status === 'PENDING' || c.status === 'PENDING_REVIEW').length;
                    setPendingConflictCount(pending);
                }
            }
        } catch (err) {
            // silent catch
        }
    };

    const openConflictModal = async (c) => {
        setSelectedConflict(c);
        setShowConflictModal(true);
        setConflictDetailLoading(true);
        setMergeFieldSelections({});
        setResolutionNotes('');
        setViewMode('diff');
        try {
            const res = await localSyncAPI.getConflictDetail(c.conflictId);
            if (res.success && res.data) {
                setConflictDetailData(res.data);
                const defaultMerge = {};
                if (Array.isArray(res.data.diff)) {
                    for (const item of res.data.diff) {
                        if (!item.isProhibited && item.isDifferent) {
                            defaultMerge[item.field] = 'CLOUD';
                        }
                    }
                }
                setMergeFieldSelections(defaultMerge);
            } else {
                setConflictDetailData(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to fetch conflict details');
        } finally {
            setConflictDetailLoading(false);
        }
    };

    const handleResolveConflict = async (resolutionType) => {
        if (!selectedConflict) return;
        if (resolutionType === 'MERGED' && Object.keys(mergeFieldSelections).length === 0) {
            toast.error('Please configure field selections before applying merge.');
            return;
        }

        const confirmMsg = resolutionType === 'KEEP_LOCAL'
            ? 'Are you sure you want to KEEP LOCAL version? Cloud database will be updated with local data and a new version will be broadcast.'
            : resolutionType === 'KEEP_CLOUD'
            ? 'Are you sure you want to KEEP CLOUD version? Cloud data remains authoritative and will overwrite local conflicting data.'
            : 'Are you sure you want to APPLY MERGED version? Selected fields will become authoritative on Cloud.';

        if (!window.confirm(confirmMsg)) return;

        setResolvingConflict(true);
        try {
            const payload = {
                resolutionType,
                selectedMergeFields: resolutionType === 'MERGED' ? mergeFieldSelections : {},
                resolutionNotes: resolutionNotes.trim()
            };

            const res = await localSyncAPI.resolveConflict(selectedConflict.conflictId, payload);
            if (res.success) {
                toast.success(res.message || `Conflict successfully resolved via ${resolutionType}!`);
                setShowConflictModal(false);
                setSelectedConflict(null);
                setConflictDetailData(null);
                loadConflicts(conflictStatusFilter);
                loadUploadStats();
                loadSyncStatus(true);
            }
        } catch (err) {
            if (err.response?.status === 409 || err.response?.data?.code === 'STALE_CONFLICT') {
                toast.error(err.response?.data?.message || 'Conflict is stale! Cloud record was updated. Refreshing...');
                openConflictModal(selectedConflict);
            } else {
                toast.error(err.response?.data?.message || 'Failed to resolve conflict.');
            }
        } finally {
            setResolvingConflict(false);
        }
    };

    const handleDismissConflict = async () => {
        if (!selectedConflict) return;
        if (!window.confirm('Dismiss this conflict? Record will not be modified in Cloud.')) return;
        setResolvingConflict(true);
        try {
            const res = await localSyncAPI.dismissConflict(selectedConflict.conflictId, {
                dismissalNotes: resolutionNotes.trim() || 'Dismissed by Hospital Admin'
            });
            if (res.success) {
                toast.success(`Conflict '${selectedConflict.conflictId}' dismissed.`);
                setShowConflictModal(false);
                setSelectedConflict(null);
                setConflictDetailData(null);
                loadConflicts(conflictStatusFilter);
                loadUploadStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to dismiss conflict.');
        } finally {
            setResolvingConflict(false);
        }
    };

    // ── Phase 6: Loaders & Handlers ──────────────────────────────────────────
    const loadSyncHealth = useCallback(async () => {
        try {
            const res = await localSyncAPI.getSyncHealth();
            if (res.success) setSyncHealth(res);
        } catch (err) { /* silent */ }
    }, []);

    const handleVerifyIntegrity = async () => {
        setVerifyingIntegrity(true);
        try {
            const res = await localSyncAPI.verifyIntegrity();
            if (res.success) {
                setIntegrityReport(res.report);
                toast.success(`Integrity check complete: ${res.report.status}`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Integrity verification failed.');
        } finally {
            setVerifyingIntegrity(false);
        }
    };

    const loadBackupStatus = async () => {
        try {
            const res = await localSyncAPI.getBackupStatus();
            if (res.success) setBackupStatus(res);
        } catch (err) { /* silent */ }
    };

    const loadRebuildStatus = async () => {
        try {
            const res = await localSyncAPI.getRebuildStatus();
            if (res.success) setRebuildStatus(res);
        } catch (err) { /* silent */ }
    };

    const handleRebuildLocalDatabase = async () => {
        if (rebuildConfirmText !== 'REBUILD') {
            toast.error('Please type REBUILD to confirm.');
            return;
        }
        setRebuildingDb(true);
        try {
            const res = await localSyncAPI.rebuildLocalDatabase('CONFIRM_REBUILD_LOCAL_DATABASE');
            if (res.success) {
                toast.success(res.message || 'Local database rebuild initiated!');
                setShowRebuildModal(false);
                setRebuildConfirmText('');
                loadStatus();
                loadSyncStatus();
                loadSyncHealth();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to initiate rebuild.');
        } finally {
            setRebuildingDb(false);
        }
    };

    useEffect(() => {
        loadStatus();
        loadSyncStatus();
        loadUploadStats();
        loadConflicts(conflictStatusFilter);
        loadSyncHealth();
        loadBackupStatus();
        loadRebuildStatus();
        // Periodic background poll every 8 seconds for real-time heartbeat and sync monitoring
        const interval = setInterval(() => {
            loadStatus(true);
            loadSyncStatus(true);
            loadUploadStats();
            loadConflicts(conflictStatusFilter);
            loadSyncHealth();
        }, 8000);
        return () => clearInterval(interval);
    }, [conflictStatusFilter]);

    const handleTestLocalDb = async () => {
        setTestingDb(true);
        try {
            const res = await localAgentAPI.testConnection();
            if (res.success) {
                toast.success(`Local Database is ${res.dbStatus}! Latency: ${res.latencyMs || 0}ms`);
            } else {
                toast.error(res.message || 'Local Database test failed.');
            }
            loadStatus(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to test local database.');
        } finally {
            setTestingDb(false);
        }
    };

    const handleTestCloudConnection = async () => {
        setTestingCloud(true);
        try {
            const res = await localAgentAPI.testConnection();
            if (res.success) {
                toast.success(`Cloud Connection is active! Status: ${res.status}`);
            } else {
                toast.error(res.message || 'Cloud Connection test failed.');
            }
            loadStatus(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to test cloud connection.');
        } finally {
            setTestingCloud(false);
        }
    };

    const handleOpenPairingModal = async () => {
        try {
            const res = await localAgentAPI.provision();
            if (res.success) {
                setProvisionData(res);
                setShowPairModal(true);
            } else {
                toast.error(res.message || 'Failed to generate pairing token.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error provisioning agent.');
        }
    };

    const handleRevoke = async () => {
        if (!window.confirm('Are you sure you want to revoke the Local Agent credentials? The local agent will be disconnected and will not be able to authenticate until paired again.')) {
            return;
        }

        setRevoking(true);
        try {
            const res = await localAgentAPI.revoke();
            if (res.success) {
                toast.success('Local Agent credentials revoked.');
                loadStatus();
            } else {
                toast.error(res.message || 'Failed to revoke credentials.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error revoking credentials.');
        } finally {
            setRevoking(false);
        }
    };

    // ── Phase 2: Sync Handlers ────────────────────────────────────────────────
    const handleStartInitialSync = async () => {
        setStartingInitialSync(true);
        try {
            const res = await localSyncAPI.startInitialSync();
            if (res.success) {
                toast.success(res.message || 'Initial sync started!');
                loadSyncStatus(true);
            } else {
                toast.error(res.message || 'Failed to start initial sync.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error starting initial sync.');
        } finally {
            setStartingInitialSync(false);
        }
    };

    const handleSyncNow = async () => {
        setSyncingNow(true);
        try {
            const res = await localSyncAPI.syncNow();
            if (res.success) {
                toast.success(res.message || 'Immediate sync signal broadcast!');
                loadSyncStatus(true);
            } else {
                toast.error(res.message || 'Failed to trigger sync.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error triggering sync.');
        } finally {
            setSyncingNow(false);
        }
    };

    const handleRetryFailed = async () => {
        setRetryingFailed(true);
        try {
            const res = await localSyncAPI.retryFailed();
            if (res.success) {
                toast.success(res.message || 'Failed events reset for retry.');
                loadSyncStatus(true);
            } else {
                toast.error(res.message || 'Failed to retry events.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error retrying failed events.');
        } finally {
            setRetryingFailed(false);
        }
    };

    const formatHeartbeatTime = (dateStr) => {
        if (!dateStr) return 'Never';
        const d = new Date(dateStr);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const diffSeconds = Math.round((Date.now() - d.getTime()) / 1000);

        if (diffSeconds < 60) {
            return `${timeStr} (${diffSeconds}s ago)`;
        } else if (diffSeconds < 3600) {
            return `${timeStr} (${Math.round(diffSeconds / 60)}m ago)`;
        }
        return `${timeStr} (${Math.round(diffSeconds / 3600)}h ago)`;
    };

    const configSnippet = provisionData ? JSON.stringify({
        cloudUrl: provisionData.cloudUrl || 'http://localhost:3000',
        installationId: provisionData.installationId,
        pairingToken: provisionData.pairingToken,
        agentToken: null,
        localMongoUri: "mongodb://localhost:27017/medical365_local",
        localHealthPort: 4000,
        heartbeatIntervalMs: 15000,
        agentName: provisionData.name || "Hospital Local Server"
    }, null, 2) : '';

    return (
        <div className="local-sync-container">
            {/* Header */}
            <div className="local-sync-header">
                <div>
                    <h1 className="local-sync-title">
                        <FiServer style={{ color: '#0284c7' }} /> Local Database & Offline Sync
                    </h1>
                    <p className="local-sync-subtitle">
                        Manage your hospital-local server infrastructure for high-availability offline capability.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-secondary" onClick={() => loadStatus()} disabled={loading}>
                        <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    {statusData?.configured ? (
                        <button className="btn-secondary" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={handleRevoke} disabled={revoking}>
                            {revoking ? 'Revoking...' : 'Revoke Agent'}
                        </button>
                    ) : (
                        <button className="btn-primary" onClick={handleOpenPairingModal}>
                            <FiLink2 /> Pair Local Agent
                        </button>
                    )}
                </div>
            </div>

            {/* Phase 4 Offline Warning Banner (Non-Blocking) */}
            {statusData?.cloudConnection !== 'CONNECTED' && (
                <div className="offline-warning-banner" role="alert">
                    <FiAlertTriangle className="offline-warning-icon" />
                    <div className="offline-warning-content">
                        <span className="offline-warning-title">Offline Operation Active</span>
                        <p className="offline-warning-desc">
                            Cloud connection unavailable. Local changes are being stored safely and will sync automatically when connection is restored.
                        </p>
                    </div>
                </div>
            )}

            {/* Production Safety Notice */}
            <div className="phase-notice-banner">
                <FiShield />
                <div>
                    <strong>Production Offline Sync Active:</strong> Full two-way synchronization with conflict resolution, durable queue, crash recovery, and data integrity verification.
                    <span style={{ display: 'block', marginTop: '2px', color: '#14532d', fontSize: '13px' }}>
                        Supported entities: Patients, Doctors, Departments, Services, Beds, Medicines, Hospital Config.
                    </span>
                </div>
            </div>

            {/* ── PHASE 6: SYNC HEALTH DASHBOARD ──────────────────────────── */}
            {syncHealth && (
                <div className="sync-health-dashboard">
                    <div className="sync-health-title">System Health Overview</div>
                    <div className="sync-health-grid">
                        <div className={`health-indicator ${syncHealth.cloud?.status === 'CONNECTED' ? 'healthy' : 'error'}`}>
                            <FiCloud className="health-icon" />
                            <div className="health-label">Cloud</div>
                            <div className="health-value">{syncHealth.cloud?.label || 'Unknown'}</div>
                        </div>
                        <div className={`health-indicator ${syncHealth.agent?.status === 'ONLINE' ? 'healthy' : syncHealth.agent?.status === 'DEGRADED' ? 'warning' : syncHealth.agent?.status === 'NOT_CONFIGURED' ? 'unconfigured' : 'error'}`}>
                            <FiCpu className="health-icon" />
                            <div className="health-label">Local Agent</div>
                            <div className="health-value">{syncHealth.agent?.label || 'Unknown'}</div>
                        </div>
                        <div className={`health-indicator ${syncHealth.database?.status === 'HEALTHY' ? 'healthy' : syncHealth.database?.status === 'DOWN' ? 'error' : 'warning'}`}>
                            <FiDatabase className="health-icon" />
                            <div className="health-label">Local Database</div>
                            <div className="health-value">{syncHealth.database?.label || 'Unknown'}</div>
                        </div>
                        <div className={`health-indicator ${syncHealth.sync?.status === 'HEALTHY' ? 'healthy' : syncHealth.sync?.status === 'WARNING' ? 'warning' : syncHealth.sync?.status === 'ERROR' ? 'error' : syncHealth.sync?.status === 'NOT_CONFIGURED' ? 'unconfigured' : 'offline'}`}>
                            <FiActivity className="health-icon" />
                            <div className="health-label">Sync</div>
                            <div className="health-value">{syncHealth.sync?.label || 'Unknown'}</div>
                        </div>
                        <div className="health-metric">
                            <div className="health-metric-value">{syncHealth.metrics?.pending ?? 0}</div>
                            <div className="health-metric-label">Pending</div>
                        </div>
                        <div className="health-metric">
                            <div className={`health-metric-value ${syncHealth.metrics?.failed > 0 ? 'text-rose' : ''}`}>{syncHealth.metrics?.failed ?? 0}</div>
                            <div className="health-metric-label">Failed</div>
                        </div>
                        <div className="health-metric">
                            <div className={`health-metric-value ${syncHealth.metrics?.conflicts > 0 ? 'text-amber' : ''}`}>{syncHealth.metrics?.conflicts ?? 0}</div>
                            <div className="health-metric-label">Conflicts</div>
                        </div>
                        <div className="health-metric">
                            <div className="health-metric-value" style={{ fontSize: '13px' }}>
                                {syncHealth.metrics?.lastSuccessfulSync ? new Date(syncHealth.metrics.lastSuccessfulSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </div>
                            <div className="health-metric-label">Last Sync</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Architecture Topology Diagram */}
            <div className="topology-card">
                <div className="topology-title">Infrastructure Topology & Health</div>
                <div className="topology-row">
                    {/* Node 1: Cloud */}
                    <div className="topology-node active">
                        <div className="node-icon" style={{ color: '#0284c7' }}><FiCloud /></div>
                        <div className="node-title">Medical365 Cloud</div>
                        <div className="node-subtitle">Primary Cloud DB (Online)</div>
                    </div>

                    <div className="topology-connector">
                        <span>HTTPS / Heartbeat</span>
                        <div className="connector-line"></div>
                        <span>Outbound Port 443</span>
                    </div>

                    {/* Node 2: Local Agent */}
                    <div className={`topology-node ${
                        statusData?.status === 'ONLINE' ? 'active' :
                        statusData?.status === 'DEGRADED' ? 'warning' :
                        statusData?.status === 'OFFLINE' ? 'error' : ''
                    }`}>
                        <div className="node-icon" style={{
                            color: statusData?.status === 'ONLINE' ? '#10b981' :
                                   statusData?.status === 'DEGRADED' ? '#f59e0b' :
                                   statusData?.status === 'OFFLINE' ? '#ef4444' : '#64748b'
                        }}>
                            <FiCpu />
                        </div>
                        <div className="node-title">Local Agent</div>
                        <div className="node-subtitle">
                            {statusData?.status === 'ONLINE' ? 'Connected & Active' :
                             statusData?.status === 'DEGRADED' ? 'Degraded (DB Down)' :
                             statusData?.status === 'OFFLINE' ? 'Disconnected / Offline' : 'Not Configured'}
                        </div>
                    </div>

                    <div className="topology-connector">
                        <span>Mongo Driver</span>
                        <div className="connector-line"></div>
                        <span>Port 27017</span>
                    </div>

                    {/* Node 3: Local MongoDB */}
                    <div className={`topology-node ${
                        statusData?.dbStatus === 'HEALTHY' ? 'active' :
                        statusData?.dbStatus === 'DOWN' ? 'error' : ''
                    }`}>
                        <div className="node-icon" style={{
                            color: statusData?.dbStatus === 'HEALTHY' ? '#10b981' :
                                   statusData?.dbStatus === 'DOWN' ? '#ef4444' : '#64748b'
                        }}>
                            <FiDatabase />
                        </div>
                        <div className="node-title">Hospital Local MongoDB</div>
                        <div className="node-subtitle">
                            {statusData?.dbStatus === 'HEALTHY' ? 'Healthy (medical365_local)' :
                             statusData?.dbStatus === 'DOWN' ? 'Down / Connection Error' : 'Unknown Status'}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3 Core Status Cards Grid */}
            <div className="core-status-grid">
                {/* 1. LOCAL DATABASE */}
                <div className="status-panel-card">
                    <div>
                        <div className="panel-card-header">
                            <div>
                                <div className="panel-card-title">Hospital Server Storage</div>
                                <h3 className="panel-card-heading">LOCAL DATABASE</h3>
                            </div>
                            <span className={`status-pill ${
                                statusData?.dbStatus === 'HEALTHY' ? 'healthy' :
                                statusData?.dbStatus === 'DOWN' ? 'down' : 'unknown'
                            }`}>
                                {statusData?.dbStatus === 'HEALTHY' ? <FiCheckCircle /> : <FiAlertCircle />}
                                {statusData?.dbStatus === 'HEALTHY' ? 'Healthy' :
                                 statusData?.dbStatus === 'DOWN' ? 'Database Error' : 'Unknown'}
                            </span>
                        </div>

                        <div className="panel-metrics-list">
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Engine:</span>
                                <span className="panel-metric-value">MongoDB Community 6.x+</span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Local Database:</span>
                                <span className="panel-metric-value">{statusData?.localHealth?.localDbName || 'medical365_local'}</span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Ping Latency:</span>
                                <span className="panel-metric-value">
                                    {statusData?.localHealth?.dbLatencyMs !== undefined ? `${statusData.localHealth.dbLatencyMs} ms` : '—'}
                                </span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Listening Port:</span>
                                <span className="panel-metric-value">27017 (Localhost Only)</span>
                            </div>
                        </div>
                    </div>

                    <div className="panel-card-footer">
                        <button 
                            className="btn-secondary" 
                            style={{ width: '100%', justifyContent: 'center' }} 
                            onClick={handleTestLocalDb}
                            disabled={testingDb}
                        >
                            <FiActivity className={testingDb ? 'spin' : ''} /> {testingDb ? 'Testing DB...' : 'Test Local Database'}
                        </button>
                    </div>
                </div>

                {/* 2. LOCAL AGENT */}
                <div className="status-panel-card">
                    <div>
                        <div className="panel-card-header">
                            <div>
                                <div className="panel-card-title">Hospital Daemon Service</div>
                                <h3 className="panel-card-heading">LOCAL AGENT</h3>
                            </div>
                            <span className={`status-pill ${
                                statusData?.status === 'ONLINE' ? 'connected' :
                                statusData?.status === 'DEGRADED' ? 'degraded' :
                                statusData?.status === 'OFFLINE' ? 'disconnected' : 'unconfigured'
                            }`}>
                                {statusData?.status === 'ONLINE' ? <FiCheckCircle /> :
                                 statusData?.status === 'DEGRADED' ? <FiAlertTriangle /> :
                                 statusData?.status === 'OFFLINE' ? <FiAlertCircle /> : <FiClock />}
                                {statusData?.status === 'ONLINE' ? 'Connected' :
                                 statusData?.status === 'DEGRADED' ? 'Degraded' :
                                 statusData?.status === 'OFFLINE' ? 'Disconnected' : 'Not Configured'}
                            </span>
                        </div>

                        <div className="panel-metrics-list">
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Installation ID:</span>
                                <span className="panel-metric-value" style={{ fontFamily: 'monospace', color: '#0284c7' }}>
                                    {statusData?.installationId || 'Not Configured'}
                                </span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Agent Version:</span>
                                <span className="panel-metric-value">{statusData?.agentVersion || '1.0.0'}</span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Local Health Endpoint:</span>
                                <span className="panel-metric-value" style={{ fontFamily: 'monospace' }}>http://localhost:4000/health</span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Process Memory:</span>
                                <span className="panel-metric-value">
                                    {statusData?.localHealth?.memoryMb ? `${statusData.localHealth.memoryMb} MB` : '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="panel-card-footer">
                        {statusData?.configured ? (
                            <div style={{ textAlign: 'center', fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>
                                ✓ Installation Paired & Active
                            </div>
                        ) : (
                            <button 
                                className="btn-primary" 
                                style={{ width: '100%', justifyContent: 'center' }} 
                                onClick={handleOpenPairingModal}
                            >
                                <FiLink2 /> Pair Local Agent
                            </button>
                        )}
                    </div>
                </div>

                {/* 3. CLOUD CONNECTION */}
                <div className="status-panel-card">
                    <div>
                        <div className="panel-card-header">
                            <div>
                                <div className="panel-card-title">Outbound Telemetry</div>
                                <h3 className="panel-card-heading">CLOUD CONNECTION</h3>
                            </div>
                            <span className={`status-pill ${
                                statusData?.cloudConnection === 'CONNECTED' ? 'connected' : 'disconnected'
                            }`}>
                                {statusData?.cloudConnection === 'CONNECTED' ? <FiCheckCircle /> : <FiAlertCircle />}
                                {statusData?.cloudConnection === 'CONNECTED' ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>

                        <div className="panel-metrics-list">
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Last Heartbeat:</span>
                                <span className="panel-metric-value" style={{ color: statusData?.cloudConnection === 'CONNECTED' ? '#16a34a' : '#dc2626' }}>
                                    {formatHeartbeatTime(statusData?.lastHeartbeat)}
                                </span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Heartbeat Cadence:</span>
                                <span className="panel-metric-value">Every 15 seconds</span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Transport Security:</span>
                                <span className="panel-metric-value">TLS / HTTPS (Outbound)</span>
                            </div>
                            <div className="panel-metric-item">
                                <span className="panel-metric-label">Reconnection Logic:</span>
                                <span className="panel-metric-value">Exponential Backoff (2s–30s)</span>
                            </div>
                        </div>
                    </div>

                    <div className="panel-card-footer">
                        <button 
                            className="btn-secondary" 
                            style={{ width: '100%', justifyContent: 'center' }} 
                            onClick={handleTestCloudConnection}
                            disabled={testingCloud}
                        >
                            <FiActivity className={testingCloud ? 'spin' : ''} /> {testingCloud ? 'Testing Cloud...' : 'Test Cloud Connection'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── SYNC STATUS & CONTROLS (PHASE 2) ────────────────────────── */}
            <div className="sync-status-card">
                <div className="sync-card-header">
                    <div>
                        <div className="sync-card-tag">PHASE 2: CLOUD → LOCAL SYNCHRONIZATION</div>
                        <h2 className="sync-card-title">Real-Time Data Replication Status</h2>
                        <div className="sync-card-desc">
                            Maintains a local synchronized replica of non-financial master and operational data on the hospital server.
                        </div>
                    </div>
                    <div className="sync-card-badges">
                        <span className="sync-mode-pill">
                            <FiCloud /> Cloud Primary
                        </span>
                        <span className="sync-mode-pill local">
                            <FiDatabase /> Local Replica
                        </span>
                    </div>
                </div>

                {/* 5 KPI Metric Items */}
                <div className="sync-kpi-grid">
                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Initial Sync</span>
                        <span className={`sync-status-badge ${
                            syncData?.initialSync?.status === 'COMPLETED' ? 'completed' :
                            syncData?.initialSync?.status === 'IN_PROGRESS' ? 'running' :
                            syncData?.initialSync?.status === 'FAILED' ? 'failed' : 'not-started'
                        }`}>
                            {syncData?.initialSync?.status === 'COMPLETED' ? <FiCheckCircle /> :
                             syncData?.initialSync?.status === 'IN_PROGRESS' ? <FiRefreshCw className="spin" /> :
                             syncData?.initialSync?.status === 'FAILED' ? <FiAlertCircle /> : <FiClock />}
                            {syncData?.initialSync?.status === 'COMPLETED' ? 'Completed' :
                             syncData?.initialSync?.status === 'IN_PROGRESS' ? `Running (${syncData?.initialSync?.progress?.overall?.percent || 0}%)` :
                             syncData?.initialSync?.status === 'FAILED' ? 'Failed' : 'Not Started'}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Last Sync</span>
                        <span className="sync-kpi-value" style={{ fontSize: '15px' }}>
                            {formatHeartbeatTime(syncData?.lastSyncAt)}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Pending Events</span>
                        <span className={`sync-kpi-value ${syncData?.pendingEvents > 0 ? 'text-amber' : ''}`}>
                            {syncData?.pendingEvents ?? 0}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Failed Events</span>
                        <span className={`sync-kpi-value ${syncData?.failedEvents > 0 ? 'text-rose' : ''}`}>
                            {syncData?.failedEvents ?? 0}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Records Synced</span>
                        <span className="sync-kpi-value text-emerald">
                            {(syncData?.recordsSynced || 0).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Initial Sync Progress Panel */}
                {syncData?.initialSync && (syncData.initialSync.status === 'IN_PROGRESS' || syncData.initialSync.status === 'COMPLETED') && (
                    <div className="sync-progress-section">
                        <div className="sync-progress-header">
                            <div>
                                <span className="sync-progress-title">Initial Synchronization Progress</span>
                                <span className="sync-progress-subtitle">
                                    Overall: {syncData.initialSync.progress?.overall?.synced || 0} / {syncData.initialSync.progress?.overall?.total || 0} records ({syncData.initialSync.progress?.overall?.percent || 0}%)
                                </span>
                            </div>
                            <span className="sync-progress-percent">{syncData.initialSync.progress?.overall?.percent || 0}%</span>
                        </div>

                        <div className="sync-overall-bar">
                            <div 
                                className="sync-overall-fill"
                                style={{ width: `${syncData.initialSync.progress?.overall?.percent || 0}%` }}
                            />
                        </div>

                        {/* Breakdown by entity */}
                        <div className="sync-entity-grid">
                            {['Patient', 'Doctor', 'Department', 'Service', 'Bed', 'Medicine'].map(entity => {
                                const prog = syncData.initialSync.progress?.[entity] || { total: 0, synced: 0 };
                                const pct = prog.total > 0 ? Math.min(100, Math.round((prog.synced / prog.total) * 100)) : (prog.synced > 0 ? 100 : 0);
                                return (
                                    <div key={entity} className="sync-entity-card">
                                        <div className="sync-entity-info">
                                            <span className="sync-entity-name">{entity}s</span>
                                            <span className="sync-entity-counts">{prog.synced} / {prog.total}</span>
                                        </div>
                                        <div className="sync-mini-bar">
                                            <div className="sync-mini-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Error Banner if any */}
                {syncData?.lastSyncError && (
                    <div className="sync-error-banner">
                        <FiAlertTriangle />
                        <div style={{ flex: 1 }}>
                            <strong>Sync Discrepancy / Error:</strong> {syncData.lastSyncError}
                        </div>
                        <button className="btn-secondary btn-sm" onClick={handleRetryFailed} disabled={retryingFailed}>
                            <FiRotateCcw className={retryingFailed ? 'spin' : ''} /> Retry
                        </button>
                    </div>
                )}

                {/* Manual Action Controls */}
                <div className="sync-actions-row">
                    <button 
                        className="btn-primary"
                        onClick={handleStartInitialSync}
                        disabled={startingInitialSync || syncData?.initialSync?.status === 'IN_PROGRESS' || !statusData?.configured}
                    >
                        <FiPlay className={startingInitialSync ? 'spin' : ''} /> 
                        {syncData?.initialSync?.status === 'IN_PROGRESS' ? 'Initial Sync Running...' : 'Start Initial Sync'}
                    </button>

                    <button 
                        className="btn-secondary"
                        onClick={handleSyncNow}
                        disabled={syncingNow || !statusData?.configured}
                    >
                        <FiRefreshCw className={syncingNow ? 'spin' : ''} /> 
                        {syncingNow ? 'Syncing...' : 'Sync Now'}
                    </button>

                    <button 
                        className="btn-secondary"
                        onClick={handleRetryFailed}
                        disabled={retryingFailed || (!syncData?.failedEvents && !syncData?.lastSyncError)}
                    >
                        <FiRotateCcw className={retryingFailed ? 'spin' : ''} /> 
                        {retryingFailed ? 'Retrying...' : 'Retry Failed Events'}
                    </button>

                    <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b' }}>
                        * Master cloud changes stream continuously to local queue.
                    </div>
                </div>
            </div>

            {/* ── PHASE 3 & 4: LOCAL → CLOUD SYNCHRONIZATION (OFFLINE QUEUE & RECOVERY) ── */}
            <div className="phase3-upload-card">
                <div className="sync-card-header">
                    <div>
                        <div className="sync-card-tag" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                            PHASE 3 & 4: OFFLINE QUEUE, RETRY & RECOVERY
                        </div>
                        <h2 className="sync-card-title">Offline Mutations Queue & Resilient Recovery</h2>
                        <div className="sync-card-desc">
                            Mutations executed locally while offline are persisted in the durable local outbox and stream automatically to the Cloud upon reconnection with controlled exponential backoff.
                        </div>
                    </div>
                    <div className="sync-card-badges">
                        <span className="sync-mode-pill local">
                            <FiDatabase /> Local Outbox
                        </span>
                        <span className="sync-mode-pill">
                            <FiCloud /> Cloud Primary
                        </span>
                    </div>
                </div>

                {/* Phase 4 Action Bar */}
                <div className="phase4-action-bar">
                    <button 
                        className="btn-primary"
                        onClick={handleSyncNow}
                        disabled={syncingNow || !statusData?.configured}
                    >
                        <FiRefreshCw className={syncingNow ? 'spin' : ''} /> 
                        {syncingNow ? 'Syncing Now...' : 'Sync Now'}
                    </button>

                    <button 
                        className="btn-secondary"
                        onClick={handleRetryFailed}
                        disabled={retryingFailed || (!uploadData?.uploadStatus?.failedUploadsCount && !syncData?.failedEvents)}
                    >
                        <FiRotateCcw className={retryingFailed ? 'spin' : ''} /> 
                        {retryingFailed ? 'Retrying...' : 'Retry Failed'}
                        {Boolean(uploadData?.uploadStatus?.failedUploadsCount > 0) && (
                            <span className="failed-badge-count">{uploadData.uploadStatus.failedUploadsCount}</span>
                        )}
                    </button>
                </div>

                {/* 6 KPI Metric Items for Phase 4 */}
                <div className="sync-kpi-grid">
                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Pending Uploads</span>
                        <span className={`sync-kpi-value ${uploadData?.uploadStatus?.pendingUploadsCount > 0 ? 'text-amber' : ''}`}>
                            {uploadData?.uploadStatus?.pendingUploadsCount ?? 0}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Syncing (In-Flight)</span>
                        <span className={`sync-kpi-value ${uploadData?.uploadStatus?.syncingUploadsCount > 0 ? 'text-sky' : ''}`}>
                            {uploadData?.uploadStatus?.syncingUploadsCount ?? 0}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Failed</span>
                        <span className={`sync-kpi-value ${uploadData?.uploadStatus?.failedUploadsCount > 0 ? 'text-rose' : ''}`}>
                            {uploadData?.uploadStatus?.failedUploadsCount ?? 0}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Conflicts</span>
                        <span className={`sync-kpi-value ${conflictsList.length > 0 ? 'text-amber' : ''}`}>
                            {conflictsList.length}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Completed Today</span>
                        <span className="sync-kpi-value text-emerald">
                            {((uploadData?.uploadStatus?.completedTodayCount !== undefined && uploadData?.uploadStatus?.completedTodayCount !== null)
                                ? uploadData.uploadStatus.completedTodayCount
                                : (uploadData?.uploadStatus?.completedUploadsCount ?? 0)).toLocaleString()}
                        </span>
                    </div>

                    <div className="sync-kpi-item">
                        <span className="sync-kpi-label">Last Successful Sync</span>
                        <span className="sync-kpi-value" style={{ fontSize: '14px' }}>
                            {formatHeartbeatTime(uploadData?.uploadStatus?.lastSuccessfulSyncAt || uploadData?.uploadStatus?.lastUploadAt)}
                        </span>
                    </div>
                </div>

                {/* Tab Navigation: Activity Stream vs Conflicts */}
                <div className="phase3-tab-nav">
                    <button 
                        className={`phase3-tab-btn ${activePhase3Tab === 'activity' ? 'active' : ''}`}
                        onClick={() => setActivePhase3Tab('activity')}
                    >
                        <FiList /> Recent Sync Activity ({uploadData?.recentActivities?.length || 0})
                    </button>
                    <button 
                        className={`phase3-tab-btn ${activePhase3Tab === 'conflicts' ? 'active' : ''}`}
                        onClick={() => setActivePhase3Tab('conflicts')}
                    >
                        <FiAlertTriangle /> Sync Conflicts ({conflictsList.length})
                    </button>
                </div>

                {/* Tab 1: Recent Activity Stream (Phase 4 Sync History) */}
                {activePhase3Tab === 'activity' && (
                    <div>
                        {(!uploadData?.recentActivities || uploadData.recentActivities.length === 0) ? (
                            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13.5px' }}>
                                No offline uploads recorded yet. Local changes will stream here when synchronized.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="sync-history-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Entity</th>
                                            <th>Operation</th>
                                            <th>Status</th>
                                            <th>Details / Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {uploadData.recentActivities.map((act, idx) => (
                                            <tr key={idx}>
                                                <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                                                    {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{act.entityType}</td>
                                                <td>
                                                    <span style={{ 
                                                        fontFamily: 'monospace', 
                                                        fontSize: '11px', 
                                                        padding: '2px 6px', 
                                                        background: '#f1f5f9', 
                                                        borderRadius: '4px' 
                                                    }}>
                                                        {act.operation}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={
                                                        act.status === 'SUCCESS' ? 'badge-status-completed' :
                                                        act.status === 'CONFLICT' ? 'badge-conflict-status' :
                                                        act.status === 'RETRYING' ? 'badge-status-inflight' :
                                                        'badge-status-failed'
                                                    }>
                                                        {act.status}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '12px', color: act.status === 'FAILED' ? '#b91c1c' : '#475569' }}>
                                                    {act.details || (act.status === 'SUCCESS' ? 'Synchronized successfully with Cloud' : '—')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 2: Sync Conflicts Table (Phase 5) */}
                {activePhase3Tab === 'conflicts' && (
                    <div className="conflicts-table-container">
                        {/* Conflict Filter & Search Toolbar */}
                        <div className="conflict-filters-header">
                            <div className="conflict-pill-group">
                                <button 
                                    className={`conflict-pill-btn ${conflictStatusFilter === 'PENDING' ? 'active' : ''}`}
                                    onClick={() => setConflictStatusFilter('PENDING')}
                                >
                                    Pending ({pendingConflictCount})
                                </button>
                                <button 
                                    className={`conflict-pill-btn ${conflictStatusFilter === 'RESOLVED' ? 'active' : ''}`}
                                    onClick={() => setConflictStatusFilter('RESOLVED')}
                                >
                                    Resolved
                                </button>
                                <button 
                                    className={`conflict-pill-btn ${conflictStatusFilter === 'ALL' ? 'active' : ''}`}
                                    onClick={() => setConflictStatusFilter('ALL')}
                                >
                                    All
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <select 
                                    value={conflictEntityFilter} 
                                    onChange={(e) => setConflictEntityFilter(e.target.value)}
                                    style={{
                                        padding: '7px 12px',
                                        fontSize: '13px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#fff',
                                        color: '#334155'
                                    }}
                                >
                                    <option value="ALL">All Entities</option>
                                    <option value="Patient">Patients</option>
                                    <option value="Doctor">Doctors</option>
                                    <option value="Department">Departments</option>
                                    <option value="Bed">Beds</option>
                                    <option value="Service">Services</option>
                                    <option value="Medicine">Medicines</option>
                                </select>

                                <div className="conflict-search-box">
                                    <FiSearch style={{ color: '#94a3b8' }} />
                                    <input 
                                        type="text" 
                                        placeholder="Search patient, MRN, ID..." 
                                        value={conflictSearchTerm}
                                        onChange={(e) => setConflictSearchTerm(e.target.value)}
                                    />
                                    {conflictSearchTerm && (
                                        <button 
                                            onClick={() => setConflictSearchTerm('')} 
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                        >
                                            <FiX size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Conflicts List Table */}
                        {conflictsList.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '36px', color: '#10b981', fontSize: '14px', background: '#f8fafc', borderRadius: '10px' }}>
                                <FiCheckCircle style={{ display: 'inline', marginRight: '6px', fontSize: '18px' }} />
                                Zero conflicts detected in this view. All local and cloud records are in sync.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="conflicts-table">
                                    <thead>
                                        <tr>
                                            <th>Entity</th>
                                            <th>Record Info / MRN</th>
                                            <th>Local Version</th>
                                            <th>Cloud Version</th>
                                            <th>Detected At</th>
                                            <th>Status</th>
                                            <th>Resolved By / At</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {conflictsList
                                            .filter(c => {
                                                if (conflictEntityFilter !== 'ALL' && c.entityType !== conflictEntityFilter) return false;
                                                if (conflictSearchTerm.trim()) {
                                                    const term = conflictSearchTerm.toLowerCase();
                                                    const name = (c.localPayload?.name || c.cloudPayload?.name || '').toLowerCase();
                                                    const mrnVal = (c.localPayload?.mrn || c.cloudPayload?.mrn || c.localPayload?.patientId || c.cloudPayload?.patientId || '').toLowerCase();
                                                    const idVal = String(c.entityId || '').toLowerCase();
                                                    const confVal = String(c.conflictId || '').toLowerCase();
                                                    return name.includes(term) || mrnVal.includes(term) || idVal.includes(term) || confVal.includes(term);
                                                }
                                                return true;
                                            })
                                            .map(c => {
                                                const patientName = c.localPayload?.name || c.cloudPayload?.name;
                                                const mrn = c.localPayload?.mrn || c.cloudPayload?.mrn || c.localPayload?.patientId || c.cloudPayload?.patientId;
                                                const isResolved = c.status === 'RESOLVED' || c.status.startsWith('RESOLVED_');

                                                return (
                                                    <tr key={c.conflictId}>
                                                        <td>
                                                            <span style={{ 
                                                                fontWeight: 600, 
                                                                fontSize: '12px',
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: c.entityType === 'Patient' ? '#e0f2fe' : '#f1f5f9',
                                                                color: c.entityType === 'Patient' ? '#0369a1' : '#334155'
                                                            }}>
                                                                {c.entityType}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                                                {patientName || (c.entityType + ' ' + c.entityId)}
                                                            </div>
                                                            {mrn && (
                                                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                                                    MRN: <span style={{ fontFamily: 'monospace', color: '#0284c7' }}>{mrn}</span>
                                                                </div>
                                                            )}
                                                            <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                                                {c.conflictId}
                                                            </div>
                                                        </td>
                                                        <td style={{ fontWeight: 600, color: '#0284c7' }}>
                                                            v{c.localVersion}
                                                        </td>
                                                        <td style={{ fontWeight: 600, color: '#059669' }}>
                                                            v{c.cloudVersion}
                                                        </td>
                                                        <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '12px' }}>
                                                            {new Date(c.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td>
                                                            {isResolved ? (
                                                                <span className="badge-status-completed">
                                                                    <FiCheckCircle /> Resolved {c.resolutionType ? `(${c.resolutionType.replace('_', ' ')})` : ''}
                                                                </span>
                                                            ) : c.status === 'DISMISSED' ? (
                                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', background: '#f1f5f9', color: '#475569' }}>
                                                                    Dismissed
                                                                </span>
                                                            ) : c.status === 'MANUAL_REVIEW_REQUIRED' ? (
                                                                <span className="badge-status-failed">
                                                                    <FiShield /> Manual Review
                                                                </span>
                                                            ) : (
                                                                <span className="badge-conflict-status">
                                                                    <FiAlertTriangle /> Pending Review
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                            {c.resolvedAt ? (
                                                                <div>
                                                                    {new Date(c.resolvedAt).toLocaleDateString()} {new Date(c.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            ) : '—'}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <button 
                                                                className="btn-secondary btn-sm"
                                                                onClick={() => openConflictModal(c)}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                                            >
                                                                <FiGitMerge size={13} /> View Conflict
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Operational Event Logs Table */}
            <div className="logs-card">
                <div className="logs-header">
                    <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a' }}>
                            Operational Audit Log
                        </h3>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                            Real-time system events, connectivity status shifts, and local health logs.
                        </div>
                    </div>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Showing last 20 events</span>
                </div>

                {(!statusData?.operationalLogs || statusData.operationalLogs.length === 0) ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                        No operational logs recorded yet. Once the Local Agent is started, events will stream here.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="logs-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Level</th>
                                    <th>Event</th>
                                    <th>Operational Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statusData.operationalLogs.map((log, idx) => (
                                    <tr key={idx}>
                                        <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td>
                                            <span className={`log-level-badge ${log.level}`}>
                                                {log.level}
                                            </span>
                                        </td>
                                        <td><strong>{log.event}</strong></td>
                                        <td>{log.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pairing Modal */}
            {showPairModal && provisionData && (
                <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
                    <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-bar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dbeafe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FiLink2 size={18} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>Pair Local Agent</h3>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Installation: {provisionData.installationId}</span>
                                </div>
                            </div>
                            <button onClick={() => setShowPairModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                <FiX size={20} />
                            </button>
                        </div>

                        <div className="modal-body-area">
                            <p style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
                                Use this pairing token to authenticate the hospital's local server with Medical365 Cloud. The token expires in 30 minutes.
                            </p>

                            <div className="pairing-token-banner">
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                                    One-Time Pairing Token
                                </span>
                                <div className="pairing-code-display">{provisionData.pairingToken}</div>
                                <button 
                                    className="btn-secondary" 
                                    style={{ margin: '0 auto', fontSize: '12px' }}
                                    onClick={() => {
                                        navigator.clipboard.writeText(provisionData.pairingToken);
                                        setCopiedToken(true);
                                        toast.success('Pairing token copied to clipboard!');
                                        setTimeout(() => setCopiedToken(false), 2000);
                                    }}
                                >
                                    {copiedToken ? <FiCheck style={{ color: '#16a34a' }} /> : <FiCopy />}
                                    {copiedToken ? 'Copied' : 'Copy Token'}
                                </button>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                        Step 1: Paste into <code>local-agent/config.json</code>
                                    </span>
                                    <button 
                                        style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => {
                                            navigator.clipboard.writeText(configSnippet);
                                            setCopiedSnippet(true);
                                            toast.success('Configuration snippet copied!');
                                            setTimeout(() => setCopiedSnippet(false), 2000);
                                        }}
                                    >
                                        {copiedSnippet ? <FiCheck /> : <FiCopy />} Copy JSON
                                    </button>
                                </div>
                                <pre className="code-snippet">{configSnippet}</pre>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                    Step 2: Run Agent on Hospital Server
                                </span>
                                <pre className="code-snippet" style={{ margin: '6px 0 0 0' }}>
                                    cd local-agent && npm start
                                </pre>
                            </div>
                        </div>

                        <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn-primary" onClick={() => { setShowPairModal(false); loadStatus(); }}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Conflict Detail Modal (Phase 5) */}
            {showConflictModal && selectedConflict && (
                <div className="modal-overlay" onClick={() => !resolvingConflict && setShowConflictModal(false)}>
                    <div className="modal-card" style={{ maxWidth: '960px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FiGitMerge style={{ color: '#0284c7' }} /> Conflict Details
                                </h3>
                                <p className="modal-desc" style={{ margin: '2px 0 0 0' }}>
                                    Conflict ID: <code style={{ color: '#0284c7', fontWeight: 600 }}>{selectedConflict.conflictId}</code>
                                </p>
                            </div>
                            <button 
                                className="modal-close-btn" 
                                disabled={resolvingConflict}
                                onClick={() => setShowConflictModal(false)}
                            >
                                <FiX />
                            </button>
                        </div>

                        {/* Metadata Strip */}
                        <div className="conflict-meta-banner">
                            <div className="conflict-meta-item">
                                <span className="conflict-meta-label">Entity</span>
                                <span className="conflict-meta-value">{selectedConflict.entityType}</span>
                            </div>
                            {selectedConflict.entityType === 'Patient' && (
                                <>
                                    <div className="conflict-meta-item">
                                        <span className="conflict-meta-label">Patient Name</span>
                                        <span className="conflict-meta-value">
                                            {conflictDetailData?.patientName || selectedConflict.localPayload?.name || selectedConflict.cloudPayload?.name || '—'}
                                        </span>
                                    </div>
                                    <div className="conflict-meta-item">
                                        <span className="conflict-meta-label">MRN</span>
                                        <span className="conflict-meta-value" style={{ fontFamily: 'monospace', color: '#0284c7' }}>
                                            {conflictDetailData?.mrn || selectedConflict.localPayload?.mrn || selectedConflict.cloudPayload?.mrn || selectedConflict.localPayload?.patientId || selectedConflict.cloudPayload?.patientId || '—'}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="conflict-meta-item">
                                <span className="conflict-meta-label">Base Version</span>
                                <span className="conflict-meta-value" style={{ color: '#64748b' }}>
                                    v{selectedConflict.baseVersion ?? 0}
                                </span>
                            </div>
                            <div className="conflict-meta-item">
                                <span className="conflict-meta-label">Local Version</span>
                                <span className="conflict-meta-value" style={{ color: '#0284c7' }}>
                                    v{selectedConflict.localVersion}
                                </span>
                            </div>
                            <div className="conflict-meta-item">
                                <span className="conflict-meta-label">Cloud Version</span>
                                <span className="conflict-meta-value" style={{ color: '#059669' }}>
                                    v{selectedConflict.cloudVersion}
                                </span>
                            </div>
                            <div className="conflict-meta-item">
                                <span className="conflict-meta-label">Status</span>
                                <span className="conflict-meta-value">
                                    {selectedConflict.status}
                                </span>
                            </div>
                        </div>

                        {/* Stale Conflict Banner if Cloud Changed */}
                        {conflictDetailData?.isStale && (
                            <div className="stale-warning-box">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FiAlertTriangle size={18} />
                                    <span>
                                        <strong>Conflict has changed since it was detected.</strong> Current Cloud document is at version <strong>v{conflictDetailData.currentCloudVersion}</strong>. Please review latest cloud payload before resolving.
                                    </span>
                                </div>
                                <button 
                                    className="btn-secondary btn-sm"
                                    onClick={() => openConflictModal(selectedConflict)}
                                >
                                    <FiRefreshCw /> Refresh Latest
                                </button>
                            </div>
                        )}

                        {/* View Mode Tabs */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px 0' }}>
                            <div className="conflict-pill-group">
                                <button 
                                    className={`conflict-pill-btn ${viewMode === 'diff' ? 'active' : ''}`}
                                    onClick={() => setViewMode('diff')}
                                >
                                    Field-by-Field Comparison
                                </button>
                                <button 
                                    className={`conflict-pill-btn ${viewMode === 'json' ? 'active' : ''}`}
                                    onClick={() => setViewMode('json')}
                                >
                                    Raw JSON Payloads
                                </button>
                            </div>

                            {selectedConflict.status === 'RESOLVED' && (
                                <span className="badge-status-completed">
                                    <FiCheckCircle /> Resolved via {selectedConflict.resolutionType}
                                </span>
                            )}
                        </div>

                        {/* Body Area */}
                        {conflictDetailLoading ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                <FiRefreshCw className="spin" style={{ fontSize: '24px', marginBottom: '8px', display: 'inline-block' }} />
                                <div>Loading structured conflict diff...</div>
                            </div>
                        ) : viewMode === 'diff' ? (
                            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                                <table className="conflict-diff-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '22%' }}>Field</th>
                                            <th style={{ width: '30%' }}>
                                                Local Version (v{selectedConflict.localVersion})
                                            </th>
                                            <th style={{ width: '30%' }}>
                                                Cloud Version (v{selectedConflict.cloudVersion})
                                            </th>
                                            <th style={{ width: '18%', textAlign: 'center' }}>
                                                Merge Selection
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {conflictDetailData?.diff?.map((row) => {
                                            const formatVal = (v) => {
                                                if (v === null || v === undefined) return <span style={{ color: '#94a3b8' }}>null</span>;
                                                if (typeof v === 'object') return <span style={{ fontFamily: 'monospace', fontSize: '11.5px' }}>{JSON.stringify(v)}</span>;
                                                return String(v);
                                            };

                                            const isSelected = mergeFieldSelections[row.field];

                                            return (
                                                <tr key={row.field} className={row.isDifferent ? 'diff-row-changed' : ''}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.field}</div>
                                                        {row.isDifferent && (
                                                            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                                                DIFFERENCE
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={`diff-val-badge ${row.isDifferent ? 'diff-val-local' : ''}`}>
                                                            {formatVal(row.localValue)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`diff-val-badge ${row.isDifferent ? 'diff-val-cloud' : ''}`}>
                                                            {formatVal(row.cloudValue)}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {row.isProhibited ? (
                                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                                Protected
                                                            </span>
                                                        ) : !row.isDifferent ? (
                                                            <span style={{ fontSize: '11px', color: '#10b981' }}>
                                                                Identical
                                                            </span>
                                                        ) : (
                                                            <div className="merge-choice-cell" style={{ justifyContent: 'center' }}>
                                                                <label className="merge-choice-label">
                                                                    <input 
                                                                        type="radio" 
                                                                        name={`merge_${row.field}`}
                                                                        checked={isSelected === 'LOCAL'}
                                                                        onChange={() => setMergeFieldSelections(prev => ({ ...prev, [row.field]: 'LOCAL' }))}
                                                                        disabled={selectedConflict.status === 'RESOLVED' || resolvingConflict}
                                                                    />
                                                                    Local
                                                                </label>
                                                                <label className="merge-choice-label">
                                                                    <input 
                                                                        type="radio" 
                                                                        name={`merge_${row.field}`}
                                                                        checked={isSelected === 'CLOUD' || !isSelected}
                                                                        onChange={() => setMergeFieldSelections(prev => ({ ...prev, [row.field]: 'CLOUD' }))}
                                                                        disabled={selectedConflict.status === 'RESOLVED' || resolvingConflict}
                                                                    />
                                                                    Cloud
                                                                </label>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="diff-container" style={{ margin: '10px 0' }}>
                                <div className="diff-col">
                                    <div className="diff-col-title">
                                        <FiDatabase style={{ color: '#0284c7' }} />
                                        Local Payload (Version: {selectedConflict.localVersion})
                                    </div>
                                    <pre className="diff-pre">
                                        {JSON.stringify(selectedConflict.localPayload, null, 2)}
                                    </pre>
                                </div>
                                <div className="diff-col">
                                    <div className="diff-col-title">
                                        <FiCloud style={{ color: '#10b981' }} />
                                        Cloud Primary Payload (Version: {selectedConflict.cloudVersion})
                                    </div>
                                    <pre className="diff-pre">
                                        {JSON.stringify(selectedConflict.cloudPayload, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}

                        {/* Audit / Resolution Notes Input */}
                        {selectedConflict.status !== 'RESOLVED' && (
                            <div style={{ marginTop: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                    Resolution Notes (Saved to Audit Log)
                                </label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Verified with patient by phone, accepted updated address"
                                    value={resolutionNotes}
                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '13px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                    disabled={resolvingConflict}
                                />
                            </div>
                        )}

                        {/* Resolution Action Bar */}
                        <div className="resolution-action-bar">
                            {selectedConflict.status !== 'RESOLVED' ? (
                                <>
                                    <button 
                                        className="btn-dismiss"
                                        onClick={handleDismissConflict}
                                        disabled={resolvingConflict}
                                    >
                                        Dismiss Conflict
                                    </button>

                                    <div className="resolution-btn-group">
                                        <button 
                                            className="btn-keep-local"
                                            onClick={() => handleResolveConflict('KEEP_LOCAL')}
                                            disabled={resolvingConflict || conflictDetailData?.isStale}
                                            title="Accept local data and push as authoritative cloud version"
                                        >
                                            <FiDatabase /> Keep Local
                                        </button>

                                        <button 
                                            className="btn-keep-cloud"
                                            onClick={() => handleResolveConflict('KEEP_CLOUD')}
                                            disabled={resolvingConflict || conflictDetailData?.isStale}
                                            title="Retain current cloud data and broadcast to local"
                                        >
                                            <FiCloud /> Keep Cloud
                                        </button>

                                        <button 
                                            className="btn-merge"
                                            onClick={() => handleResolveConflict('MERGED')}
                                            disabled={resolvingConflict || conflictDetailData?.isStale}
                                            title="Apply selected merge fields as authoritative cloud version"
                                        >
                                            <FiGitMerge /> Apply Merged Version
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                                    <button className="btn-secondary" onClick={() => setShowConflictModal(false)}>
                                        Close
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── PHASE 6: BACKUP & RECOVERY ────────────────────────────── */}
            <div className="phase6-section">
                <div className="sync-card-header">
                    <div>
                        <div className="sync-card-tag" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                            PHASE 6: PRODUCTION READINESS
                        </div>
                        <h2 className="sync-card-title">Backup, Recovery & Data Integrity</h2>
                        <div className="sync-card-desc">
                            Verify data integrity, manage local database backups, and safely rebuild the local database from cloud when needed.
                        </div>
                    </div>
                </div>

                {/* Data Integrity Verification */}
                <div className="phase6-panel">
                    <div className="phase6-panel-header">
                        <div>
                            <h3 className="phase6-panel-title"><FiShield style={{ color: '#0284c7' }} /> Data Integrity Verification</h3>
                            <p className="phase6-panel-desc">Run a read-only audit comparing cloud records, sync events, conflicts, and installation health. No data is modified.</p>
                        </div>
                        <button
                            className="btn-primary"
                            onClick={handleVerifyIntegrity}
                            disabled={verifyingIntegrity}
                        >
                            <FiActivity className={verifyingIntegrity ? 'spin' : ''} />
                            {verifyingIntegrity ? 'Verifying...' : 'Run Integrity Check'}
                        </button>
                    </div>

                    {integrityReport && (
                        <div className="integrity-report">
                            <div className="integrity-header">
                                <span className={`integrity-status-badge ${integrityReport.status.toLowerCase()}`}>
                                    {integrityReport.status === 'HEALTHY' ? <FiCheckCircle /> :
                                     integrityReport.status === 'WARNINGS' ? <FiAlertTriangle /> : <FiAlertCircle />}
                                    {integrityReport.status}
                                </span>
                                <span className="integrity-meta">
                                    Checked at {new Date(integrityReport.timestamp).toLocaleTimeString()} · {integrityReport.durationMs}ms
                                </span>
                            </div>

                            <div className="integrity-summary-grid">
                                <div className="integrity-stat">
                                    <span className="integrity-stat-value">{integrityReport.summary.totalCloudRecords}</span>
                                    <span className="integrity-stat-label">Cloud Records</span>
                                </div>
                                <div className="integrity-stat">
                                    <span className="integrity-stat-value">{integrityReport.summary.pendingSyncEvents}</span>
                                    <span className="integrity-stat-label">Pending Events</span>
                                </div>
                                <div className="integrity-stat">
                                    <span className={`integrity-stat-value ${integrityReport.summary.failedSyncEvents > 0 ? 'text-rose' : ''}`}>
                                        {integrityReport.summary.failedSyncEvents}
                                    </span>
                                    <span className="integrity-stat-label">Failed Events</span>
                                </div>
                                <div className="integrity-stat">
                                    <span className={`integrity-stat-value ${integrityReport.summary.unresolvedConflicts > 0 ? 'text-amber' : ''}`}>
                                        {integrityReport.summary.unresolvedConflicts}
                                    </span>
                                    <span className="integrity-stat-label">Unresolved Conflicts</span>
                                </div>
                            </div>

                            {/* Entity Breakdown */}
                            {integrityReport.entities && Object.keys(integrityReport.entities).length > 0 && (
                                <div className="integrity-entities">
                                    <div className="integrity-entities-title">Cloud Entity Records</div>
                                    <div className="integrity-entity-grid">
                                        {Object.entries(integrityReport.entities).map(([entity, info]) => (
                                            <div key={entity} className={`integrity-entity-item ${info.status === 'ERROR' ? 'error' : ''}`}>
                                                <span className="integrity-entity-name">{entity}</span>
                                                <span className="integrity-entity-count">{info.cloudCount}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Issues */}
                            {integrityReport.summary.issues.length > 0 && (
                                <div className="integrity-issues">
                                    <div className="integrity-issues-title">Issues Detected</div>
                                    {integrityReport.summary.issues.map((issue, idx) => (
                                        <div key={idx} className={`integrity-issue-item ${issue.severity.toLowerCase()}`}>
                                            {issue.severity === 'ERROR' ? <FiAlertCircle /> : <FiAlertTriangle />}
                                            <span className="integrity-issue-category">[{issue.category}]</span>
                                            <span>{issue.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Backup Status */}
                <div className="phase6-panel">
                    <div className="phase6-panel-header">
                        <div>
                            <h3 className="phase6-panel-title"><FiArchive style={{ color: '#059669' }} /> Backup & Restore</h3>
                            <p className="phase6-panel-desc">
                                {backupStatus?.backupStrategy || 'Automated Docker mongodump backup (nightly at 2:00 AM, 7-day retention).'}
                            </p>
                        </div>
                    </div>

                    {backupStatus?.lastKnownBackup && (
                        <div className="backup-info-row">
                            <span className="backup-info-label">Last Backup:</span>
                            <span className="backup-info-value">
                                {new Date(backupStatus.lastKnownBackup.timestamp).toLocaleString()} — {backupStatus.lastKnownBackup.status}
                            </span>
                        </div>
                    )}

                    {backupStatus?.restoreInstructions && (
                        <div className="restore-instructions">
                            <div className="restore-instructions-title">Restore Procedure</div>
                            <ol className="restore-steps">
                                {backupStatus.restoreInstructions.map((step, idx) => (
                                    <li key={idx} className={step.startsWith('WARNING') ? 'warning-step' : ''}>{step}</li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {backupStatus?.rebuildHistory && backupStatus.rebuildHistory.length > 0 && (
                        <div className="rebuild-history">
                            <div className="rebuild-history-title">Rebuild History</div>
                            <div className="rebuild-history-list">
                                {backupStatus.rebuildHistory.map((entry, idx) => (
                                    <div key={idx} className="rebuild-history-item">
                                        <span className="rebuild-history-date">
                                            {new Date(entry.archivedAt).toLocaleDateString()} {new Date(entry.archivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="rebuild-history-by">by {entry.triggeredBy}</span>
                                        <span className="rebuild-history-records">{entry.previousTotalSynced} records archived</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Rebuild Local Database */}
                <div className="phase6-panel danger-panel">
                    <div className="phase6-panel-header">
                        <div>
                            <h3 className="phase6-panel-title"><FiDownloadCloud style={{ color: '#dc2626' }} /> Rebuild Local Database</h3>
                            <p className="phase6-panel-desc">
                                Safely reset local sync state and re-download all data from cloud. Cloud data will NOT be deleted or modified.
                                Use only when the local database is corrupted, after a restore, or when instructed by support.
                            </p>
                        </div>
                        <button
                            className="btn-danger"
                            onClick={() => { loadRebuildStatus(); setShowRebuildModal(true); setRebuildConfirmText(''); }}
                            disabled={!statusData?.configured}
                        >
                            <FiTrash2 /> Rebuild Local Database
                        </button>
                    </div>

                    <div className="danger-warning">
                        <FiAlertTriangle />
                        <span>This action will archive the current sync state, dismiss pending conflicts, and restart initial sync from cloud. It requires the Local Agent to be running.</span>
                    </div>
                </div>
            </div>

            {/* ── REBUILD CONFIRMATION MODAL ──────────────────────────────── */}
            {showRebuildModal && (
                <div className="conflict-modal-overlay" onClick={() => setShowRebuildModal(false)}>
                    <div className="conflict-modal-content rebuild-modal" onClick={e => e.stopPropagation()}>
                        <div className="conflict-modal-header" style={{ borderBottom: '3px solid #dc2626' }}>
                            <h2><FiAlertTriangle style={{ color: '#dc2626' }} /> Rebuild Local Database</h2>
                            <button className="conflict-close-btn" onClick={() => setShowRebuildModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="rebuild-modal-body">
                            <div className="rebuild-warning-box">
                                <FiAlertTriangle className="rebuild-warning-icon" />
                                <div>
                                    <strong>This is a destructive operation on local data.</strong>
                                    <p>Cloud data will NOT be deleted. This action will:</p>
                                    <ul>
                                        <li>Archive the current local sync state</li>
                                        <li>Dismiss all pending sync conflicts</li>
                                        <li>Reset all sync checkpoints and counters</li>
                                        <li>Re-run initial sync to rebuild local database from cloud</li>
                                    </ul>
                                </div>
                            </div>

                            {rebuildStatus && (
                                <div className="rebuild-status-info">
                                    <div className="rebuild-stat-row">
                                        <span>Installation:</span>
                                        <span className="mono">{rebuildStatus.installationId || 'N/A'}</span>
                                    </div>
                                    <div className="rebuild-stat-row">
                                        <span>Current Status:</span>
                                        <span>{rebuildStatus.currentStatus || 'N/A'}</span>
                                    </div>
                                    <div className="rebuild-stat-row">
                                        <span>Records Currently Synced:</span>
                                        <span>{rebuildStatus.totalRecordsSynced || 0}</span>
                                    </div>
                                    {rebuildStatus.pendingConflictsCount > 0 && (
                                        <div className="rebuild-stat-row warning">
                                            <span>Pending Conflicts to Dismiss:</span>
                                            <span>{rebuildStatus.pendingConflictsCount}</span>
                                        </div>
                                    )}
                                    {rebuildStatus.warnings && rebuildStatus.warnings.length > 0 && (
                                        <div className="rebuild-warnings-list">
                                            {rebuildStatus.warnings.map((w, i) => (
                                                <div key={i} className="rebuild-warning-item">
                                                    <FiInfo /> {w}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="rebuild-confirm-input">
                                <label>Type <strong>REBUILD</strong> to confirm:</label>
                                <input
                                    type="text"
                                    value={rebuildConfirmText}
                                    onChange={(e) => setRebuildConfirmText(e.target.value)}
                                    placeholder="REBUILD"
                                    autoFocus
                                />
                            </div>

                            <div className="rebuild-action-row">
                                <button className="btn-secondary" onClick={() => setShowRebuildModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn-danger"
                                    onClick={handleRebuildLocalDatabase}
                                    disabled={rebuildingDb || rebuildConfirmText !== 'REBUILD'}
                                >
                                    <FiDownloadCloud className={rebuildingDb ? 'spin' : ''} />
                                    {rebuildingDb ? 'Rebuilding...' : 'Confirm Rebuild'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

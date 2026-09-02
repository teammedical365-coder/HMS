import React, { useState, useEffect, useRef } from 'react';
import { 
    FiSearch, FiUser, FiFileText, FiImage, FiPaperclip, FiMic, 
    FiSend, FiRefreshCw, FiTrendingUp, FiTrendingDown, FiAlertCircle, 
    FiDownload, FiPrinter, FiMaximize2, FiZoomIn, FiZoomOut, 
    FiRotateCw, FiMoreVertical, FiFilter, FiBell, FiChevronDown, 
    FiPlus, FiInfo, FiTrash2, FiActivity, FiUsers, FiCalendar, 
    FiDollarSign, FiClock, FiCheck, FiHeadphones, FiX, FiAlertTriangle,
    FiCheckCircle, FiThumbsUp, FiThumbsDown, FiChevronUp, FiEye, FiExternalLink
} from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { reportAPI, patientAPI, doctorAPI, aiWalletAPI } from '../../utils/api';
import socket from '../../utils/socket';
import AIResponseRenderer from '../../components/AIResponseRenderer';
import './AIAssistant.css';

// ── Currency & Status Helpers ──
const formatINR = (amount) => {
    const num = Number(amount) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getWalletStatusInfo = (status) => {
    switch (status) {
        case 'LOW':           return { label: 'Low Balance', color: '#f59e0b', bgColor: '#fef3c7', icon: '⚠️' };
        case 'CRITICAL':      return { label: 'Critical', color: '#f97316', bgColor: '#ffedd5', icon: '🔶' };
        case 'VERY_CRITICAL': return { label: 'Very Low', color: '#ef4444', bgColor: '#fee2e2', icon: '🔴' };
        case 'EXHAUSTED':     return { label: 'Exhausted', color: '#dc2626', bgColor: '#fecaca', icon: '🚫' };
        default:              return { label: 'Active', color: '#16a34a', bgColor: '#dcfce7', icon: '✅' };
    }
};

// Helper: detect MIME types
const isImageMime = (mime, url = '') => {
    if (mime && mime.startsWith('image/')) return true;
    if (url && (url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.png') || url.endsWith('.webp'))) return true;
    return false;
};

const isPdfMime = (mime, url = '') => {
    if (mime === 'application/pdf') return true;
    if (url && url.endsWith('.pdf')) return true;
    return false;
};

const AIAssistant = () => {
    // ── Patient State ──
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [allPatients, setAllPatients] = useState([]);
    const [isFetchingPatients, setIsFetchingPatients] = useState(true);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [showPatientDetails, setShowPatientDetails] = useState(false);

    // ── Reports State ──
    const [reports, setReports] = useState([]);
    const [reportFilterQuery, setReportFilterQuery] = useState('');
    const [selectedReport, setSelectedReport] = useState(null);
    const [isReportsLoading, setIsReportsLoading] = useState(false);
    const [isReportSearchOpen, setIsReportSearchOpen] = useState(false);

    // ── Document Preview Modal State ──
    const [previewDoc, setPreviewDoc] = useState(null);

    // ── AI Summary State ──
    const [summary, setSummary] = useState(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState(null);

    // ── Inside Report Search State ──
    const [insideSearchQuery, setInsideSearchQuery] = useState('');
    const [insideSearchResults, setInsideSearchResults] = useState([]);
    const [isSearchingInside, setIsSearchingInside] = useState(false);
    const [insideSearchMessage, setInsideSearchMessage] = useState(null);

    // ── Compare Reports State ──
    const [compareReport1, setCompareReport1] = useState('');
    const [compareReport2, setCompareReport2] = useState('');
    const [comparisonResult, setComparisonResult] = useState(null);
    const [isComparing, setIsComparing] = useState(false);
    const [compareError, setCompareError] = useState(null);

    // ── AI Wallet & Credit State ──
    const [wallet, setWallet] = useState(null);
    const [isWalletOpen, setIsWalletOpen] = useState(false);
    const [walletLogs, setWalletLogs] = useState([]);
    const [isWalletLoading, setIsWalletLoading] = useState(false);

    // ── Chat State ──
    const [chatMessages, setChatMessages] = useState([
        {
            role: 'ai',
            text: "Hello! I'm your AI Assistant.\nYou can ask me anything about this patient's reports, labs, medications or health trends.\nHow can I help you today?",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    // Fetch initial data
    useEffect(() => {
        fetchWalletData();
        fetchDoctorPatients();
    }, []);

    // Scroll chat to bottom
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, isChatLoading]);

    // ── Socket.IO: Real-time AI Wallet sync across all hospital doctors ──
    useEffect(() => {
        let hospitalId = null;
        try {
            const authStr = localStorage.getItem('user') || localStorage.getItem('authUser');
            if (authStr) {
                const authData = JSON.parse(authStr);
                hospitalId = authData.hospitalId || authData.user?.hospitalId;
            }
        } catch (e) { /* ignore */ }

        if (!hospitalId) return;

        if (!socket.connected) socket.connect();
        socket.emit('joinHospitalRoom', hospitalId);

        const handleWalletUpdate = (data) => {
            if (data && data.hospitalId === hospitalId) {
                setWallet(prev => ({
                    ...prev,
                    remainingAmount: data.remainingAmount,
                    usedAmount: data.usedAmount,
                    budgetAmount: data.budgetAmount,
                    status: data.status || data.warningLevel,
                    warningLevel: data.warningLevel,
                    warningMessage: data.warningMessage
                }));
            }
        };

        socket.on('AI_WALLET_UPDATED', handleWalletUpdate);

        return () => {
            socket.off('AI_WALLET_UPDATED', handleWalletUpdate);
        };
    }, []);

    const fetchWalletData = async () => {
        try {
            const res = await aiWalletAPI.getWallet();
            if (res && res.success && res.wallet) {
                setWallet(res.wallet);
            }
        } catch (err) {
            console.error("Error fetching AI wallet:", err);
        }
    };

    const fetchWalletModalData = async () => {
        setIsWalletLoading(true);
        try {
            const [walletRes, historyRes] = await Promise.all([
                aiWalletAPI.getWallet(),
                aiWalletAPI.getUsageHistory(30)
            ]);
            if (walletRes && walletRes.success && walletRes.wallet) setWallet(walletRes.wallet);
            if (historyRes && historyRes.success) setWalletLogs(historyRes.logs || []);
        } catch (err) {
            console.error("Error fetching AI wallet analytics:", err);
        } finally {
            setIsWalletLoading(false);
        }
    };

    const fetchDoctorPatients = async () => {
        setIsFetchingPatients(true);
        try {
            const res = await doctorAPI.getPatients();
            if (res && res.success && Array.isArray(res.patients) && res.patients.length > 0) {
                setAllPatients(res.patients);
                const p = res.patients[0];
                const patientObj = {
                    _id: p._id,
                    name: p.name || 'Patient',
                    status: 'Active',
                    profile: {
                        mrn: p.profile?.mrn || p.patientId || p.mrn || 'CIT-' + String(p._id).slice(-4),
                        gender: p.profile?.gender || p.gender || 'Not specified',
                        age: p.profile?.age || p.age || '--',
                        phone: p.phone || p.mobile || 'Not available'
                    }
                };
                setSelectedPatient(patientObj);
                loadPatientDocuments(p._id);
            } else {
                setAllPatients([]);
                setSelectedPatient(null);
                setReports([]);
            }
        } catch (err) {
            console.error("Error fetching patients:", err);
            setAllPatients([]);
        } finally {
            setIsFetchingPatients(false);
        }
    };

    const isReportSelected = (r) => {
        if (!selectedReport || !r) return false;
        if (selectedReport._id && r._id) return String(selectedReport._id) === String(r._id);
        if (selectedReport.url && r.url) return selectedReport.url === r.url;
        if (selectedReport.fileUrl && r.fileUrl) return selectedReport.fileUrl === r.fileUrl;
        if (selectedReport.fileName && r.fileName) return selectedReport.fileName === r.fileName;
        if (selectedReport.name && r.name) return selectedReport.name === r.name;
        return false;
    };

    const loadPatientDocuments = async (patientId) => {
        setIsReportsLoading(true);
        setSummary(null);
        setSelectedReport(null); // Do not auto-select any report
        setInsideSearchResults([]);
        setInsideSearchMessage(null);
        setComparisonResult(null);

        try {
            const res = await patientAPI.getDocuments(patientId);
            if (res && res.success && Array.isArray(res.documents) && res.documents.length > 0) {
                setReports(res.documents);
                setSelectedReport(null); // Wait for explicit doctor selection
                if (res.documents.length >= 2) {
                    setCompareReport1(res.documents[0].url || res.documents[0]._id || '');
                    setCompareReport2(res.documents[1].url || res.documents[1]._id || '');
                } else if (res.documents.length === 1) {
                    setCompareReport1(res.documents[0].url || res.documents[0]._id || '');
                    setCompareReport2(res.documents[0].url || res.documents[0]._id || '');
                }
            } else {
                setReports([]);
                setSelectedReport(null);
                setCompareReport1('');
                setCompareReport2('');
            }
        } catch (err) {
            console.warn("Error loading patient documents:", err?.message);
            setReports([]);
            setSelectedReport(null);
        } finally {
            setIsReportsLoading(false);
        }
    };

    // Patient autocomplete search
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 1) {
            setSearchResults([]);
            return;
        }
        const q = searchQuery.toLowerCase().trim();
        const filtered = allPatients.filter(p => {
            const nameMatch = p.name && p.name.toLowerCase().includes(q);
            const mrnMatch = (p.profile?.mrn || p.patientId || '').toLowerCase().includes(q);
            const phoneMatch = p.phone && String(p.phone).includes(q);
            return nameMatch || mrnMatch || phoneMatch;
        });
        setSearchResults(filtered);
    }, [searchQuery, allPatients]);

    const handleSelectPatient = (p) => {
        const patientObj = {
            _id: p._id,
            name: p.name || 'Patient',
            status: 'Active',
            profile: {
                mrn: p.profile?.mrn || p.patientId || p.mrn || 'CIT-' + String(p._id).slice(-4),
                gender: p.profile?.gender || p.gender || 'Not specified',
                age: p.profile?.age || p.age || '--',
                phone: p.phone || p.mobile || 'Not available'
            }
        };
        setSelectedPatient(patientObj);
        setSearchQuery('');
        setSearchResults([]);
        setSummary(null);
        loadPatientDocuments(p._id);
    };

    // Generate Summary handler
    const handleGenerateSummary = async () => {
        if (!selectedReport || isExhausted) return;
        setIsSummaryLoading(true);
        setSummaryError(null);

        try {
            const fileUrl = selectedReport.url || selectedReport.fileUrl;
            const mimeType = selectedReport.mimeType || 'application/pdf';
            const fileName = selectedReport.fileName || selectedReport.name || 'Medical Report';

            if (!fileUrl) {
                throw new Error("Selected report does not have a valid file URL.");
            }

            const res = await reportAPI.generateAISummary(fileUrl, mimeType, fileName);
            if (res && res.success && res.summary) {
                const s = res.summary;
                if (typeof s === 'string') {
                    setSummary(s);
                } else {
                    let formatted = `### 📋 ${s.ReportType || s.ContentType || 'Clinical Report Summary'}\n\n`;
                    if (s.OverallSummary) formatted += `**Summary:** ${s.OverallSummary}\n\n`;
                    if (Array.isArray(s.ImportantFindings) && s.ImportantFindings.length > 0) {
                        formatted += `#### 🔎 Key Findings\n${s.ImportantFindings.map(f => `- ${f}`).join('\n')}\n\n`;
                    }
                    if (Array.isArray(s.AbnormalValues) && s.AbnormalValues.length > 0) {
                        formatted += `#### ⚠️ Abnormal Values\n${s.AbnormalValues.map(a => `- **${a.parameter || a}**: \`${a.value || ''}\` (${a.interpretation || 'Review clinically'})`).join('\n')}\n\n`;
                    }
                    if (Array.isArray(s.VisibleObservations) && s.VisibleObservations.length > 0) {
                        formatted += `#### 👁️ Observations\n${s.VisibleObservations.map(o => `- ${o}`).join('\n')}\n`;
                    }
                    setSummary(formatted.trim());
                }

                if (res.wallet) setWallet(prev => ({ ...prev, ...res.wallet }));
                else if (res.usage?.wallet) setWallet(prev => ({ ...prev, ...res.usage.wallet }));
            } else {
                throw new Error(res?.message || "Failed to generate summary");
            }
        } catch (err) {
            console.error("Summary error:", err);
            const errMsg = err.response?.data?.message || err.message || "Failed to generate summary";
            if (err.response?.status === 402) {
                if (err.response?.data?.wallet) setWallet(prev => ({ ...prev, ...err.response.data.wallet }));
            }
            setSummaryError(errMsg);
        } finally {
            setIsSummaryLoading(false);
        }
    };

    // Inside Report Search handler
    const handleInsideSearch = async () => {
        const query = insideSearchQuery.trim();
        if (!query || !selectedPatient) return;

        setIsSearchingInside(true);
        setInsideSearchMessage(null);
        setInsideSearchResults([]);

        try {
            const res = await reportAPI.searchReports(selectedPatient._id, query);
            if (res && res.success && Array.isArray(res.results)) {
                setInsideSearchResults(res.results);
                if (res.results.length === 0) {
                    setInsideSearchMessage(`No matches found for "${query}" in this patient's reports.`);
                }
            } else {
                setInsideSearchMessage(res?.message || `No matches found for "${query}".`);
            }
        } catch (err) {
            console.error("Search inside error:", err);
            setInsideSearchMessage(err.response?.data?.message || "Error searching inside reports.");
        } finally {
            setIsSearchingInside(false);
        }
    };

    // Handle Compare Reports
    const handleCompare = async () => {
        if (!compareReport1 || !compareReport2 || isExhausted) return;
        setIsComparing(true);
        setCompareError(null);
        setComparisonResult(null);

        try {
            const r1 = reports.find(r => (r.url || r._id) === compareReport1);
            const r2 = reports.find(r => (r.url || r._id) === compareReport2);

            if (!r1 || !r2 || !r1.url || !r2.url) {
                throw new Error("Please select two valid reports to compare.");
            }

            const res = await reportAPI.compareReports(
                r1.url,
                r1.mimeType || 'application/pdf',
                r2.url,
                r2.mimeType || 'application/pdf',
                selectedPatient?._id
            );

            if (res && res.success && res.comparison) {
                setComparisonResult(res.comparison);
                if (res.wallet) setWallet(prev => ({ ...prev, ...res.wallet }));
                else if (res.usage?.wallet) setWallet(prev => ({ ...prev, ...res.usage.wallet }));
            } else {
                throw new Error(res?.message || "Unable to compare these reports right now. Please try again.");
            }
        } catch (err) {
            console.error("Compare error:", err);
            setCompareError(err.response?.data?.message || err.message || "Unable to compare these reports right now. Please try again.");
        } finally {
            setIsComparing(false);
        }
    };

    // Handle Context-Aware Chat Send
    const handleChatSend = async (overridePrompt = null) => {
        const text = (overridePrompt || chatInput).trim();
        if (!text || isExhausted) return;

        const doctorMsg = {
            role: 'doctor',
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, doctorMsg]);
        if (!overridePrompt) setChatInput('');
        setIsChatLoading(true);

        try {
            const apiMessages = chatMessages.map(m => ({
                role: m.role === 'ai' ? 'assistant' : 'user',
                content: m.text
            }));

            let reportContext = '';
            if (selectedReport) {
                reportContext = `Current Selected Report: "${selectedReport.fileName || selectedReport.name || 'Medical Report'}". `;
                if (summary) {
                    reportContext += `Generated Summary Context: ${typeof summary === 'string' ? summary.substring(0, 500) : ''}. `;
                }
            }

            const patientContext = selectedPatient 
                ? `Patient: ${selectedPatient.name}, MRN: ${selectedPatient.profile.mrn}, Age: ${selectedPatient.profile.age}, Gender: ${selectedPatient.profile.gender}. ${reportContext}`
                : reportContext;

            apiMessages.push({ 
                role: 'user', 
                content: (patientContext ? `[Clinical Context: ${patientContext}]\n\n` : '') + text 
            });

            // Pass selected report as media attachment if available
            const mediaUrls = (selectedReport && selectedReport.url) ? [{
                url: selectedReport.url,
                mimeType: selectedReport.mimeType || 'application/pdf'
            }] : [];

            const res = await reportAPI.chatWithAssistant(apiMessages, mediaUrls);
            if (res && res.success && res.reply) {
                const aiMsg = {
                    role: 'ai',
                    text: res.reply,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                setChatMessages(prev => [...prev, aiMsg]);
                if (res.wallet) setWallet(prev => ({ ...prev, ...res.wallet }));
                else if (res.usage?.wallet) setWallet(prev => ({ ...prev, ...res.usage.wallet }));
            } else {
                throw new Error(res?.message || "No reply received");
            }
        } catch (err) {
            console.error("Chat error:", err);
            if (err.response?.status === 402) {
                if (err.response?.data?.wallet) setWallet(prev => ({ ...prev, ...err.response.data.wallet }));
                const aiMsg = {
                    role: 'ai',
                    text: '⚠️ **AI Credits Exhausted**\n\nYour hospital\'s AI Credits have been fully used. Please contact your Hospital Administrator to recharge.',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                setChatMessages(prev => [...prev, aiMsg]);
            } else {
                const aiMsg = {
                    role: 'ai',
                    text: `⚠️ **Clinical Analysis Notice**\n\nUnable to process this query right now. Please retry shortly.\n\n*Error details:* ${err.message}`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                setChatMessages(prev => [...prev, aiMsg]);
            }
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleClearChat = () => {
        setChatMessages([]);
    };

    // Filter reports
    const filteredReports = reports.filter(r => 
        (r.fileName || r.name || '').toLowerCase().includes(reportFilterQuery.toLowerCase())
    );

    // AI Credit Calculations
    const remainingRupees = wallet ? Number(wallet.remainingAmount) || 0 : 2000;
    const budgetRupees = wallet ? Number(wallet.budgetAmount) || 2000 : 2000;
    const usedRupees = wallet ? Number(wallet.usedAmount) || 0 : 0;
    const usedPercent = budgetRupees > 0 ? Math.min(100, Math.round((usedRupees / budgetRupees) * 100)) : 0;
    const walletStatus = wallet?.status || wallet?.warningLevel || 'ACTIVE';
    const isExhausted = walletStatus === 'EXHAUSTED';
    const statusInfo = getWalletStatusInfo(walletStatus);

    // Patient initials
    const patientInitials = selectedPatient?.name
        ? selectedPatient.name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : 'PT';

    return (
        <div className="cca-exact-page-container">
            
            {/* ── Proper Top Header Card with Title & AI Credits ── */}
            <div className="cca-exact-top-header-card">
                <div className="cca-exact-header-left">
                    <div className="cca-exact-title-wrap">
                        <h1 className="cca-exact-title">AI Assistant</h1>
                        <span className="cca-exact-ai-pill">AI Powered</span>
                    </div>
                    <p className="cca-exact-header-subtitle">
                        Intelligent clinical companion to analyze patient reports, abnormal values & medical trends.
                    </p>
                </div>

                {/* AI Credits Widget in Header */}
                <div className="cca-exact-credits-header-box" onClick={() => { setIsWalletOpen(true); fetchWalletModalData(); }}>
                    <div className="cca-exact-cw-top">
                        <div className="cca-exact-cw-left">
                            <span className="cca-exact-cw-label">AI Credits <FiInfo size={13} /></span>
                            <div className="cca-exact-cw-amount">{formatINR(remainingRupees)}</div>
                            <span className="cca-exact-cw-sub">of {formatINR(budgetRupees)} total budget</span>
                        </div>
                        <button className="cca-exact-btn-buy" onClick={(e) => { e.stopPropagation(); setIsWalletOpen(true); fetchWalletModalData(); }}>
                            Buy More Credits
                        </button>
                    </div>
                    <div className="cca-exact-cw-progress-track">
                        <div className="cca-exact-cw-progress-fill" style={{ 
                            width: `${usedPercent}%`,
                            background: isExhausted ? '#dc2626' : walletStatus === 'VERY_CRITICAL' ? '#ef4444' : walletStatus === 'CRITICAL' ? '#f97316' : walletStatus === 'LOW' ? '#f59e0b' : '#4f46e5'
                        }}></div>
                        <span className="cca-exact-cw-progress-text">{usedPercent}%</span>
                    </div>
                </div>
            </div>

            {/* ── 2-COLUMN MAIN WORKSPACE (LEFT: CLINICAL WORKSPACE | RIGHT: AI ASSISTANT CHAT) ── */}
            <div className="cca-exact-main-grid">
                
                {/* ════════ LEFT COLUMN: Patient Row, Uploaded Reports, Summary, Inside Search & Compare ════════ */}
                <div className="cca-exact-left-col">
                    
                    {/* 1. Patient Search Bar & Selected Patient Card (IN ONE UNIFIED ROW) */}
                    <div className="cca-patient-search-row-unified">
                        {/* Search Input Box */}
                        <div className="cca-compact-search-col">
                            <div className="cca-exact-search-input-box">
                                <button className="cca-exact-search-ico-btn" title="Search"><FiSearch /></button>
                                <input 
                                    type="text"
                                    className="cca-exact-search-input"
                                    placeholder="Search patient by name, MRN, phone..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button className="cca-compact-clear-btn" onClick={() => { setSearchQuery(''); setSearchResults([]); }}>
                                        <FiX size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Patient Autocomplete Dropdown */}
                            {searchResults.length > 0 && (
                                <div className="cca-patient-dropdown" data-lenis-prevent>
                                    {searchResults.map(p => (
                                        <div key={p._id} className="cca-dropdown-item" onClick={() => handleSelectPatient(p)}>
                                            <div className="cca-dd-avatar">{(p.name || 'P').charAt(0)}</div>
                                            <div>
                                                <div className="cca-dd-name">{p.name}</div>
                                                <div className="cca-dd-sub">{p.profile?.mrn || p.patientId || 'CIT-001'} • {p.profile?.gender || p.gender || 'Patient'} • {p.profile?.age || p.age || '--'} Y</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Selected Patient Card (Right Side of Search in Same Row) */}
                        <div className="cca-compact-patient-col">
                            {selectedPatient ? (
                                <div className="cca-exact-patient-card compact">
                                    <div className="cca-exact-patient-left">
                                        <div className="cca-exact-avatar-circle">
                                            {patientInitials}
                                        </div>
                                        <div className="cca-exact-p-info">
                                            <div className="cca-exact-p-name-row">
                                                <span className="cca-exact-p-name">{selectedPatient.name}</span>
                                                <span className="cca-exact-active-tag">Active</span>
                                            </div>
                                            <div className="cca-exact-p-meta">
                                                MRN: {selectedPatient.profile?.mrn}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="cca-exact-patient-right">
                                        <button 
                                            className="cca-exact-btn-view-details"
                                            onClick={() => setShowPatientDetails(!showPatientDetails)}
                                        >
                                            View Profile <FiChevronDown size={13} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="cca-exact-patient-card empty compact">
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>🔍 Search patient to load medical records</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Uploaded Reports Card (SHOWN FIRST BEFORE SUMMARY, 4 REPORTS VISIBLE) */}
                    <div className="cca-exact-card cca-exact-reports-card">
                        <div className="cca-exact-card-header">
                            <div className="cca-exact-card-title">
                                <span className="cca-exact-card-icon blue">📑</span>
                                <div>
                                    <h3>Uploaded Reports ({filteredReports.length})</h3>
                                    <span className="cca-sec-pill blue">Patient Documents</span>
                                </div>
                            </div>
                            <div className="cca-exact-card-actions">
                                {isReportSearchOpen ? (
                                    <div className="cca-header-inline-search-box">
                                        <span className="cca-rep-search-inline-ico"><FiSearch size={13} /></span>
                                        <input 
                                            type="text" 
                                            className="cca-rep-search-inline-input"
                                            placeholder="Filter reports..."
                                            autoFocus
                                            value={reportFilterQuery}
                                            onChange={(e) => setReportFilterQuery(e.target.value)}
                                        />
                                        <button 
                                            className="cca-rep-search-close-btn"
                                            onClick={() => { setIsReportSearchOpen(false); setReportFilterQuery(''); }}
                                            title="Close search"
                                        >
                                            <FiX size={13} />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        className="cca-header-search-icon-btn"
                                        title="Search reports"
                                        onClick={() => setIsReportSearchOpen(true)}
                                    >
                                        <FiSearch size={15} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Reports Scroll Container (natural scroll bubbling) */}
                        <div className="cca-exact-reports-scroll-fixed">
                            {isReportsLoading ? (
                                <div className="cca-reports-loading">Loading reports...</div>
                            ) : filteredReports.length === 0 ? (
                                <div className="cca-exact-empty-reports">
                                    <FiFileText size={24} style={{ color: '#94a3b8', marginBottom: '6px' }} />
                                    <span>No uploaded reports for this patient.</span>
                                </div>
                            ) : (
                                filteredReports.map((r, i) => {
                                    const isSelected = isReportSelected(r);
                                    return (
                                        <div 
                                            key={r._id || i}
                                            className={`cca-report-item ${isSelected ? 'active' : ''}`}
                                            onClick={() => setSelectedReport(r)}
                                        >
                                            <div className="cca-report-icon-box">
                                                {isImageMime(r.mimeType, r.url || r.fileUrl) ? (
                                                    <FiImage className="cca-ico-image" />
                                                ) : (
                                                    <FiFileText className="cca-ico-pdf" />
                                                )}
                                            </div>
                                            <div className="cca-report-info">
                                                <div className="cca-report-name">{r.fileName || r.name || 'Medical Document'}</div>
                                                <div className="cca-report-meta">
                                                    {r.docType || (isPdfMime(r.mimeType, r.url) ? 'PDF' : 'Image')} • {r.date || (r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-IN') : 'Uploaded')}
                                                </div>
                                            </div>

                                            {/* Action Buttons: Select / Selected & View */}
                                            <div className="cca-report-item-actions" onClick={e => e.stopPropagation()}>
                                                {isSelected ? (
                                                    <span className="cca-report-selected-tag">
                                                        <FiCheck size={11} /> Selected
                                                    </span>
                                                ) : (
                                                    <button 
                                                        className="cca-btn-select-report"
                                                        onClick={() => setSelectedReport(r)}
                                                    >
                                                        Select
                                                    </button>
                                                )}

                                                <button 
                                                    className="cca-btn-view-doc"
                                                    title="View document preview"
                                                    onClick={() => setPreviewDoc(r)}
                                                >
                                                    <FiEye size={13} /> View
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 3. AI Report Summary Card */}
                    <div className="cca-exact-card cca-exact-summary-card">
                        <div className="cca-exact-card-header">
                            <div className="cca-exact-card-title">
                                <span className="cca-exact-card-icon purple">🤖</span>
                                <div>
                                    <h3>AI Report Summary</h3>
                                    <span className="cca-selected-rep-hint">
                                        {selectedReport ? `Target: ${selectedReport.fileName || selectedReport.name}` : 'Select a report above'}
                                    </span>
                                </div>
                            </div>
                            <div className="cca-exact-card-actions">
                                <button 
                                    className="cca-exact-btn-generate"
                                    onClick={handleGenerateSummary}
                                    disabled={isSummaryLoading || isExhausted || !selectedReport}
                                    title={!selectedReport ? 'Select a report above first' : isExhausted ? 'AI Credits Exhausted' : 'Generate AI Summary'}
                                >
                                    ✨ {isSummaryLoading ? 'Generating...' : 'Generate Summary'}
                                </button>
                            </div>
                        </div>

                        {/* Summary Body with smooth auto-scroll */}
                        <div className="cca-exact-summary-body-fixed">
                            {summaryError && (
                                <div className="cca-summary-error-banner">
                                    <FiAlertCircle /> {summaryError}
                                </div>
                            )}

                            {isSummaryLoading && (
                                <div className="cca-summary-loading-state">
                                    <div className="cca-spinner"></div>
                                    <span>AI is analyzing report parameters and medical values...</span>
                                </div>
                            )}

                            {!isSummaryLoading && summary && (
                                <div className="cca-exact-summary-markdown-box ai-markdown-body">
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            table: ({ node, ...props }) => (
                                                <div className="ai-markdown-table-wrapper">
                                                    <table className="ai-markdown-table" {...props} />
                                                </div>
                                            ),
                                            th: ({ node, ...props }) => <th className="ai-table-th" {...props} />,
                                            td: ({ node, ...props }) => <td className="ai-table-td" {...props} />,
                                            h1: ({ node, ...props }) => <h3 className="ai-md-h1" {...props} />,
                                            h2: ({ node, ...props }) => <h4 className="ai-md-h2" {...props} />,
                                            h3: ({ node, ...props }) => <h5 className="ai-md-h3" {...props} />,
                                            ul: ({ node, ...props }) => <ul className="ai-md-ul" {...props} />,
                                            ol: ({ node, ...props }) => <ol className="ai-md-ol" {...props} />,
                                            li: ({ node, ...props }) => <li className="ai-md-li" {...props} />
                                        }}
                                    >
                                        {summary}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {!isSummaryLoading && !summary && (
                                <div className="cca-exact-empty-summary">
                                    <div className="cca-exact-empty-icon">📑</div>
                                    <div className="cca-exact-empty-text">
                                        <h4>{selectedReport ? `Ready to summarize "${selectedReport.fileName || selectedReport.name}"` : 'No report selected'}</h4>
                                        <p>{selectedReport ? "Click 'Generate Summary' to analyze parameters and clinical observations." : "Select an uploaded report above to view AI generated summary"}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 4. Search Inside Reports Card */}
                    <div className="cca-exact-card cca-exact-inside-card">
                        <div className="cca-exact-card-header no-border">
                            <div className="cca-exact-card-title">
                                <span className="cca-exact-card-icon green">🔍</span>
                                <div>
                                    <h3>Search Inside Reports</h3>
                                    <span className="cca-sec-pill green">Keyword Search</span>
                                </div>
                            </div>
                        </div>

                        <div className="cca-exact-inside-input-row">
                            <div className="cca-exact-inside-input-box">
                                <span className="cca-exact-inside-search-ico"><FiSearch /></span>
                                <input 
                                    type="text"
                                    className="cca-exact-inside-input"
                                    placeholder="Search keywords (e.g. Hemoglobin, TLC, Kidney Profile, Sugar)..."
                                    value={insideSearchQuery}
                                    onChange={(e) => setInsideSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleInsideSearch()}
                                />
                                {insideSearchQuery && (
                                    <button className="cca-inside-clear-btn" onClick={() => { setInsideSearchQuery(''); setInsideSearchResults([]); setInsideSearchMessage(null); }}>
                                        <FiX size={14} />
                                    </button>
                                )}
                            </div>
                            <button 
                                className="cca-exact-btn-inside-search"
                                onClick={handleInsideSearch}
                                disabled={isSearchingInside || !insideSearchQuery.trim() || !selectedPatient}
                            >
                                {isSearchingInside ? 'Searching...' : 'Search Inside'}
                            </button>
                        </div>

                        {/* Search Results Display */}
                        {insideSearchMessage && (
                            <div className="cca-inside-search-msg">
                                {insideSearchMessage}
                            </div>
                        )}

                        {insideSearchResults.length > 0 && (
                            <div className="cca-exact-inside-results-fixed">
                                {insideSearchResults.map((res, idx) => (
                                    <div key={idx} className="cca-inside-result-card">
                                        <div className="cca-inside-result-header">
                                            <span className="cca-inside-res-docname">📄 {res.reportName}</span>
                                            <span className="cca-inside-res-page">Page {res.pageNumber || 1}</span>
                                        </div>
                                        <div className="cca-inside-res-match">
                                            "...{res.match}..."
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 5. Compare Reports Card */}
                    <div className="cca-exact-card cca-exact-compare-card">
                        <div className="cca-exact-card-header no-border">
                            <div className="cca-exact-card-title">
                                <span className="cca-exact-card-icon orange">📊</span>
                                <div>
                                    <h3>Compare Reports</h3>
                                    <span className="cca-sec-pill orange">Biomarker Trends</span>
                                </div>
                            </div>

                            <div className="cca-exact-compare-controls-row">
                                <select 
                                    className="cca-exact-compare-select"
                                    value={compareReport1}
                                    onChange={(e) => setCompareReport1(e.target.value)}
                                    disabled={reports.length === 0}
                                >
                                    {reports.length === 0 ? (
                                        <option value="">No reports</option>
                                    ) : (
                                        reports.map((r, i) => (
                                            <option key={r._id || i} value={r.url || r._id}>
                                                {r.fileName || r.name || `Report ${i + 1}`}
                                            </option>
                                        ))
                                    )}
                                </select>

                                <span className="cca-vs-text">vs</span>

                                <select 
                                    className="cca-exact-compare-select"
                                    value={compareReport2}
                                    onChange={(e) => setCompareReport2(e.target.value)}
                                    disabled={reports.length === 0}
                                >
                                    {reports.length === 0 ? (
                                        <option value="">No reports</option>
                                    ) : (
                                        reports.map((r, i) => (
                                            <option key={r._id || i} value={r.url || r._id}>
                                                {r.fileName || r.name || `Report ${i + 1}`}
                                            </option>
                                        ))
                                    )}
                                </select>

                                <button 
                                    className="cca-exact-btn-compare"
                                    onClick={handleCompare} 
                                    disabled={isComparing || isExhausted || reports.length < 2}
                                    title={reports.length < 2 ? 'Need at least 2 reports to compare' : isExhausted ? 'AI Credits Exhausted' : 'Compare Reports'}
                                >
                                    <span>⚡</span> {isComparing ? 'Comparing...' : 'Compare'}
                                </button>
                            </div>
                        </div>

                        {compareError && (
                            <div className="cca-summary-error-banner" style={{ margin: '10px 0 0 0' }}>
                                <FiAlertCircle /> {compareError}
                            </div>
                        )}

                        {/* Comparison Results */}
                        {comparisonResult && (
                            <div className="cca-exact-comparison-results-fixed">
                                {comparisonResult.OverallChange && (
                                    <div className="cca-comp-overall">
                                        <strong>Overall Assessment:</strong> {comparisonResult.OverallChange}
                                    </div>
                                )}

                                <div className="cca-comp-grid">
                                    {Array.isArray(comparisonResult.ChangedFindings) && comparisonResult.ChangedFindings.length > 0 && (
                                        <div className="cca-comp-card changed">
                                            <h4>⚡ Changed Values & Trends</h4>
                                            <ul>
                                                {comparisonResult.ChangedFindings.map((cf, i) => (
                                                    <li key={i}>{typeof cf === 'string' ? cf : `${cf.parameter || cf.name}: ${cf.previousValue || ''} ➔ ${cf.currentValue || ''} (${cf.significance || ''})`}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {Array.isArray(comparisonResult.NewFindings) && comparisonResult.NewFindings.length > 0 && (
                                        <div className="cca-comp-card new">
                                            <h4>🔎 New Findings</h4>
                                            <ul>
                                                {comparisonResult.NewFindings.map((nf, i) => (
                                                    <li key={i}>{nf}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {Array.isArray(comparisonResult.StableFindings) && comparisonResult.StableFindings.length > 0 && (
                                        <div className="cca-comp-card stable">
                                            <h4>✅ Stable Findings</h4>
                                            <ul>
                                                {comparisonResult.StableFindings.map((sf, i) => (
                                                    <li key={i}>{sf}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {Array.isArray(comparisonResult.ImportantObservations) && comparisonResult.ImportantObservations.length > 0 && (
                                        <div className="cca-comp-card observations">
                                            <h4>💡 Important Observations</h4>
                                            <ul>
                                                {comparisonResult.ImportantObservations.map((io, i) => (
                                                    <li key={i}>{io}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                {/* ════════ RIGHT COLUMN: AI ASSISTANT CHAT PANEL (MATCHING EXACT SCREENSHOT) ════════ */}
                <div className="cca-exact-right-chat-col">
                    <div className="cca-exact-chat-card">
                        
                        {/* Chat Header */}
                        <div className="cca-exact-chat-header">
                            <div className="cca-exact-chat-title-group">
                                <div className="cca-exact-chat-bot-icon">🤖</div>
                                <div>
                                    <div className="cca-exact-chat-head-row">
                                        <h4>AI Assistant Chat</h4>
                                        <span className="cca-exact-chat-live-badge">Live Clinical Intelligence</span>
                                    </div>
                                    <p className="cca-exact-chat-subtitle">Get AI-driven insights and answers about this patient.</p>
                                </div>
                            </div>

                            <button className="cca-exact-btn-clear-chat" onClick={handleClearChat}>
                                <FiTrash2 size={13} /> Clear Chat
                            </button>
                        </div>

                        {/* Chat Messages Stream */}
                        <div className="cca-exact-chat-stream" data-lenis-prevent>
                            {chatMessages.map((msg, i) => (
                                <AIResponseRenderer
                                    key={i}
                                    content={msg.text}
                                    role={msg.role}
                                    timestamp={msg.timestamp}
                                />
                            ))}

                            {isChatLoading && (
                                <AIResponseRenderer
                                    role="ai"
                                    isTyping={true}
                                    timestamp={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                />
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Quick Clinical Prompts Bar */}
                        <div className="cca-chat-quick-chips" data-lenis-prevent>
                            <button 
                                className="cca-quick-chip"
                                onClick={() => handleChatSend('Iska ilaj kaise hoga? Give 2 to 3 standard evidence-based clinical treatment pathways and management options.')}
                                disabled={isChatLoading || isExhausted}
                            >
                                🩺 Iska ilaj kaise hoga?
                            </button>
                            <button 
                                className="cca-quick-chip"
                                onClick={() => handleChatSend('Analyze all abnormal values in this report and highlight critical parameters.')}
                                disabled={isChatLoading || isExhausted}
                            >
                                ⚠️ Abnormal Values
                            </button>
                            <button 
                                className="cca-quick-chip"
                                onClick={() => handleChatSend('Provide recommended follow-up diagnostic tests and diet/lifestyle guidelines.')}
                                disabled={isChatLoading || isExhausted}
                            >
                                🥗 Follow-up & Diet
                            </button>
                        </div>

                        {/* Chat Input Container */}
                        <div className="cca-exact-chat-input-box">
                            <div className="cca-exact-chat-input-row">
                                <div className="cca-chat-input-actions-left">
                                    <button className="cca-chat-ico-btn" title="Attach report / media"><FiPaperclip size={17} /></button>
                                    <button className="cca-chat-ico-btn" title="Voice dictation"><FiMic size={17} /></button>
                                </div>

                                <input 
                                    type="text"
                                    className="cca-exact-chat-input"
                                    placeholder={isExhausted ? 'AI Credits Exhausted — Contact Admin to recharge' : 'Ask anything about the patient, reports, or "Iska ilaj kaise hoga?"...'}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !isExhausted && handleChatSend()}
                                    disabled={isExhausted}
                                />

                                <button 
                                    className="cca-exact-btn-send"
                                    onClick={() => handleChatSend()}
                                    disabled={!chatInput.trim() || isChatLoading || isExhausted}
                                    title={isExhausted ? 'AI Credits Exhausted' : 'Send message'}
                                >
                                    <FiSend size={15} />
                                </button>
                            </div>

                            <div className="cca-exact-chat-footer-disclaimer">
                                <span>✨ Medical365 AI</span> • Verified clinical algorithms. Please verify clinically.
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* ── Document Preview Modal (When 👁️ View is clicked on any report) ── */}
            {previewDoc && (
                <div className="cca-doc-preview-modal-overlay" onClick={() => setPreviewDoc(null)}>
                    <div className="cca-doc-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="cca-doc-preview-header">
                            <div className="cca-doc-preview-title">
                                <span className="cca-doc-preview-icon">
                                    {isImageMime(previewDoc.mimeType, previewDoc.url) ? '🖼️' : '📄'}
                                </span>
                                <div>
                                    <h4>{previewDoc.fileName || previewDoc.name || 'Medical Document Preview'}</h4>
                                    <span>{previewDoc.docType || (isPdfMime(previewDoc.mimeType, previewDoc.url) ? 'PDF Document' : 'Medical Image')}</span>
                                </div>
                            </div>
                            <div className="cca-doc-preview-actions">
                                <a 
                                    href={previewDoc.url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="cca-btn-preview-ext"
                                    title="Open original file in new tab"
                                >
                                    <FiExternalLink size={14} /> Open
                                </a>
                                <button className="cca-btn-preview-close" onClick={() => setPreviewDoc(null)}>
                                    <FiX size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="cca-doc-preview-canvas" data-lenis-prevent>
                            {isImageMime(previewDoc.mimeType, previewDoc.url) ? (
                                <img 
                                    src={previewDoc.url} 
                                    alt="Medical Report" 
                                    className="cca-doc-preview-img" 
                                />
                            ) : (
                                <iframe 
                                    src={previewDoc.url} 
                                    title="PDF Document Preview" 
                                    className="cca-doc-preview-iframe" 
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── AI Wallet Modal ── */}
            {isWalletOpen && (
                <div className="ai-modal-overlay" onClick={() => setIsWalletOpen(false)}>
                    <div className="ai-tracker-modal" onClick={e => e.stopPropagation()}>
                        <div className="ai-tracker-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '24px' }}>🏥</span>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Hospital AI Wallet & AI Credits</h2>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Live budget and credit usage logs.</span>
                                </div>
                            </div>
                            <button className="ai-tracker-close-btn" onClick={() => setIsWalletOpen(false)}>✕</button>
                        </div>

                        <div className="ai-tracker-body" data-lenis-prevent>
                            {wallet && (
                                <>
                                    <div className="ai-tracker-kpi-grid">
                                        <div className="ai-tracker-card highlight">
                                            <span className="ai-tracker-card-title">Available AI Credits</span>
                                            <span className="ai-tracker-card-value" style={{ color: statusInfo.color }}>
                                                {formatINR(wallet.remainingAmount)}
                                            </span>
                                            <span className="ai-tracker-card-sub">
                                                Status: <strong style={{ color: statusInfo.color }}>{statusInfo.icon} {statusInfo.label}</strong>
                                            </span>
                                        </div>

                                        <div className="ai-tracker-card">
                                            <span className="ai-tracker-card-title">Used Budget</span>
                                            <span className="ai-tracker-card-value">
                                                {formatINR(wallet.usedAmount)}
                                            </span>
                                            <span className="ai-tracker-card-sub">
                                                Total Budget: {formatINR(wallet.budgetAmount || 2000)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="ai-tracker-table-container">
                                        <table className="ai-tracker-table">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Operation</th>
                                                    <th>Tokens</th>
                                                    <th>Cost (₹)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {walletLogs.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="4" style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                                                            No AI requests recorded yet.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    walletLogs.map((log) => (
                                                        <tr key={log._id}>
                                                            <td style={{ color: '#64748b' }}>
                                                                {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td>{log.operation || 'CLINICAL_CHAT'}</td>
                                                            <td>{log.totalTokens || 0}</td>
                                                            <td style={{ color: '#16a34a', fontWeight: 600 }}>
                                                                ₹{(log.actualApiCost || log.estimatedCostInr || 0).toFixed(4)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIAssistant;

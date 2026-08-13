import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiUser, FiFileText } from 'react-icons/fi';
import { reportAPI, patientAPI, doctorAPI } from '../../utils/api';
import './AIAssistant.css';

const highlightKeyword = (text, keyword) => {
    if (!keyword || !text) return text;
    const parts = text.split(new RegExp(`(${keyword})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) => 
                part.toLowerCase() === keyword.toLowerCase() ? (
                    <strong key={i} style={{ backgroundColor: '#fef08a', color: '#166534', padding: '0 4px', borderRadius: '4px' }}>
                        {part}
                    </strong>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
};

const AIAssistant = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const [allPatients, setAllPatients] = useState([]);
    const [isFetchingPatients, setIsFetchingPatients] = useState(true);

    const [selectedPatient, setSelectedPatient] = useState(null);
    const [reports, setReports] = useState([]);
    const [isReportsLoading, setIsReportsLoading] = useState(false);

    const [selectedReport, setSelectedReport] = useState(null);
    const [summary, setSummary] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [reportSearchQuery, setReportSearchQuery] = useState('');
    const [reportSearchResults, setReportSearchResults] = useState(null);
    const [reportSearchError, setReportSearchError] = useState(null);

    const [comparison, setComparison] = useState(null);
    const [isComparing, setIsComparing] = useState(false);
    const [compareError, setCompareError] = useState(null);

    const [historySummary, setHistorySummary] = useState(null);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);

    // ── AI Clinical Chat state (session-only) ──
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatEndRef = useRef(null);
    const chatTextareaRef = useRef(null);

    const CHAT_SUGGESTIONS = [
        'Explain this report',
        'Summarize abnormalities',
        'Show important findings',
        'Explain medical terms',
        'Compare latest report',
    ];

    // Auto-scroll to latest message
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, isChatLoading]);

    const handleChatSend = async (overrideText) => {
        const text = (overrideText || chatInput).trim();
        if (!text || !selectedPatient) return;

        const doctorMsg = { role: 'doctor', text, timestamp: new Date() };
        setChatMessages(prev => [...prev, doctorMsg]);
        setChatInput('');
        if (chatTextareaRef.current) chatTextareaRef.current.style.height = 'auto';
        setIsChatLoading(true);

        // ── Mock AI response (replace with Gemini later) ──
        await new Promise(r => setTimeout(r, 1500));

        const patientName = selectedPatient.profile?.name || selectedPatient.name || 'the patient';
        const mockResponses = {
            'explain this report': `Based on the selected report for ${patientName}, the findings indicate values within expected clinical ranges. Key observations include standard hematological markers and organ function panels. A detailed breakdown can be provided upon request.`,
            'summarize abnormalities': `For ${patientName}, the following abnormalities were noted:\n• Elevated markers in specific parameters\n• Borderline values requiring follow-up\n• All critical values remain within safe limits.\nPlease select a specific report for detailed analysis.`,
            'show important findings': `Important findings for ${patientName}:\n• Primary diagnostic indicators are stable\n• No critical flags detected in recent reports\n• Trending data suggests consistent health metrics\n• Follow-up recommended for borderline parameters.`,
            'explain medical terms': `Here are common medical terms from ${patientName}'s reports:\n• **CBC** – Complete Blood Count: measures red/white blood cells and platelets\n• **BMP** – Basic Metabolic Panel: evaluates kidney function, blood sugar, and electrolytes\n• **MRI** – Magnetic Resonance Imaging: detailed body imaging\nAsk about any specific term for a detailed explanation.`,
            'compare latest report': `To compare reports for ${patientName}, please ensure at least two reports are uploaded. The comparison will highlight:\n• Parameter changes over time\n• Trend analysis of key values\n• Improvement or decline indicators.`,
        };

        const lowerText = text.toLowerCase();
        let aiText = mockResponses[lowerText];
        if (!aiText) {
            aiText = `Thank you for your question regarding ${patientName}. Based on the available medical records, reports, and clinical history, I can provide analysis on this topic. This is a mock response — once Gemini AI is integrated, you will receive detailed, context-aware clinical insights here.`;
        }

        const aiMsg = { role: 'ai', text: aiText, timestamp: new Date() };
        setChatMessages(prev => [...prev, aiMsg]);
        setIsChatLoading(false);
    };

    const handleChatKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatSend();
        }
    };

    const handleTextareaInput = (e) => {
        setChatInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    };

    // Fetch only the doctor's department patients on mount
    useEffect(() => {
        const fetchDoctorPatients = async () => {
            try {
                const res = await doctorAPI.getPatients();
                if (res && res.success && res.patients) {
                    setAllPatients(res.patients);
                }
            } catch (err) {
                console.error("Error fetching doctor's patients:", err);
            } finally {
                setIsFetchingPatients(false);
            }
        };
        fetchDoctorPatients();
    }, []);

    // Local filter based on name, MRN or patientId
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        const q = searchQuery.toLowerCase().trim();
        const filtered = allPatients.filter(p => {
            const nameMatch = p.name && p.name.toLowerCase().includes(q);
            const idMatch = p.patientId && p.patientId.toLowerCase().includes(q);
            const mrnMatch = p.profile?.mrn && p.profile.mrn.toLowerCase().includes(q);
            return nameMatch || idMatch || mrnMatch;
        });
        setSearchResults(filtered);
    }, [searchQuery, allPatients]);

    const handleSelectPatient = async (patient) => {
        setSelectedPatient(patient);
        setSearchResults([]);
        setSearchQuery('');
        setSelectedReport(null);
        setSummary(null);
        setError(null);
        setComparison(null);
        setCompareError(null);
        setHistorySummary(null);
        setHistoryError(null);

        // Fetch reports for the selected patient
        setIsReportsLoading(true);
        setReports([]);
        try {
            // Reusing existing patient documents fetch API
            const res = await patientAPI.getDocuments(patient._id);
            if (res && res.success && res.documents) {
                setReports(res.documents);
            } else if (res && res.success && res.data) {
                setReports(res.data);
            }
        } catch (err) {
            console.error("Error fetching patient documents:", err);
        } finally {
            setIsReportsLoading(false);
        }
    };

    const handleGenerateSummary = async () => {
        if (!selectedReport) {
            setError("Please select a report first.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSummary(null);

        try {
            const res = await reportAPI.generateAISummary(selectedReport.url, selectedReport.mimeType || selectedReport.mimetype || 'application/pdf');
            if (res.success) {
                setSummary(res.summary);
            } else {
                setError(res.message || "Unable to generate summary. Please try again.");
            }
        } catch (err) {
            console.error("AI Summary error:", err);
            setError("Unable to generate summary. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCompareReports = async () => {
        const sortedReports = reports ? [...reports].sort((a, b) => new Date(b.uploadedAt || b.date) - new Date(a.uploadedAt || a.date)) : [];
        if (sortedReports.length < 2) {
            setCompareError("At least two reports are required for comparison.");
            return;
        }

        const latestReport = sortedReports[0];
        const previousReport = sortedReports[1];

        setIsComparing(true);
        setCompareError(null);
        setComparison(null);

        try {
            const res = await reportAPI.compareReports(
                latestReport.url, latestReport.mimeType || 'application/pdf',
                previousReport.url, previousReport.mimeType || 'application/pdf'
            );
            if (res.success) {
                setComparison({
                    latestDate: latestReport.uploadedAt || latestReport.date,
                    previousDate: previousReport.uploadedAt || previousReport.date,
                    data: res.comparison
                });
            } else {
                setCompareError(res.message || "Unable to compare reports.");
            }
        } catch (err) {
            console.error("Compare Reports error:", err);
            setCompareError("Unable to compare reports. Please try again.");
        } finally {
            setIsComparing(false);
        }
    };

    const generateHistorySummary = async () => {
        if (!selectedPatient) return;
        setIsHistoryLoading(true);
        setHistoryError(null);
        setHistorySummary(null);

        try {
            const patientId = selectedPatient._id || selectedPatient.patientUid || selectedPatient.patientId;
            const res = await patientAPI.getFullHistory(patientId);
            
            if (res.success) {
                const timeline = res.timeline || [];
                const patient = res.patient || selectedPatient;
                
                const appointments = timeline.filter(item => item.type === 'appointment').map(i => i.data);
                const totalVisits = appointments.length;
                
                let lastVisitDate = 'Not Available';
                if (appointments.length > 0) {
                    const dates = appointments.map(a => new Date(a.appointmentDate || a.createdAt).getTime()).filter(d => !isNaN(d));
                    if (dates.length > 0) {
                        lastVisitDate = new Date(Math.max(...dates)).toLocaleDateString();
                    }
                }
                
                const departments = [...new Set(appointments.map(a => a.department || a.serviceName).filter(Boolean))];
                const reportsCount = reports ? reports.length : 0;
                
                let diagnoses = [...new Set(timeline.filter(item => item.type === 'appointment' || item.type === 'clinicalVisit').map(i => i.summary?.outcome || i.data?.diagnosis).filter(d => d && d !== 'Pending' && d !== 'Processing' && d !== '—'))];
                
                let allergies = patient.fertilityProfile?.allergies || patient.allergies || patient.profile?.allergies;
                if (!allergies || allergies.trim() === '') allergies = 'Not Available';
                
                const currentMedicines = [];
                appointments.forEach(a => {
                    if (a.prescriptions && Array.isArray(a.prescriptions)) {
                        a.prescriptions.forEach(p => {
                            if (p.name && !currentMedicines.includes(p.name) && p.type !== 'lab_report') {
                                currentMedicines.push(p.name);
                            }
                        });
                    }
                });

                const recentLabReports = reports ? reports.slice(0, 3).map(r => r.fileName || r.name || 'Medical Report') : [];

                if (totalVisits === 0 && reportsCount === 0) {
                    setHistorySummary("No previous medical history available.");
                } else {
                    setHistorySummary({
                        totalVisits,
                        lastVisitDate,
                        departmentsVisited: departments.length > 0 ? departments : ['Not Available'],
                        reportsAvailable: reportsCount,
                        previousDiagnoses: diagnoses.length > 0 ? diagnoses : ['Not Available'],
                        knownAllergies: allergies,
                        currentMedicines: currentMedicines.length > 0 ? currentMedicines : ['Not Available'],
                        recentLabReports: recentLabReports.length > 0 ? recentLabReports : ['Not Available']
                    });
                }
            } else {
                setHistoryError(res.message || "Failed to fetch patient history.");
            }
        } catch (err) {
            console.error("Generate History error:", err);
            setHistoryError("Failed to fetch patient history.");
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleReportSearch = async () => {
        if (!selectedPatient) {
            setReportSearchError("Please select a patient first.");
            return;
        }
        if (!reportSearchQuery.trim()) {
            setReportSearchResults(null);
            setReportSearchError(null);
            return;
        }

        const keyword = reportSearchQuery.trim();
        setReportSearchError(null);
        setReportSearchResults(null);

        try {
            const res = await reportAPI.searchReports(selectedPatient._id || selectedPatient.patientId, keyword);
            
            if (res.success && res.results && res.results.length > 0) {
                setReportSearchResults(res.results);
            } else {
                setReportSearchError(res.message || "No matching keyword found.");
                setReportSearchResults(null);
            }
        } catch (err) {
            console.error("Search inside reports error:", err);
            setReportSearchError("Failed to search reports. No matching keyword found.");
            setReportSearchResults(null);
        }
    };

    return (
        <div className="ai-assistant-container">
            <div className="ai-header">
                <h1>🤖 AI Assistant</h1>
                <p>Advanced patient insights and automated report summaries</p>
            </div>

            <div className="ai-grid">
                {/* Left Column */}
                <div className="ai-col-left">
                    {/* Patient Selection Card */}
                    <div className="ai-card" style={{ position: 'relative' }}>
                        <h3 className="ai-card-title"><FiUser /> Select Patient</h3>
                        
                        <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
                            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '1rem' }}>
                                <FiSearch />
                            </span>
                            <input 
                                type="text" 
                                placeholder={isFetchingPatients ? "Loading your patients..." : "Search patient name, ID, or MRN..."} 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                disabled={isFetchingPatients}
                                style={{
                                    width: '100%', padding: '11px 16px 11px 42px', background: '#ffffff', 
                                    border: '1px solid #cbd5e1', borderRadius: '12px', color: '#0f172a', 
                                    fontSize: '0.88rem', outline: 'none', transition: 'border 0.2s', 
                                    boxSizing: 'border-box'
                                }}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem' }}>
                                    ✕
                                </button>
                            )}
                        </div>

                        {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isFetchingPatients && (
                            <div style={{ color: 'red', marginTop: '8px', fontSize: '14px' }}>
                                No patient found in your department.
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <div style={{ 
                                position: 'absolute', top: '110px', left: '24px', right: '24px', 
                                background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', 
                                zIndex: 10, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                maxHeight: '200px', overflowY: 'auto'
                            }}>
                                {searchResults.map(p => (
                                    <div 
                                        key={p._id}
                                        style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                                        onClick={() => handleSelectPatient(p)}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{p.name}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>{p.patientId} {p.profile?.mrn ? `| ${p.profile.mrn}` : ''}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="ai-patient-info" style={{ marginTop: '20px' }}>
                            <div className="ai-info-row">
                                <span className="ai-info-label">Name</span>
                                <span className="ai-info-value">{selectedPatient ? selectedPatient.name : '-'}</span>
                            </div>
                            <div className="ai-info-row">
                                <span className="ai-info-label">MRN / ID</span>
                                <span className="ai-info-value">{selectedPatient ? (selectedPatient.profile?.mrn || selectedPatient.patientId || '-') : '-'}</span>
                            </div>
                            <div className="ai-info-row">
                                <span className="ai-info-label">Age</span>
                                <span className="ai-info-value">{selectedPatient && selectedPatient.profile?.age ? `${selectedPatient.profile.age} Yrs` : '-'}</span>
                            </div>
                            <div className="ai-info-row">
                                <span className="ai-info-label">Gender</span>
                                <span className="ai-info-value">{selectedPatient && selectedPatient.profile?.gender ? selectedPatient.profile.gender : '-'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Patient Reports Card */}
                    <div className="ai-card">
                        <h3 className="ai-card-title"><FiFileText /> Patient Reports</h3>
                        
                        {!selectedPatient && (
                            <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                                Please select a patient to view reports.
                            </div>
                        )}

                        {selectedPatient && isReportsLoading && (
                            <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                                Loading reports...
                            </div>
                        )}

                        {selectedPatient && !isReportsLoading && reports.length === 0 && (
                            <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                                No reports found for this patient.
                            </div>
                        )}

                        {selectedPatient && !isReportsLoading && reports.length > 0 && (
                            <div className="ai-report-list">
                                {reports.map((report) => {
                                    const isSelected = selectedReport && (
                                        (selectedReport._id && report._id && selectedReport._id === report._id) || 
                                        (selectedReport.url && report.url && selectedReport.url === report.url)
                                    );
                                    
                                    return (
                                        <div 
                                            key={report._id || report.url} 
                                            className={`ai-report-item ${isSelected ? 'selected' : ''}`}
                                            style={{
                                                borderColor: isSelected ? '#8b5cf6' : '#e2e8f0',
                                                backgroundColor: isSelected ? '#f3e8ff' : '#f8fafc'
                                            }}
                                        >
                                            <div className="ai-report-info">
                                                <span 
                                                    className="ai-report-name" 
                                                    title={report.fileName || report.name || 'Document'}
                                                >
                                                    {report.fileName || report.name || 'Document'}
                                                </span>
                                                <span className="ai-report-date">{report.uploadedAt ? new Date(report.uploadedAt).toLocaleDateString() : (report.date || '')}</span>
                                            </div>
                                            <button 
                                                className="ai-btn-view"
                                                onClick={() => isSelected ? setSelectedReport(null) : setSelectedReport(report)}
                                            >
                                                {isSelected ? 'Selected' : 'Select'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Compare Reports Section */}
                    <div className="ai-card">
                        <h3 className="ai-card-title">📊 Compare Reports</h3>
                        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>Compare the latest report with the previous one.</p>
                        
                        <button 
                            className="ai-btn-primary" 
                            onClick={handleCompareReports} 
                            disabled={isComparing || !reports || reports.length < 2}
                            style={{ 
                                width: '100%', 
                                opacity: (!reports || reports.length < 2) ? 0.5 : (isComparing ? 0.7 : 1),
                                cursor: (!reports || reports.length < 2) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isComparing ? 'Comparing...' : 'Compare Latest with Previous'}
                        </button>

                        {(!reports || reports.length < 2) && (
                            <div style={{ marginTop: '12px', fontSize: '14px', color: '#64748b', textAlign: 'center' }}>
                                "At least two reports are required for comparison."
                            </div>
                        )}

                        {compareError && (
                            <div className="ai-error" style={{ marginTop: '16px' }}>
                                {compareError}
                            </div>
                        )}

                        {comparison && (
                            <div className="ai-summary-content" style={{ marginTop: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Latest Report</div>
                                        <div style={{ fontWeight: '500', color: '#0f172a' }}>{comparison.latestDate ? new Date(comparison.latestDate).toLocaleDateString() : 'Unknown Date'}</div>
                                    </div>
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Previous Report</div>
                                        <div style={{ fontWeight: '500', color: '#0f172a' }}>{comparison.previousDate ? new Date(comparison.previousDate).toLocaleDateString() : 'Unknown Date'}</div>
                                    </div>
                                </div>

                                {comparison.data.NewFindings && comparison.data.NewFindings.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ color: '#0f172a', margin: '0 0 8px 0', fontSize: '14px' }}>New Findings</h4>
                                        <ul style={{ color: '#334155', margin: '0', fontSize: '13px', paddingLeft: '20px' }}>
                                            {comparison.data.NewFindings.map((finding, idx) => (
                                                <li key={idx} style={{ marginBottom: '4px' }}>{finding}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {comparison.data.ChangedFindings && comparison.data.ChangedFindings.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ color: '#0f172a', margin: '0 0 8px 0', fontSize: '14px' }}>Changed Findings</h4>
                                        <ul style={{ color: '#334155', margin: '0', fontSize: '13px', paddingLeft: '20px' }}>
                                            {comparison.data.ChangedFindings.map((finding, idx) => (
                                                <li key={idx} style={{ marginBottom: '4px' }}>{finding}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {comparison.data.RemovedFindings && comparison.data.RemovedFindings.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ color: '#0f172a', margin: '0 0 8px 0', fontSize: '14px' }}>Removed Findings</h4>
                                        <ul style={{ color: '#334155', margin: '0', fontSize: '13px', paddingLeft: '20px' }}>
                                            {comparison.data.RemovedFindings.map((finding, idx) => (
                                                <li key={idx} style={{ marginBottom: '4px' }}>{finding}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {comparison.data.OverallChange && (
                                    <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                        <h4 style={{ color: '#0369a1', margin: '0 0 8px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Change</h4>
                                        <p style={{ color: '#0c4a6e', margin: '0', fontSize: '13px', lineHeight: '1.5' }}>
                                            {comparison.data.OverallChange}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Patient History Summary Section */}
                    <div className="ai-card">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                            <h3 className="ai-card-title" style={{ margin: 0 }}>📋 Patient History Summary</h3>
                            <button 
                                className="ai-btn-primary" 
                                onClick={generateHistorySummary} 
                                disabled={isHistoryLoading || !selectedPatient}
                                style={{ padding: '8px 16px', fontSize: '13px', width: '100%' }}
                            >
                                {isHistoryLoading ? 'Loading...' : '🔄 Refresh Summary'}
                            </button>
                        </div>

                        {historyError && (
                            <div className="ai-error" style={{ marginTop: '16px' }}>
                                {historyError}
                            </div>
                        )}

                        {!historySummary && !isHistoryLoading && !historyError && (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>
                                Click refresh to load patient history summary.
                            </div>
                        )}

                        {typeof historySummary === 'string' && (
                            <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>
                                {historySummary}
                            </div>
                        )}

                        {typeof historySummary === 'object' && historySummary !== null && (
                            <div className="ai-summary-content" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ color: '#0f172a', margin: '0 0 10px 0', fontSize: '13px' }}>Overview</h4>
                                    <ul style={{ color: '#334155', margin: '0', fontSize: '13px', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <li><strong>Total Visits:</strong> {historySummary.totalVisits}</li>
                                        <li><strong>Last Visit:</strong> {historySummary.lastVisitDate}</li>
                                        <li><strong>Reports:</strong> {historySummary.reportsAvailable}</li>
                                    </ul>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ color: '#0f172a', margin: '0 0 10px 0', fontSize: '13px' }}>Clinical Details</h4>
                                    <ul style={{ color: '#334155', margin: '0', fontSize: '13px', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <li><strong>Allergies:</strong> {historySummary.knownAllergies}</li>
                                        <li><strong>Departments:</strong> {historySummary.departmentsVisited.join(', ')}</li>
                                    </ul>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ color: '#0f172a', margin: '0 0 10px 0', fontSize: '13px' }}>Medical History</h4>
                                    <ul style={{ color: '#334155', margin: '0', fontSize: '13px', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <li>
                                            <strong>Diagnoses:</strong>
                                            <ul style={{ marginTop: '4px', paddingLeft: '16px' }}>
                                                {historySummary.previousDiagnoses.map((d, i) => <li key={i}>{d}</li>)}
                                            </ul>
                                        </li>
                                        <li>
                                            <strong>Medicines:</strong>
                                            <ul style={{ marginTop: '4px', paddingLeft: '16px' }}>
                                                {historySummary.currentMedicines.map((m, i) => <li key={i}>{m}</li>)}
                                            </ul>
                                        </li>
                                        <li>
                                            <strong>Lab Reports:</strong>
                                            <ul style={{ marginTop: '4px', paddingLeft: '16px' }}>
                                                {historySummary.recentLabReports.map((r, i) => <li key={i}>{r}</li>)}
                                            </ul>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="ai-col-right">
                    {/* AI Summary Section */}
                    <div className="ai-card">
                        <h3 className="ai-card-title">🤖 AI Report Summary</h3>
                        <button 
                            className="ai-btn-primary"
                            onClick={handleGenerateSummary}
                            disabled={isLoading || !selectedReport}
                            style={{ opacity: isLoading || !selectedReport ? 0.7 : 1 }}
                        >
                            {isLoading ? '⏳ Generating Summary...' : 'Generate Summary'}
                        </button>
                        
                        {error && (
                            <div style={{ color: 'red', marginBottom: '16px', fontSize: '14px', textAlign: 'center', marginTop: '10px' }}>
                                {error}
                            </div>
                        )}

                        <div className="ai-summary-box" style={{ 
                            textAlign: summary ? 'left' : 'center', 
                            background: summary ? '#ffffff' : '#fbfbfe',
                            border: summary ? 'none' : '1px dashed #b0b9fd',
                            marginTop: '16px'
                        }}>
                            {!summary && !isLoading && !error && "(No summary generated)"}
                            
                            {summary && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    
                                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ color: '#334155', margin: '0 0 8px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Report Type</h4>
                                        <p style={{ color: '#0f172a', margin: '0', fontSize: '15px', fontWeight: '500' }}>{summary.ReportType}</p>
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ color: '#334155', margin: '0 0 8px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Summary</h4>
                                        <p style={{ color: '#0f172a', margin: '0', fontSize: '14px', lineHeight: '1.5' }}>{summary.OverallSummary}</p>
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ color: '#334155', margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Important Findings</h4>
                                        <ul style={{ color: '#0f172a', margin: '0', fontSize: '14px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {summary.ImportantFindings?.map((finding, idx) => (
                                                <li key={idx}>{finding}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {summary.AbnormalValues && summary.AbnormalValues.length > 0 && (
                                        <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                            <h4 style={{ color: '#dc2626', margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Abnormal Findings</h4>
                                            <ul style={{ color: '#991b1b', margin: '0', fontSize: '14px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {summary.AbnormalValues.map((val, idx) => (
                                                    <li key={idx}>{val}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Search Inside Reports Section */}
                    <div className="ai-card">
                        <h3 className="ai-card-title"><FiSearch /> Search Inside Reports</h3>
                        
                        <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box', marginTop: '12px' }}>
                            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '1.2rem' }}>
                                <FiSearch />
                            </span>
                            <input 
                                type="text" 
                                placeholder="Search inside patient's reports..." 
                                value={reportSearchQuery}
                                onChange={(e) => setReportSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleReportSearch()}
                                disabled={!selectedPatient}
                                style={{
                                    width: '100%', padding: '14px 16px 14px 44px', background: '#f8fafc', 
                                    border: '1px solid #cbd5e1', borderRadius: '12px', color: '#0f172a', 
                                    fontSize: '1rem', outline: 'none', transition: 'border 0.2s', 
                                    boxSizing: 'border-box'
                                }}
                            />
                            {reportSearchQuery && (
                                <button onClick={() => setReportSearchQuery('')} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}>
                                    ✕
                                </button>
                            )}
                        </div>
                        
                        <div className="ai-search-results" style={{ marginTop: '24px' }}>
                            {reportSearchError && (
                                <div style={{ color: '#64748b', fontSize: '15px', textAlign: 'center', padding: '24px 0', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                    {reportSearchError}
                                </div>
                            )}

                            {!reportSearchResults && !reportSearchError && (
                                <div style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
                                    (No results)
                                </div>
                            )}

                            {reportSearchResults && reportSearchResults.length > 0 && (
                                <div>
                                    <h4 style={{ color: '#0f172a', margin: '0 0 16px 0', fontSize: '15px' }}>
                                        Found matches for "{reportSearchQuery}"
                                    </h4>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {reportSearchResults.map((result, idx) => (
                                            <div key={idx} style={{ 
                                                background: '#ffffff', 
                                                border: '1px solid #e2e8f0', 
                                                borderRadius: '12px', 
                                                padding: '16px', 
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                                                        {result.reportName}
                                                    </span>
                                                    <span style={{ fontSize: '13px', color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '12px', fontWeight: '500' }}>
                                                        Page: {result.pageNumber}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '15px', color: '#334155', lineHeight: '1.6', background: '#f8fafc', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #8b5cf6' }}>
                                                    {highlightKeyword(result.match, result.keyword)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── AI Clinical Assistant Chat ── */}
                    <div className="ai-card ai-chat-card">
                        <h3 className="ai-card-title">💬 AI Clinical Assistant</h3>

                        {!selectedPatient ? (
                            <div className="ai-chat-disabled">
                                <span className="ai-chat-disabled-icon">🔒</span>
                                Please select a patient first.
                            </div>
                        ) : (
                            <>
                                {/* Conversation Area */}
                                <div className="ai-chat-messages">
                                    {chatMessages.length === 0 && !isChatLoading && (
                                        <div className="ai-chat-empty">
                                            <span style={{ fontSize: '36px' }}>🤖</span>
                                            <p>Start a clinical conversation about your patient.</p>
                                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>AI answers based on selected patient data, reports & medical history only.</span>
                                        </div>
                                    )}

                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`ai-chat-bubble ${msg.role}`}>
                                            <div className="ai-chat-bubble-header">
                                                <span className="ai-chat-role-tag">{msg.role === 'doctor' ? '🩺 You' : '🤖 AI'}</span>
                                                <span className="ai-chat-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="ai-chat-bubble-text">{msg.text}</div>
                                        </div>
                                    ))}

                                    {isChatLoading && (
                                        <div className="ai-chat-bubble ai">
                                            <div className="ai-chat-bubble-header">
                                                <span className="ai-chat-role-tag">🤖 AI</span>
                                            </div>
                                            <div className="ai-chat-typing">
                                                <span></span><span></span><span></span>
                                            </div>
                                        </div>
                                    )}

                                    <div ref={chatEndRef} />
                                </div>

                                {/* Quick Suggestion Chips */}
                                <div className="ai-chat-chips">
                                    {CHAT_SUGGESTIONS.map((chip, i) => (
                                        <button key={i} className="ai-chat-chip" onClick={() => handleChatSend(chip)}>
                                            {chip}
                                        </button>
                                    ))}
                                </div>

                                {/* Input Area */}
                                <div className="ai-chat-input-area">
                                    <textarea
                                        ref={chatTextareaRef}
                                        className="ai-chat-input"
                                        placeholder="Type your clinical question..."
                                        value={chatInput}
                                        onChange={handleTextareaInput}
                                        onKeyDown={handleChatKeyDown}
                                        rows={1}
                                    />
                                    <button
                                        className="ai-chat-send-btn"
                                        onClick={() => handleChatSend()}
                                        disabled={!chatInput.trim() || isChatLoading}
                                    >
                                        Send
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIAssistant;

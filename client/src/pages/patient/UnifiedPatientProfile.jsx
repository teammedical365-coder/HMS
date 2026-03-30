import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './UnifiedPatientProfile.css';

const UnifiedPatientProfile = () => {
    const { id: patientId } = useParams();
    const navigate = useNavigate();
    const [patientData, setPatientData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await patientAPI.getFullHistory(patientId);
                if (res.success) {
                    setPatientData(res.user);
                    setTimeline(res.timeline || []);
                }
            } catch (err) {
                console.error("Error fetching unified profile", err);
                setError('Failed to load patient history or unauthorized access.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [patientId]);

    const calculateMetrics = () => {
        let metrics = {
            totalPaid: 0,
            totalDue: 0,
            appointmentsCount: 0,
            upcomingAppointments: 0,
            pendingLabs: 0,
            completedLabs: 0
        };

        const now = new Date();

        timeline.forEach(item => {
            const data = item.data;
            if (item.type === 'appointment') {
                metrics.appointmentsCount++;
                if (new Date(data.appointmentDate) >= now.setHours(0, 0, 0, 0) && data.status !== 'cancelled' && data.status !== 'completed') {
                    metrics.upcomingAppointments++;
                }
                const amt = Number(data.amount) || 0;
                if (data.paymentStatus === 'paid') metrics.totalPaid += amt;
                else if (data.paymentStatus === 'pending') metrics.totalDue += amt;
            } else if (item.type === 'labReport') {
                if (data.status === 'completed') metrics.completedLabs++;
                else metrics.pendingLabs++;
                const amt = Number(data.amount) || 0;
                if (data.paymentStatus === 'paid') metrics.totalPaid += amt;
                else if (data.paymentStatus === 'pending') metrics.totalDue += amt;
            } else if (item.type === 'pharmacyOrder') {
                const amt = Number(data.totalAmount) || 0;
                if (data.paymentStatus === 'paid') metrics.totalPaid += amt;
                else if (data.paymentStatus === 'pending') metrics.totalDue += amt;
            }
        });

        return metrics;
    };

    const generatePDF = () => {
        if (!patientData) return;

        const doc = new jsPDF();
        let y = 20;

        // Header
        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185);
        doc.text("PAWAN HARISH IVF CENTER", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Complete Unified Patient Record", 105, y, { align: 'center' });
        y += 15;

        // Patient Details Block
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.setFillColor(240, 240, 240);
        doc.rect(14, y, 182, 35, 'F');

        y += 10;
        doc.setFont("helvetica", "bold"); doc.text("Patient Name:", 18, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.name || '-'}`, 55, y);
        doc.setFont("helvetica", "bold"); doc.text("MRN / ID:", 120, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.patientId || '-'}`, 150, y);

        y += 10;
        doc.setFont("helvetica", "bold"); doc.text("Phone:", 18, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.phone || '-'}`, 55, y);
        doc.setFont("helvetica", "bold"); doc.text("DOB:", 120, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.dob ? new Date(patientData.dob).toLocaleDateString() : '-'}`, 150, y);

        y += 10;
        doc.setFont("helvetica", "bold"); doc.text("Gender:", 18, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.gender || '-'}`, 55, y);
        doc.setFont("helvetica", "bold"); doc.text("Report Date:", 120, y);
        doc.setFont("helvetica", "normal"); doc.text(`${new Date().toLocaleDateString()}`, 150, y);

        y += 20;

        // Timeline Records
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Comprehensive Medical & Financial History", 14, y);
        y += 8;

        const tableBody = timeline.map(item => {
            const d = new Date(item.date).toLocaleDateString();
            let desc = '';
            let amount = '-';
            let payStatus = '-';

            if (item.type === 'appointment') {
                desc = `Appointment w/ ${item.data.doctorName || 'Doctor'} - ${item.data.serviceName || 'Consultation'}`;
                amount = `₹${item.data.amount || 0}`;
                payStatus = item.data.paymentStatus || 'pending';
            } else if (item.type === 'clinicalVisit') {
                desc = `Clinical Visit - ${item.summary?.outcome || 'Session Recorded'}`;
            } else if (item.type === 'labReport') {
                desc = `Lab Order: ${(item.data.testNames || []).join(', ')} [${item.data.status}]`;
                amount = `₹${item.data.amount || 0}`;
                payStatus = item.data.paymentStatus || 'pending';
            } else if (item.type === 'pharmacyOrder') {
                desc = `Pharmacy Order (${item.data.items?.length || 0} items) [${item.data.status}]`;
                amount = `₹${item.data.totalAmount || 0}`;
                payStatus = item.data.paymentStatus || 'pending';
            }

            return [d, item.type.toUpperCase(), desc, amount, payStatus];
        });

        autoTable(doc, {
            startY: y,
            head: [['Date', 'Category', 'Description/Details', 'Amount', 'Payment status']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: { 2: { cellWidth: 80 } }
        });

        doc.save(`Patient_Profile_${patientData.patientId || patientData._id}.pdf`);
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading unified profile...</div>;
    if (error) return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: 'red' }}>{error}</p>
            <button onClick={() => navigate(-1)} style={{ marginTop: '12px', padding: '8px 16px', cursor: 'pointer' }}>← Go Back</button>
        </div>
    );
    if (!patientData) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <p>Patient not found or no data available.</p>
            <button onClick={() => navigate(-1)} style={{ marginTop: '12px', padding: '8px 16px', cursor: 'pointer' }}>← Go Back</button>
        </div>
    );

    const metrics = calculateMetrics();
    const profile = patientData.fertilityProfile || {};

    // Helper functions for the status boxes
    const getUpcomingAppointments = () => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return timeline.filter(t =>
            t.type === 'appointment' &&
            new Date(t.data.appointmentDate) >= now &&
            t.data.status !== 'cancelled' && t.data.status !== 'completed'
        ).sort((a, b) => new Date(a.data.appointmentDate) - new Date(b.data.appointmentDate));
    };

    const getLabTestStatus = () => {
        return timeline.filter(t => t.type === 'labReport').slice(0, 5);
    };

    const getMedications = () => {
        let active = [];
        let previous = [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Map deduplication
        const seenCurrent = new Set();
        const seenPrev = new Set();

        timeline.forEach(t => {
            const isRecent = new Date(t.date) >= thirtyDaysAgo;

            const addMed = (name, details) => {
                if (!name) return;
                const key = name.toLowerCase().trim();
                const medObj = { name, details: details || '', date: t.date };

                if (isRecent) {
                    if (!seenCurrent.has(key)) {
                        seenCurrent.add(key);
                        active.push(medObj);
                    }
                } else {
                    if (!seenCurrent.has(key) && !seenPrev.has(key)) {
                        seenPrev.add(key);
                        previous.push(medObj);
                    }
                }
            };

            if (t.type === 'pharmacyOrder' && t.data.items) {
                t.data.items.forEach(i => addMed(i.medicineName, `Qty: ${i.quantity || '-'}`));
            } else if (t.type === 'appointment' && t.data.pharmacy) {
                t.data.pharmacy.forEach(m => addMed(m.medicineName, `${m.frequency || ''} ${m.duration || ''}`.trim()));
            } else if (t.type === 'clinicalVisit' && t.data.doctorConsultation?.prescription) {
                t.data.doctorConsultation.prescription.forEach(p => addMed(p.medicine, `${p.dosage || ''} ${p.duration || ''}`.trim()));
            }
        });

        return { active, previous };
    };

    const upcomingAppts = getUpcomingAppointments();
    const labStatus = getLabTestStatus();
    const meds = getMedications();

    return (
        <div className="upp-container">
            <button className="btn-secondary" style={{ marginBottom: '16px' }} onClick={() => navigate(-1)}>
                &larr; Back
            </button>

            {/* Header Profile Card */}
            <div className="upp-header-card">
                <div className="upp-identity">
                    <div className="upp-avatar">
                        {(patientData.name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="upp-info">
                        <h1>{patientData.name || 'Unknown Patient'}</h1>
                        <div className="upp-tags">
                            <span className="upp-tag">MRN/ID: {patientData.patientId || patientData._id}</span>
                            <span className="upp-tag">📞 {patientData.phone || '-'}</span>
                            <span className="upp-tag">🩸 {profile.bloodGroup || 'O-'}</span>
                            <span className="upp-tag">{patientData.gender || 'Unknown'} - {patientData.dob ? new Date().getFullYear() - new Date(patientData.dob).getFullYear() : (profile.age || '-')} yrs</span>
                            {patientData.email && <span className="upp-tag">✉️ {patientData.email}</span>}
                        </div>
                    </div>
                </div>
                <div className="upp-actions">
                    <button className="upp-btn-download" onClick={generatePDF}>
                        📥 Download Full Profile
                    </button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="upp-metrics">
                <div className="upp-metric-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <span className="upp-metric-label">Total Visits</span>
                    <span>{metrics.appointmentsCount}</span>
                </div>
                <div className="upp-metric-card" style={{ borderLeft: '4px solid #eab308' }}>
                    <span className="upp-metric-label">Upcoming Appts</span>
                    <span>{metrics.upcomingAppointments}</span>
                </div>
                <div className="upp-metric-card" style={{ borderLeft: '4px solid #ef4444' }}>
                    <span className="upp-metric-label">Pending Dues</span>
                    <span style={{ color: '#ef4444' }}>₹{metrics.totalDue}</span>
                </div>
                <div className="upp-metric-card" style={{ borderLeft: '4px solid #22c55e' }}>
                    <span className="upp-metric-label">Total Paid</span>
                    <span style={{ color: '#22c55e' }}>₹{metrics.totalPaid}</span>
                </div>
            </div>

            {/* Content Layout */}
            <div className="upp-content-grid">

                {/* Left Column: Vertical Timeline */}
                <div className="upp-section">
                    <h3>Chronological History ({timeline.length} Records)</h3>
                    {timeline.length === 0 ? (
                        <p style={{ color: '#64748b' }}>No clinical or financial history recorded yet.</p>
                    ) : (
                        <div className="upp-timeline">
                            {timeline.map((item, idx) => {
                                const ds = new Date(item.date).toLocaleDateString('en-IN', {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                });

                                return (
                                    <div key={idx} className={`upp-timeline-item type-${item.type}`}>
                                        <div className="upp-tl-header">
                                            <span className="upp-tl-date">{ds}</span>
                                            <span className={`upp-tl-badge badge-${item.type}`}>
                                                {item.type.replace(/([A-Z])/g, ' $1').trim()}
                                            </span>
                                        </div>

                                        <div className="upp-tl-body">
                                            {item.type === 'appointment' && (
                                                <>
                                                    <strong>{item.data.serviceName || 'Consultation'} with {item.data.doctorName || 'Doctor'}</strong>
                                                    <div>Status: <span style={{ textTransform: 'capitalize' }}>{item.data.status}</span></div>
                                                    {item.data.amount > 0 && <div>Fees: ₹{item.data.amount} ({item.data.paymentStatus})</div>}
                                                </>
                                            )}

                                            {item.type === 'clinicalVisit' && (
                                                <>
                                                    <strong>Clinical Evaluation</strong>
                                                    <div>Chief Complaint: {item.summary.primaryComplaint}</div>
                                                    <div>Diagnosis: {item.summary.outcome}</div>
                                                    {item.data.doctorConsultation?.clinicalNotes && (
                                                        <div style={{ marginTop: '8px', fontStyle: 'italic', background: '#fff', padding: '8px', borderLeft: '3px solid #cbd5e1' }}>
                                                            "{item.data.doctorConsultation.clinicalNotes}"
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {item.type === 'labReport' && (
                                                <>
                                                    <strong>Lab Order ({item.data.status})</strong>
                                                    <div>Tests: {(item.data.testNames || []).join(', ')}</div>
                                                    {item.data.amount > 0 && <div>Fees: ₹{item.data.amount} ({item.data.paymentStatus})</div>}
                                                    {item.data.reportFileUrl && (
                                                        <a href={item.data.reportFileUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600, marginTop: '5px', display: 'inline-block' }}>
                                                            📄 View Result
                                                        </a>
                                                    )}
                                                </>
                                            )}

                                            {item.type === 'pharmacyOrder' && (
                                                <>
                                                    <strong>Pharmacy Dispensation ({item.data.status})</strong>
                                                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                                        {(item.data.items || []).map((med, mIdx) => (
                                                            <li key={mIdx}>{med.medicineName} x{med.quantity}</li>
                                                        ))}
                                                    </ul>
                                                    <div>Total: ₹{item.data.totalAmount} ({item.data.paymentStatus})</div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Column: Financial & Other Summaries */}
                <div className="upp-side-col" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Status: Upcoming Appointments */}
                    <div className="upp-section">
                        <h3>Upcoming Appointments</h3>
                        {upcomingAppts.length === 0 ? (
                            <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No upcoming appointments.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {upcomingAppts.map((apt, idx) => (
                                    <div key={idx} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                                            {new Date(apt.data.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {apt.data.appointmentTime || 'TBD'}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>{apt.data.doctorName || 'Doctor'} - {apt.data.serviceName || 'Consultation'}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Status: Lab Tests */}
                    <div className="upp-section">
                        <h3>Recent Lab Tests</h3>
                        {labStatus.length === 0 ? (
                            <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No lab tests recorded.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {labStatus.map((lab, idx) => (
                                    <div key={idx} style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>
                                                {(lab.data.testNames || []).join(', ').substring(0, 30)}{(lab.data.testNames || []).join(', ').length > 30 ? '...' : ''}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{new Date(lab.date).toLocaleDateString('en-IN')}</div>
                                        </div>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase',
                                            background: lab.data.status === 'completed' ? '#dcfce7' : '#fef3c7',
                                            color: lab.data.status === 'completed' ? '#166534' : '#92400e'
                                        }}>{lab.data.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Medications */}
                    <div className="upp-section">
                        <h3 style={{ marginBottom: '16px' }}>Medications</h3>

                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', textTransform: 'uppercase', marginBottom: '8px' }}>Currently On (~30 days)</div>
                            {meds.active.length === 0 ? (
                                <p style={{ color: '#64748b', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>No active medications found.</p>
                            ) : (
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', color: '#334155' }}>
                                    {meds.active.map((m, i) => (
                                        <li key={i} style={{ marginBottom: '6px' }}>
                                            <strong>{m.name}</strong> {m.details && <span style={{ color: '#64748b', fontSize: '12px' }}>({m.details})</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Previously On</div>
                            {meds.previous.length === 0 ? (
                                <p style={{ color: '#64748b', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>No previous medications.</p>
                            ) : (
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#475569' }}>
                                    {meds.previous.map((m, i) => (
                                        <li key={i} style={{ marginBottom: '4px' }}>
                                            <strong>{m.name}</strong> <span style={{ color: '#94a3b8', fontSize: '12px' }}>({new Date(m.date).toLocaleDateString('en-IN')})</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="upp-section">
                        <h3>Recent Finances</h3>
                        {timeline.filter(t => t.data.amount > 0 || t.data.totalAmount > 0).slice(0, 5).map((t, idx) => {
                            const amt = t.data.amount || t.data.totalAmount;
                            const status = t.data.paymentStatus || 'pending';
                            const label = t.type === 'appointment' ? 'Visit Fee' : t.type === 'labReport' ? 'Lab Tests' : 'Medicines';

                            return (
                                <div key={idx} className="upp-finance-row">
                                    <span>
                                        <strong>{label}</strong>
                                        <br /><small style={{ color: '#64748b' }}>{new Date(t.date).toLocaleDateString()}</small>
                                    </span>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600 }}>₹{amt}</div>
                                        <div className={`upp-finance-status status-${status}`}>{status}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default UnifiedPatientProfile;

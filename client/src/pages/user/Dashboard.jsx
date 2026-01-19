import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css';
import './Appointment.css';

const PrescriptionModal = ({ appointment, onClose }) => {
    if (!appointment) return null;

    const labReports = appointment.prescriptions?.filter(doc => doc.type === 'lab_report') || [];
    const doctorPrescriptions = appointment.prescriptions?.filter(doc => doc.type !== 'lab_report') || [];

    if (doctorPrescriptions.length === 0 && appointment.prescription) {
        doctorPrescriptions.push({ url: appointment.prescription, name: 'Prescription File' });
    }

    const pharmacyItems = appointment.pharmacy?.map(p => ({
        name: p.medicineName || p.name,
        frequency: p.frequency || '-',
        duration: p.duration || '-'
    })) || [];

    const dietItems = appointment.dietPlan || appointment.diet || [];

    return (
        <div className="details-modal-overlay" onClick={onClose}>
            <div className="details-modal-content animate-on-scroll visible" onClick={e => e.stopPropagation()}>
                <div className="details-header">
                    <h2>Treatment Details</h2>
                    <button className="close-details-btn" onClick={onClose}>×</button>
                </div>
                <div className="details-body">
                    <div className="details-info-grid">
                        <div><strong>Doctor:</strong> {appointment.doctorName}</div>
                        <div><strong>Date:</strong> {new Date(appointment.appointmentDate).toLocaleDateString()}</div>
                        <div><strong>Service:</strong> {appointment.serviceName}</div>
                    </div>
                    <hr />

                    {appointment.notes && (
                        <div className="detail-section">
                            <h4>Diagnosis / Notes</h4>
                            <p className="notes-text">{appointment.notes}</p>
                        </div>
                    )}

                    {appointment.labTests && appointment.labTests.length > 0 && (
                        <div className="detail-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4 style={{ margin: 0 }}>Recommended Lab Tests</h4>
                                {labReports.length > 0 ? (
                                    <span className="status-badge status-completed" style={{ fontSize: '0.75rem' }}>Results Ready</span>
                                ) : (
                                    <span className="status-badge status-pending" style={{ fontSize: '0.75rem' }}>Processing</span>
                                )}
                            </div>
                            <div className="tags-container">
                                {appointment.labTests.map((test, i) => (
                                    <span key={i} className="detail-tag">{test}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {labReports.length > 0 && (
                        <div className="detail-section" style={{ background: '#f0f9ff', padding: '15px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                            <h4 style={{ color: '#0284c7', marginTop: 0 }}>🔬 Lab Results</h4>
                            <div className="files-list">
                                {labReports.map((doc, i) => (
                                    <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="file-link" style={{ borderColor: '#0284c7', color: '#0284c7' }}>
                                        📄 {doc.name || 'Download Report'}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {pharmacyItems.length > 0 && (
                        <div className="detail-section">
                            <h4>Prescribed Medications</h4>
                            <table className="med-table">
                                <thead>
                                    <tr>
                                        <th>Medicine</th>
                                        <th>Frequency</th>
                                        <th>Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pharmacyItems.map((med, i) => (
                                        <tr key={i}>
                                            <td>{med.name}</td>
                                            <td>{med.frequency}</td>
                                            <td>{med.duration}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {dietItems.length > 0 && (
                        <div className="detail-section">
                            <h4>Dietary Recommendations</h4>
                            <ul className="detail-list">
                                {dietItems.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                        </div>
                    )}

                    {doctorPrescriptions.length > 0 && (
                        <div className="detail-section">
                            <h4>📝 Prescriptions</h4>
                            <div className="files-list">
                                {doctorPrescriptions.map((doc, i) => (
                                    <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="file-link">
                                        📄 {doc.name || 'View Prescription'}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="modal-footer" style={{ padding: '20px', textAlign: 'right', borderTop: '1px solid #eee' }}>
                    <button className="auth-button" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [appointments, setAppointments] = useState([]);
    const [labReports, setLabReports] = useState([]);
    const [pharmacyOrders, setPharmacyOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAppointment, setSelectedAppointment] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (token && userData) {
            setIsAuthenticated(true);
            setUser(JSON.parse(userData));
            fetchDashboardData(token);
        } else {
            navigate('/login?redirect=/dashboard');
        }
    }, [navigate]);

    useEffect(() => {
        const observerOptions = { threshold: 0.1 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, observerOptions);

        const elements = document.querySelectorAll('.animate-on-scroll');
        elements.forEach((el) => observer.observe(el));
        return () => elements.forEach((el) => observer.unobserve(el));
    }, [isLoading]);

    const fetchDashboardData = async (token) => {
        setIsLoading(true);
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        try {
            const appointmentsResponse = await fetch(`${API_BASE}/api/appointments/my-appointments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const appointmentsData = await appointmentsResponse.json();
            if (appointmentsData.success) setAppointments(appointmentsData.appointments || []);

            const labResponse = await fetch(`${API_BASE}/api/lab/my-reports`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const labData = await labResponse.json();
            if (labData.success) setLabReports(labData.reports || []);

            const pharmacyResponse = await fetch(`${API_BASE}/api/pharmacy/orders/my-orders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pharmacyData = await pharmacyResponse.json();
            if (pharmacyData.success) setPharmacyOrders(pharmacyData.orders || []);

        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const isUpcoming = (appointmentDate, appointmentTime) => {
        if (!appointmentDate || !appointmentTime) return false;
        return new Date(`${appointmentDate}T${appointmentTime}`) >= new Date();
    };

    const hasDetails = (app) => {
        return app.status === 'completed' || app.notes || app.prescription ||
            (app.prescriptions?.length > 0) || (app.labTests?.length > 0) || (app.pharmacy?.length > 0);
    };

    if (!isAuthenticated) return null;

    return (
        <div className="dashboard-page">
            <div className="content-wrapper">
                <section className="dashboard-header animate-on-scroll slide-up">
                    <div className="header-content">
                        <span className="badge">User Dashboard</span>
                        <h1>Welcome back, <span className="text-gradient">{user?.name || 'User'}</span></h1>
                        {user?.patientId && <p className="patient-id-display">Patient ID: {user.patientId}</p>}
                    </div>
                </section>

                {isLoading ? (
                    <div className="loading-state"><div className="loading-spinner"></div><p>Loading your dashboard...</p></div>
                ) : (
                    <div className="dashboard-grid">

                        {/* --- APPOINTMENTS (Max 3) --- */}
                        <div className="dashboard-column animate-on-scroll slide-up delay-100">
                            <div className="column-header">
                                <div className="column-icon">📅</div>
                                <div><h2>Appointments</h2><p className="column-count">{appointments.length} total</p></div>
                            </div>
                            <div className="column-content">
                                {appointments.length > 0 ? (
                                    <div className="items-list">
                                        {/* SLICE TO 3 */}
                                        {appointments.slice(0, 3).map((appointment) => (
                                            <div key={appointment._id} className={`dashboard-item ${isUpcoming(appointment.appointmentDate, appointment.appointmentTime) ? 'upcoming' : 'past'}`}>
                                                <div className="item-header">
                                                    <span className={`status-badge status-${appointment.status}`}>{appointment.status}</span>
                                                </div>
                                                <div className="item-body">
                                                    <h3>Dr.{appointment.doctorName}</h3>
                                                    <div className="item-details">
                                                        <span className="detail">📅 {formatDate(appointment.appointmentDate)}</span>
                                                        <span className="detail">🕐 {appointment.appointmentTime}</span>
                                                    </div>

                                                    {appointment.pharmacy && appointment.pharmacy.length > 0 && (
                                                        <div className="meds-preview" style={{
                                                            marginTop: '8px',
                                                            fontSize: '0.8rem',
                                                            color: '#555',
                                                            background: '#f1f5f9',
                                                            padding: '6px',
                                                            borderRadius: '4px',
                                                            borderLeft: '3px solid #0ea5e9'
                                                        }}>
                                                            <strong style={{ color: '#0ea5e9' }}>💊 Rx: </strong>
                                                            {appointment.pharmacy.map(p => p.medicineName || p.name).join(', ')}
                                                        </div>
                                                    )}

                                                    {hasDetails(appointment) && <button className="view-presc-btn" onClick={() => setSelectedAppointment(appointment)}>View Details</button>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <div className="empty-state-small"><p>No appointments yet</p></div>}
                            </div>
                            <div className="column-footer">
                                <Link to="/appointment" className="view-all-link">View Previous Appointments →</Link>
                            </div>
                        </div>

                        {/* --- LAB REPORTS (Max 3) --- */}
                        <div className="dashboard-column animate-on-scroll slide-up delay-200">
                            <div className="column-header">
                                <div className="column-icon">🔬</div>
                                <div><h2>Lab Reports</h2><p className="column-count">{labReports.length} reports</p></div>
                            </div>
                            <div className="column-content">
                                {/* SLICE TO 3 */}
                                {labReports.slice(0, 3).map(report => (
                                    <div key={report._id} className="dashboard-item">
                                        <div className="item-header">
                                            <span className="item-id">#{report._id.slice(-6).toUpperCase()}</span>
                                            <span className={`status-badge status-${report.testStatus?.toLowerCase()}`}>{report.testStatus}</span>
                                        </div>
                                        <div className="item-body">
                                            <h3>{report.testNames?.join(', ') || 'Diagnostic Tests'}</h3>
                                            <div className="item-details"><span className="detail">📅 {formatDate(report.createdAt)}</span></div>
                                        </div>
                                    </div>
                                ))}
                                {labReports.length === 0 && <div className="empty-state-small"><p>No lab reports</p></div>}
                            </div>
                            <div className="column-footer">
                                <Link to="/lab-reports" className="view-all-link">View Previous Reports →</Link>
                            </div>
                        </div>

                        {/* --- PHARMACY (Max 3) --- */}
                        <div className="dashboard-column animate-on-scroll slide-up delay-300">
                            <div className="column-header">
                                <div className="column-icon">💊</div>
                                <div><h2>Pharmacy</h2><p className="column-count">{pharmacyOrders.length} orders</p></div>
                            </div>
                            <div className="column-content">
                                {/* SLICE TO 3 */}
                                {pharmacyOrders.slice(0, 3).map(order => (
                                    <div key={order._id} className="dashboard-item">
                                        <div className="item-header">
                                            <span className="item-id">#{order._id.slice(-6).toUpperCase()}</span>
                                            <span className={`status-badge status-${order.orderStatus?.toLowerCase()}`}>{order.orderStatus}</span>
                                        </div>
                                        <div className="item-body">
                                            <h3>{order.items?.length || 0} items</h3>
                                            <div className="item-details">
                                                <span className="detail">📅 {formatDate(order.createdAt)}</span>
                                                <span className="detail"><b>Status:</b> {order.paymentStatus}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {pharmacyOrders.length === 0 && <div className="empty-state-small"><p>No orders yet</p></div>}
                            </div>
                            <div className="column-footer">
                                <Link to="/pharmacy" className="view-all-link">View Previous Orders →</Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {selectedAppointment && <PrescriptionModal appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} />}
        </div>
    );
};

export default Dashboard;
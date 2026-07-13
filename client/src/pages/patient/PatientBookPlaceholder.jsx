import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import './PatientDashboard.css';

const PatientBookPlaceholder = () => {
    const navigate = useNavigate();
    const { branding, hospitalName } = useBranding();

    return (
        <div className="patient-dashboard-layout">
            <aside className="patient-sidebar">
                <div className="patient-sidebar-logo">
                    {branding?.logoUrl ? (
                        <img src={branding.logoUrl} alt="Hospital Logo" />
                    ) : (
                        <div style={{ fontSize: '1.5rem' }}>🏥</div>
                    )}
                    <span>{hospitalName || 'Our Hospital'}</span>
                </div>
                <nav className="patient-sidebar-nav">
                    <button className="patient-nav-item" onClick={() => navigate('/patient/dashboard')}>
                        <span>📊</span> Dashboard
                    </button>
                </nav>
            </aside>

            <main className="patient-dashboard-main">
                <header className="patient-header">
                    <div className="patient-header-branding">
                        {branding?.logoUrl ? (
                            <img src={branding.logoUrl} alt="Logo" />
                        ) : (
                            <span>🏥</span>
                        )}
                        <h2>{hospitalName || 'Our Hospital'}</h2>
                    </div>
                </header>

                <div className="patient-dashboard-content">
                    <div className="patient-welcome-card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>📅</div>
                        <h3>Appointment Booking Coming Soon</h3>
                        <p style={{ color: '#64748b', fontSize: '1.1rem', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                            The online appointment booking system is currently being set up for this hospital. Once activated, you will be able to schedule consultations, choose specialists, and view available slots directly from this page.
                        </p>
                        <button className="patient-btn-book" onClick={() => navigate('/patient/dashboard')}>
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PatientBookPlaceholder;

import React, { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import './Appointment.css';

const AppointmentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const appointment = location.state?.appointment;

  useEffect(() => {
    if (!appointment) {
      navigate('/appointment');
    }
  }, [appointment, navigate]);

  if (!appointment) {
    return null;
  }

  const appointmentDate = new Date(appointment.appointmentDate);
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="appointment-page">
      <div className="content-wrapper">
        
        {/* Success Header */}
        <section className="appointment-header animate-on-scroll slide-up">
          <div className="header-content">
            <div className="success-icon" style={{ fontSize: '80px', marginBottom: '20px' }}>✅</div>
            <span className="badge" style={{ background: 'rgba(20, 195, 142, 0.2)', color: '#14c38e' }}>
              Appointment Confirmed
            </span>
            <h1>
              Appointment <span className="text-gradient">Scheduled</span>
            </h1>
            <p className="header-subtext">
              Your appointment has been successfully scheduled. We'll send you a confirmation email shortly.
            </p>
          </div>
        </section>

        {/* Appointment Details Card */}
        <section className="appointment-form-section animate-on-scroll slide-up delay-100">
          <div className="appointment-details">
            <h3 style={{ marginBottom: '24px', color: '#ffffff' }}>Appointment Details</h3>
            
            <div className="detail-row">
              <span className="detail-label">Doctor:</span>
              <span className="detail-value">{appointment.doctorName}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Date:</span>
              <span className="detail-value">{formattedDate}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Time:</span>
              <span className="detail-value">{appointment.appointmentTime}</span>
            </div>
            
            {appointment.serviceName && (
              <div className="detail-row">
                <span className="detail-label">Service:</span>
                <span className="detail-value">{appointment.serviceName}</span>
              </div>
            )}
            
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="detail-value" style={{ 
                color: appointment.status === 'confirmed' ? '#00ffab' : '#ffd700' 
              }}>
                {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Payment Status:</span>
              <span className="detail-value" style={{ 
                color: appointment.paymentStatus === 'paid' ? '#00ffab' : '#ffd700' 
              }}>
                {appointment.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
              </span>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '32px' }}>
            <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Back to Home
            </Link>
            <Link to="/lab-reports" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              View Lab Reports
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
};

export default AppointmentSuccess;














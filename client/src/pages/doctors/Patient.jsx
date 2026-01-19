import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useDoctors } from '../../store/hooks';
import { fetchDoctorAppointments, cancelAppointment } from '../../store/slices/doctorSlice';
import { logout } from '../../store/slices/authSlice';
import apiClient from '../../utils/api';
import './Patient.css';

const Patient = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { appointments, loading, error } = useDoctors();
  
  const [showAvailability, setShowAvailability] = useState(false);
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' | 'patients'
  const [patientsList, setPatientsList] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'doctor') {
      navigate('/');
      return;
    }
    dispatch(fetchDoctorAppointments());
  }, [navigate, user, dispatch]);

  // Fetch Patients when tab changes
  useEffect(() => {
    if (activeTab === 'patients') {
        const fetchPatients = async () => {
            setPatientsLoading(true);
            try {
                const response = await apiClient.get('/api/doctor/patients');
                if (response.data.success) {
                    setPatientsList(response.data.patients);
                }
            } catch (err) {
                console.error("Failed to fetch patients", err);
            } finally {
                setPatientsLoading(false);
            }
        };
        fetchPatients();
    }
  }, [activeTab]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  const handleRowClick = (appointmentId) => {
    navigate(`/doctor/patients/${appointmentId}`);
  };

  const handleCancel = (e, id) => {
    e.stopPropagation(); 
    if(window.confirm('Are you sure you want to cancel this appointment?')) {
      dispatch(cancelAppointment(id));
    }
  };

  const handleViewPrescription = (e, url) => {
      e.stopPropagation();
      window.open(url, '_blank');
  };

  const sortedAppointments = [...appointments].sort((a, b) => {
    const dateA = new Date(a.appointmentDate).getTime();
    const dateB = new Date(b.appointmentDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.appointmentTime.localeCompare(b.appointmentTime);
  });

  return (
    <div className="patient-page">
      <div className="patient-container">
        <div className="patient-header">
          <div>
            <h1>Doctor Dashboard</h1>
            <p>Manage appointments and patient prescriptions</p>
          </div>
          <div className="patient-user-info">
            <button className="availability-btn" onClick={() => setShowAvailability(!showAvailability)}>
              {showAvailability ? 'Hide Schedule' : 'Set Availability'}
            </button>
            <span style={{margin: '0 10px'}}>Dr. {user?.name}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>

        {showAvailability && (
          <div className="availability-panel">
            <h3>Update Working Hours</h3>
            <p><i>(Feature implementation placeholder)</i></p>
          </div>
        )}

        <div className="dashboard-tabs" style={{marginBottom: '20px', borderBottom: '1px solid #ddd'}}>
            <button 
                onClick={() => setActiveTab('appointments')}
                style={{
                    padding: '10px 20px', 
                    background: activeTab === 'appointments' ? '#1976d2' : 'transparent',
                    color: activeTab === 'appointments' ? 'white' : 'black',
                    border: 'none',
                    borderRadius: '5px 5px 0 0',
                    cursor: 'pointer'
                }}
            >
                Appointments
            </button>
            <button 
                onClick={() => setActiveTab('patients')}
                style={{
                    padding: '10px 20px', 
                    background: activeTab === 'patients' ? '#1976d2' : 'transparent',
                    color: activeTab === 'patients' ? 'white' : 'black',
                    border: 'none',
                    borderRadius: '5px 5px 0 0',
                    cursor: 'pointer',
                    marginLeft: '10px'
                }}
            >
                My Patients
            </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {activeTab === 'appointments' ? (
            <div className="appointments-card">
            <h2>Upcoming Appointments</h2>
            {loading ? (
                <div className="loading-message">Loading...</div>
            ) : sortedAppointments.length === 0 ? (
                <div className="empty-message">No appointments found</div>
            ) : (
                <div className="appointments-table">
                <table>
                    <thead>
                    <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Patient</th>
                        <th>Service</th>
                        <th>Prescription</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {sortedAppointments.map((app) => (
                        <tr 
                            key={app._id} 
                            onClick={() => handleRowClick(app._id)}
                            className="clickable-row"
                        >
                        <td>{new Date(app.appointmentDate).toLocaleDateString()}</td>
                        <td>{app.appointmentTime}</td>
                        <td>{app.userId?.name || 'N/A'}</td>
                        <td>{app.serviceName}</td>
                        <td>
                            {app.prescription ? (
                                <button 
                                    className="view-btn" 
                                    style={{padding: '5px 10px', backgroundColor: '#e3f2fd', border: 'none', color: '#1976d2', borderRadius: '4px', cursor: 'pointer'}}
                                    onClick={(e) => handleViewPrescription(e, app.prescription)}
                                >
                                    View
                                </button>
                            ) : <span style={{color: '#aaa'}}>-</span>}
                        </td>
                        <td>
                            <span className={`status-badge ${app.status}`}>{app.status}</span>
                        </td>
                        <td>
                            {app.status === 'pending' || app.status === 'confirmed' ? (
                            <button 
                                className="cancel-btn"
                                onClick={(e) => handleCancel(e, app._id)}
                            >
                                Cancel
                            </button>
                            ) : '-'}
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            )}
            </div>
        ) : (
            <div className="patients-list-card">
                <h2>My Patients List</h2>
                {patientsLoading ? (
                    <div className="loading-message">Loading Patients...</div>
                ) : patientsList.length === 0 ? (
                    <div className="empty-message">No patients found.</div>
                ) : (
                    <div className="appointments-table">
                         <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Last Visit</th>
                                    <th>Total Visits</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patientsList.map(p => (
                                    <tr key={p._id}>
                                        <td>{p.name}</td>
                                        <td>{p.email}</td>
                                        <td>{p.phone || 'N/A'}</td>
                                        <td>{new Date(p.lastAppointmentDate).toLocaleDateString()}</td>
                                        <td>{p.totalAppointments}</td>
                                        <td>
                                            <button 
                                                className="view-btn"
                                                style={{padding: '5px 10px', backgroundColor: '#e3f2fd', border: 'none', color: '#1976d2', borderRadius: '4px', cursor: 'pointer'}}
                                                onClick={() => handleRowClick(p.lastAppointmentId)}
                                            >
                                                History
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default Patient;
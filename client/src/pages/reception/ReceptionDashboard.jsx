import React, { useState, useEffect } from 'react';
import { receptionAPI } from '../../utils/api';
import './ReceptionDashboard.css';

const ReceptionDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Reschedule Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    console.log("Dashboard: Requesting appointments...");
    setLoading(true);
    setError(null);
    try {
      const response = await receptionAPI.getAllAppointments();
      console.log("Dashboard: Success", response);
      if (response.success) {
        setAppointments(response.appointments);
      } else {
        setError('Server responded, but failed to load data.');
      }
    } catch (err) {
      console.error("Dashboard Error:", err);
      if (err.response?.status === 404) {
        setError('404 Error: The Reception API is unreachable. (Check app.js route mounting)');
      } else if (err.response?.status === 403) {
        setError('403 Error: Access Denied. You are not logged in as "reception".');
      } else {
        setError(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await receptionAPI.cancelAppointment(id);
        fetchAppointments(); // Refresh
      } catch (err) {
        alert('Failed to cancel: ' + (err.response?.data?.message || err.message));
      }
    }
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    try {
      await receptionAPI.rescheduleAppointment(selectedAppointment._id, newDate, newTime);
      setShowModal(false);
      fetchAppointments();
      alert('Rescheduled successfully');
    } catch (err) {
      alert('Failed to reschedule: ' + (err.response?.data?.message || err.message));
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : '-';

  return (
    <div className="reception-dashboard">
      <div className="dashboard-header">
        <h1>Reception Dashboard</h1>
        <button className="refresh-btn" onClick={fetchAppointments}>
           {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-message" style={{background: '#ffebee', color: '#c62828', padding: '1rem', marginBottom: '1rem'}}>{error}</div>}

      <div className="table-container">
        <table className="reception-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Date / Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((apt) => (
              <tr key={apt._id} className={`status-${apt.status}`}>
                <td>
                    <b>{apt.userId?.name}</b><br/>
                    <small>{apt.userId?.phone}</small>
                </td>
                <td>{apt.doctorName || apt.doctorId?.name}</td>
                <td>{formatDate(apt.appointmentDate)} at {apt.appointmentTime}</td>
                <td><span className={`status-badge ${apt.status}`}>{apt.status}</span></td>
                <td>
                  {apt.status !== 'cancelled' && (
                    <>
                      <button onClick={() => {
                        setSelectedAppointment(apt);
                        setNewDate(new Date(apt.appointmentDate).toISOString().split('T')[0]);
                        setNewTime(apt.appointmentTime);
                        setShowModal(true);
                      }}>Reschedule</button>
                      <button style={{marginLeft: '10px', color: 'red'}} onClick={() => handleCancel(apt._id)}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && appointments.length === 0 && <tr><td colSpan="5">No appointments found.</td></tr>}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Reschedule Appointment</h3>
            <form onSubmit={handleRescheduleSubmit}>
              <label>New Date: <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required /></label>
              <br/>
              <label>New Time: <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} required /></label>
              <br/><br/>
              <button type="submit">Confirm</button>
              <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceptionDashboard;
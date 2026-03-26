import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import './LabDashboard.css';

const LabDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ pending: 0, completed: 0, revenue: 0, labName: 'Lab' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await labAPI.getStats();
                if (res.success) {
                    setStats(res.stats);
                }
            } catch (err) {
                console.error("Error loading stats:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="lab-dashboard">
            <div className="lab-header">
                <h1>🔬 {stats.labName} Dashboard</h1>
                <p>Manage test requests and upload reports</p>
            </div>

            <div className="lab-stats-grid">
                <div className="lab-stat-card pending" onClick={() => navigate('/lab/tests')}>
                    <h3>{stats.pending}</h3>
                    <p>Pending Requests</p>
                </div>
                <div className="lab-stat-card completed">
                    <h3>{stats.completed}</h3>
                    <p>Completed Reports</p>
                </div>
                <div className="lab-stat-card revenue">
                    <h3>₹{stats.revenue}</h3>
                    <p>Est. Revenue</p>
                </div>
            </div>

            <div className="lab-actions">
                <button className="action-btn" onClick={() => navigate('/lab/tests')}>
                    📋 View Assigned Tests
                </button>
                <button className="action-btn secondary" onClick={() => navigate('/lab/completed')}>
                    🗄️ Past Records
                </button>
            </div>
        </div>
    );
};

export default LabDashboard;
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { revenueAPI } from '../../utils/api';
import './SystemRevenueDashboard.css';

const MODEL_META = {
    per_patient: {
        label: 'Model B — Per Patient',
        short: 'Per Patient',
        color: '#6366f1',
        bg: 'rgba(99,102,241,0.12)',
        border: 'rgba(99,102,241,0.3)',
        icon: '👤',
    },
    fixed_monthly: {
        label: 'Model A — Fixed Monthly',
        short: 'Fixed Monthly',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.3)',
        icon: '📅',
    },
    per_login: {
        label: 'Model C — Per Login',
        short: 'Per Login',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.3)',
        icon: '🔑',
    },
};

const fmt = (n) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const SystemRevenueDashboard = () => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeView, setActiveView] = useState('overview'); // overview | hospitals | monthly | quarterly
    const [search, setSearch] = useState('');
    const [filterModel, setFilterModel] = useState('all');

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await revenueAPI.getSystemAnalytics();
            if (res.success) setData(res);
            else setError(res.message || 'Failed to load analytics');
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    if (loading) {
        return (
            <div className="srd-page">
                <div className="srd-loader">
                    <div className="srd-spinner" />
                    <p>Loading revenue analytics…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="srd-page">
                <div className="srd-error-box">
                    <span>⚠️</span>
                    <p>{error}</p>
                    <button onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const { summary, monthlyBreakdown = [], quarterlyBreakdown = [], hospitals = [] } = data || {};

    const maxMonthlyTotal = Math.max(...monthlyBreakdown.map(m => m.total), 1);
    const maxQuarterTotal = Math.max(...quarterlyBreakdown.map(q => q.total), 1);

    const filteredHospitals = hospitals.filter(h => {
        const matchSearch = !search || h.name.toLowerCase().includes(search.toLowerCase());
        const matchModel = filterModel === 'all' || h.revenueModel === filterModel;
        return matchSearch && matchModel;
    });

    // Annual projected revenue = last 12 months average × 12 OR sum of monthly fees × 12
    const annualProjected = monthlyBreakdown.length
        ? (monthlyBreakdown.reduce((s, m) => s + m.total, 0) / monthlyBreakdown.length) * 12
        : 0;

    const quarterlyTotal = quarterlyBreakdown.reduce((s, q) => s + q.total, 0);

    return (
        <div className="srd-page">
            <div className="srd-container">

                {/* ── Header ───────────────────────────────────── */}
                <div className="srd-header">
                    <div className="srd-header-left">
                        <button className="srd-back-btn" onClick={() => navigate('/supremeadmin')}>
                            ← Back to Dashboard
                        </button>
                        <div className="srd-brand-badge">REVENUE INTELLIGENCE</div>
                        <h1>System Revenue Analytics</h1>
                        <p>Complete financial overview of your SaaS platform across all hospitals & clinics</p>
                    </div>
                    <div className="srd-header-right">
                        <span className="srd-admin-name">{currentUser?.name}</span>
                        <button className="srd-refresh-btn" onClick={load}>↻ Refresh</button>
                    </div>
                </div>

                {/* ── Top KPI Cards ─────────────────────────────────── */}
                <div className="srd-kpi-grid">
                    <div className="srd-kpi-card srd-kpi-primary">
                        <div className="srd-kpi-icon">💰</div>
                        <div className="srd-kpi-body">
                            <p>Current Month Revenue</p>
                            <h2>{fmt(summary?.totalCurrentMonthRevenue)}</h2>
                            <span>All models combined</span>
                        </div>
                    </div>
                    <div className="srd-kpi-card">
                        <div className="srd-kpi-icon">📊</div>
                        <div className="srd-kpi-body">
                            <p>Annual Projected</p>
                            <h2>{fmt(annualProjected)}</h2>
                            <span>Based on 12-month average</span>
                        </div>
                    </div>
                    <div className="srd-kpi-card">
                        <div className="srd-kpi-icon">🏥</div>
                        <div className="srd-kpi-body">
                            <p>Total Entities</p>
                            <h2>{summary?.totalEntities || 0}</h2>
                            <span>Active hospitals & clinics</span>
                        </div>
                    </div>
                    <div className="srd-kpi-card">
                        <div className="srd-kpi-icon">📆</div>
                        <div className="srd-kpi-body">
                            <p>Last 4 Quarters</p>
                            <h2>{fmt(quarterlyTotal)}</h2>
                            <span>Total collected</span>
                        </div>
                    </div>
                </div>

                {/* ── Model Breakdown Cards ─────────────────────────── */}
                <div className="srd-model-grid">
                    {['fixed_monthly', 'per_patient', 'per_login'].map(key => {
                        const meta = MODEL_META[key];
                        const s = summary?.[key === 'fixed_monthly' ? 'fixedMonthly' : key === 'per_patient' ? 'perPatient' : 'perLogin'];
                        return (
                            <div key={key} className="srd-model-card" style={{ borderColor: meta.border, background: meta.bg }}>
                                <div className="srd-model-header">
                                    <span className="srd-model-icon">{meta.icon}</span>
                                    <div>
                                        <h3 style={{ color: meta.color }}>{meta.label}</h3>
                                        {key === 'per_login' && <span className="srd-coming-soon">Coming Soon</span>}
                                    </div>
                                </div>
                                <div className="srd-model-stats">
                                    <div className="srd-model-stat">
                                        <span>Hospitals/Clinics</span>
                                        <strong style={{ color: meta.color }}>{s?.count || 0}</strong>
                                    </div>
                                    <div className="srd-model-stat">
                                        <span>This Month</span>
                                        <strong style={{ color: meta.color }}>{fmt(s?.currentMonthRevenue)}</strong>
                                    </div>
                                </div>
                                {summary?.totalEntities > 0 && (
                                    <div className="srd-model-bar-wrap">
                                        <div className="srd-model-bar"
                                            style={{
                                                width: `${((s?.count || 0) / summary.totalEntities) * 100}%`,
                                                background: meta.color
                                            }} />
                                    </div>
                                )}
                                <p className="srd-model-pct">
                                    {summary?.totalEntities > 0
                                        ? `${(((s?.count || 0) / summary.totalEntities) * 100).toFixed(0)}% of entities`
                                        : 'No entities'}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* ── View Tabs ─────────────────────────────────────── */}
                <div className="srd-view-tabs">
                    {[
                        { id: 'overview', label: '📈 Monthly Chart' },
                        { id: 'quarterly', label: '📆 Quarterly' },
                        { id: 'hospitals', label: '🏥 All Hospitals' },
                    ].map(v => (
                        <button
                            key={v.id}
                            className={`srd-view-tab ${activeView === v.id ? 'active' : ''}`}
                            onClick={() => setActiveView(v.id)}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>

                {/* ── Monthly Chart ─────────────────────────────────── */}
                {activeView === 'overview' && (
                    <div className="srd-card">
                        <div className="srd-card-header">
                            <h2>Monthly Revenue — Last 12 Months</h2>
                            <p>Breakdown by revenue model per month</p>
                        </div>

                        <div className="srd-chart-legend">
                            {[
                                { label: 'Model A (Fixed Monthly)', color: MODEL_META.fixed_monthly.color },
                                { label: 'Model B (Per Patient)', color: MODEL_META.per_patient.color },
                            ].map(l => (
                                <span key={l.label} className="srd-legend-item">
                                    <span className="srd-legend-dot" style={{ background: l.color }} />
                                    {l.label}
                                </span>
                            ))}
                        </div>

                        <div className="srd-bar-chart">
                            {monthlyBreakdown.map((m, i) => (
                                <div key={i} className="srd-bar-col">
                                    <div className="srd-bar-amount">{fmt(m.total)}</div>
                                    <div className="srd-bar-stack" style={{ height: '160px' }}>
                                        <div
                                            className="srd-bar-seg"
                                            style={{
                                                height: `${maxMonthlyTotal > 0 ? (m.perPatient / maxMonthlyTotal) * 100 : 0}%`,
                                                background: MODEL_META.per_patient.color,
                                            }}
                                            title={`Per Patient: ${fmt(m.perPatient)}`}
                                        />
                                        <div
                                            className="srd-bar-seg"
                                            style={{
                                                height: `${maxMonthlyTotal > 0 ? (m.fixedMonthly / maxMonthlyTotal) * 100 : 0}%`,
                                                background: MODEL_META.fixed_monthly.color,
                                            }}
                                            title={`Fixed Monthly: ${fmt(m.fixedMonthly)}`}
                                        />
                                    </div>
                                    <div className="srd-bar-label">{m.label}</div>
                                </div>
                            ))}
                        </div>

                        {monthlyBreakdown.length === 0 && (
                            <p className="srd-empty">No monthly data available yet.</p>
                        )}

                        {/* Monthly table */}
                        <div className="srd-table-wrap" style={{ marginTop: '24px' }}>
                            <table className="srd-table">
                                <thead>
                                    <tr>
                                        <th>Month</th>
                                        <th>Model A (Fixed)</th>
                                        <th>Model B (Per Patient)</th>
                                        <th>Model C (Per Login)</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthlyBreakdown.map((m, i) => (
                                        <tr key={i}>
                                            <td><strong>{m.label}</strong></td>
                                            <td>{fmt(m.fixedMonthly)}</td>
                                            <td>{fmt(m.perPatient)}</td>
                                            <td className="srd-muted">—</td>
                                            <td><strong>{fmt(m.total)}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Quarterly View ────────────────────────────────── */}
                {activeView === 'quarterly' && (
                    <div className="srd-card">
                        <div className="srd-card-header">
                            <h2>Quarterly Revenue Breakdown</h2>
                            <p>Revenue summaries across last 4 quarters</p>
                        </div>

                        <div className="srd-quarterly-grid">
                            {quarterlyBreakdown.map((q, i) => (
                                <div key={i} className="srd-quarter-card">
                                    <div className="srd-quarter-label">{q.label}</div>
                                    <div className="srd-quarter-amount">{fmt(q.total)}</div>
                                    <div className="srd-quarter-bar-wrap">
                                        <div
                                            className="srd-quarter-bar"
                                            style={{ width: `${maxQuarterTotal > 0 ? (q.total / maxQuarterTotal) * 100 : 0}%` }}
                                        />
                                    </div>
                                    <div className="srd-quarter-pct">
                                        {maxQuarterTotal > 0 ? `${((q.total / maxQuarterTotal) * 100).toFixed(0)}% of peak quarter` : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="srd-quarterly-summary">
                            <div className="srd-qs-item">
                                <span>Total (Last 4 Quarters)</span>
                                <strong>{fmt(quarterlyTotal)}</strong>
                            </div>
                            <div className="srd-qs-item">
                                <span>Average per Quarter</span>
                                <strong>{fmt(quarterlyTotal / (quarterlyBreakdown.length || 1))}</strong>
                            </div>
                            <div className="srd-qs-item">
                                <span>Best Quarter</span>
                                <strong>{quarterlyBreakdown.reduce((best, q) => q.total > (best.total || 0) ? q : best, {}).label || '—'}</strong>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── All Hospitals ─────────────────────────────────── */}
                {activeView === 'hospitals' && (
                    <div className="srd-card">
                        <div className="srd-card-header">
                            <h2>All Hospitals & Clinics</h2>
                            <p>Revenue model, rate, and current month charge for each entity</p>
                        </div>

                        <div className="srd-filters">
                            <input
                                className="srd-search"
                                placeholder="Search by name…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <select className="srd-select" value={filterModel} onChange={e => setFilterModel(e.target.value)}>
                                <option value="all">All Models</option>
                                <option value="fixed_monthly">Model A — Fixed Monthly</option>
                                <option value="per_patient">Model B — Per Patient</option>
                                <option value="per_login">Model C — Per Login</option>
                            </select>
                        </div>

                        <div className="srd-table-wrap">
                            <table className="srd-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Revenue Model</th>
                                        <th>Rate / Fee</th>
                                        <th>This Month Charge</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHospitals.length === 0 && (
                                        <tr><td colSpan={7} className="srd-empty-td">No results found.</td></tr>
                                    )}
                                    {filteredHospitals.map((h, i) => {
                                        const meta = MODEL_META[h.revenueModel] || MODEL_META.per_patient;
                                        return (
                                            <tr key={h._id}>
                                                <td className="srd-muted">{i + 1}</td>
                                                <td><strong>{h.name}</strong></td>
                                                <td>
                                                    <span className={`srd-type-badge ${h.clinicType}`}>
                                                        {h.clinicType === 'hospital' ? '🏥 Hospital' : '🏪 Clinic'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="srd-model-badge" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                                        {meta.icon} {meta.short}
                                                    </span>
                                                </td>
                                                <td>{h.rateLabel || '—'}</td>
                                                <td><strong>{fmt(h.currentCharge)}</strong></td>
                                                <td>
                                                    <button
                                                        className="srd-manage-btn"
                                                        onClick={() => navigate('/supremeadmin', { state: { openTab: 'revenue-plans', hospitalId: h._id } })}
                                                    >
                                                        Manage Plan
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default SystemRevenueDashboard;

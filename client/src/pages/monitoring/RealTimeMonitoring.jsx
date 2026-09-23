import React, { useState, useMemo, useCallback } from 'react';
import {
  FiActivity, FiSearch, FiBell, FiUser, FiUsers,
  FiAlertTriangle, FiAlertCircle, FiCheckCircle,
  FiHeart, FiThermometer, FiDroplet, FiWind,
  FiCpu, FiMonitor, FiZap, FiVolume2, FiVolumeX,
  FiClock, FiFileText, FiLayers, FiCheck
} from 'react-icons/fi';
import {
  MOCK_PATIENTS,
  MOCK_DEVICES,
  MOCK_VITALS,
  DEFAULT_VITALS,
  MOCK_ALERTS,
  MOCK_ECG_DATA,
  MOCK_PLETH_DATA,
  MOCK_PATIENT_NOTES,
  MOCK_TELEMETRY_HISTORY,
  MOCK_DEVICE_TRENDS,
  DEFAULT_DEVICE_TRENDS,
  WARD_OPTIONS,
  DEVICE_TYPE_LABELS,
  getMonitoringSummary,
} from './monitoringMockData';
import './RealTimeMonitoring.css';

// ═══════════════════════════════════════════════════════════════
// HELPER: Patient initials
// ═══════════════════════════════════════════════════════════════
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
};

// ═══════════════════════════════════════════════════════════════
// HELPER: Format admitted date
// ═══════════════════════════════════════════════════════════════
const formatAdmittedDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${hours}:${mins} ${ampm}`;
};

// ═══════════════════════════════════════════════════════════════
// SVG Sparkline (clean micro trend line)
// ═══════════════════════════════════════════════════════════════
const Sparkline = ({ data, color = '#0d9488', width = 50, height = 16 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="rtm-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════
// MONITORING HEADER (Compact bar)
// ═══════════════════════════════════════════════════════════════
const MonitoringHeader = ({
  ward,
  setWard,
  searchQuery,
  setSearchQuery,
  soundMuted,
  setSoundMuted,
}) => (
  <div className="rtm-header">
    <div className="rtm-header-left">
      <div className="rtm-header-icon-badge">
        <FiActivity size={18} />
      </div>
      <div className="rtm-header-title-wrap">
        <h1>
          Real-Time Monitoring
          <span className="rtm-live-badge">
            <span className="rtm-live-dot" />
            LIVE
          </span>
        </h1>
        <p className="rtm-header-subtitle">
          Continuous patient vitals & connected telemetry surveillance
        </p>
      </div>
    </div>
    <div className="rtm-header-right">
      <select
        className="rtm-ward-select"
        value={ward}
        onChange={(e) => setWard(e.target.value)}
      >
        {WARD_OPTIONS.map(w => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>
      <div className="rtm-search-box">
        <FiSearch size={13} className="rtm-search-icon" />
        <input
          type="text"
          placeholder="Search patient / MRN / bed..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <button
        className="rtm-header-icon-btn"
        title={soundMuted ? 'Unmute Alarms' : 'Mute Alarms'}
        onClick={() => setSoundMuted(!soundMuted)}
      >
        {soundMuted ? <FiVolumeX size={15} style={{ color: '#ef4444' }} /> : <FiVolume2 size={15} />}
      </button>
      <button className="rtm-header-icon-btn" title="Alert Notifications">
        <FiBell size={15} />
        <span className="rtm-notif-dot" />
      </button>
    </div>
  </div>
);


// ═══════════════════════════════════════════════════════════════
// SUMMARY CARDS (Compact 5-stat KPI row)
// ═══════════════════════════════════════════════════════════════
const MonitoringSummary = ({ summary }) => (
  <div className="rtm-summary-row">
    <div className="rtm-summary-card">
      <div className="rtm-summary-icon total"><FiUsers size={16} /></div>
      <div className="rtm-summary-info">
        <span className="rtm-summary-value">{summary.total}</span>
        <span className="rtm-summary-label">Monitored</span>
      </div>
    </div>
    <div className="rtm-summary-card">
      <div className="rtm-summary-icon stable"><FiCheckCircle size={16} /></div>
      <div className="rtm-summary-info">
        <span className="rtm-summary-value">{summary.stable}</span>
        <span className="rtm-summary-label">Stable</span>
      </div>
    </div>
    <div className="rtm-summary-card">
      <div className="rtm-summary-icon attention"><FiAlertTriangle size={16} /></div>
      <div className="rtm-summary-info">
        <span className="rtm-summary-value">{summary.attention}</span>
        <span className="rtm-summary-label">Attention</span>
      </div>
    </div>
    <div className="rtm-summary-card">
      <div className="rtm-summary-icon critical"><FiAlertCircle size={16} /></div>
      <div className="rtm-summary-info">
        <span className="rtm-summary-value">{summary.critical}</span>
        <span className="rtm-summary-label">Critical</span>
      </div>
    </div>
    <div className="rtm-summary-card">
      <div className="rtm-summary-icon devices"><FiCpu size={16} /></div>
      <div className="rtm-summary-info">
        <span className="rtm-summary-value">{summary.devicesOnline} / {summary.devicesTotal}</span>
        <span className="rtm-summary-label">Devices Online</span>
      </div>
    </div>
  </div>
);


// ═══════════════════════════════════════════════════════════════
// PATIENT CARD (Left panel item)
// ═══════════════════════════════════════════════════════════════
const MonitoringPatientCard = ({ patient, isSelected, onClick }) => {
  const patientVitals = MOCK_VITALS[patient.id] || DEFAULT_VITALS;

  return (
    <div
      className={`rtm-patient-card status-${patient.status} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="rtm-pc-top">
        <div className="rtm-pc-avatar">{getInitials(patient.name)}</div>
        <div className="rtm-pc-info">
          <p className="rtm-pc-name">{patient.name}</p>
          <p className="rtm-pc-meta">{patient.age}Y • {patient.gender} • <span className="rtm-pc-mrn">{patient.mrn}</span></p>
        </div>
      </div>
      <div className="rtm-pc-location">
        {patient.ward} <span className="rtm-pc-location-dot" /> {patient.bed}
        <span style={{ marginLeft: 'auto', fontSize: '0.66rem', color: patient.status === 'critical' ? '#dc2626' : '#64748b', fontWeight: 700 }}>
          HR: {patientVitals.heartRate.value} | SpO₂: {patientVitals.spo2.value}%
        </span>
      </div>
      <div className="rtm-pc-bottom">
        <div className="rtm-pc-devices">
          {patient.devices.map(d => (
            <span key={d} className="rtm-device-tag">{DEVICE_TYPE_LABELS[d] || d}</span>
          ))}
        </div>
        <span className={`rtm-status-badge ${patient.status}`}>
          {patient.status}
        </span>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// PATIENT LIST (Left Column)
// ═══════════════════════════════════════════════════════════════
const MonitoringPatientList = ({
  patients,
  selectedId,
  onSelect,
  statusFilter,
  setStatusFilter,
  listSearch,
  setListSearch,
}) => {
  const filtered = useMemo(() => {
    let list = patients;
    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.bed.toLowerCase().includes(q) ||
        p.ward.toLowerCase().includes(q)
      );
    }
    return list;
  }, [patients, statusFilter, listSearch]);

  return (
    <div className="rtm-patient-panel">
      <div className="rtm-patient-panel-header">
        <div className="rtm-patient-panel-header-top">
          <h3>Patients <span>({patients.length})</span></h3>
        </div>
        <div className="rtm-patient-search">
          <FiSearch size={12} className="rtm-ps-icon" />
          <input
            type="text"
            placeholder="Search patient / bed..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </div>
        <div className="rtm-status-filters">
          {['all', 'critical', 'attention', 'stable'].map(s => (
            <button
              key={s}
              className={`rtm-status-filter-btn ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="rtm-patient-list">
        {filtered.length === 0 ? (
          <div style={{ padding: '24px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.76rem' }}>
            No patients match filter
          </div>
        ) : (
          filtered.map(p => (
            <MonitoringPatientCard
              key={p.id}
              patient={p}
              isSelected={selectedId === p.id}
              onClick={() => onSelect(p.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// VITAL CARD
// ═══════════════════════════════════════════════════════════════
const VITAL_ICONS = {
  heartRate: FiHeart,
  spo2: FiDroplet,
  bloodPressure: FiActivity,
  temperature: FiThermometer,
};

const VITAL_LABELS = {
  heartRate: 'Heart Rate',
  spo2: 'SpO₂',
  bloodPressure: 'Blood Pressure',
  temperature: 'Temperature',
};

const VITAL_NORMALS = {
  heartRate: '60-100',
  spo2: '95-100%',
  bloodPressure: '90-120/60-80',
  temperature: '97.0-99.0 °F',
};

const VITAL_SPARKLINE_COLORS = {
  high: '#ef4444',
  low: '#f59e0b',
  normal: '#10b981',
};

const VitalCard = ({ vitalKey, vital }) => {
  const IconComp = VITAL_ICONS[vitalKey] || FiActivity;
  const label = VITAL_LABELS[vitalKey] || vitalKey;
  const normalRange = VITAL_NORMALS[vitalKey] || '';

  return (
    <div className={`rtm-vital-card status-${vital.status}`}>
      <div className="rtm-vc-header">
        <span className="rtm-vc-label">{label}</span>
        <div className={`rtm-vc-icon ${vital.status}`}>
          <IconComp size={12} />
        </div>
      </div>
      <div className="rtm-vc-value-row">
        <span className="rtm-vc-value">{vital.value}</span>
        <span className="rtm-vc-unit">{vital.unit}</span>
      </div>
      <div className="rtm-vc-bottom">
        <span className={`rtm-vc-status ${vital.status}`}>{vital.status}</span>
        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Target: {normalRange}</span>
        <Sparkline
          data={vital.trend}
          color={VITAL_SPARKLINE_COLORS[vital.status] || '#0d9488'}
          width={46}
          height={15}
        />
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// DUAL-CHANNEL REAL-TIME TELEMETRY WAVEFORM
// ═══════════════════════════════════════════════════════════════
const LiveWaveform = ({ heartRate, spo2 = 98 }) => {
  const svgWidth = 900;
  const ecgHeight = 70;
  const plethHeight = 38;

  // ECG polyline
  const ecgData = [...MOCK_ECG_DATA, ...MOCK_ECG_DATA];
  const ecgStepX = svgWidth / (ecgData.length / 2);
  const ecgPoints = ecgData.map((v, i) => {
    const x = i * ecgStepX;
    const y = (ecgHeight / 2) - v * 26;
    return `${x},${y}`;
  }).join(' ');

  // Pleth polyline
  const plethData = [...MOCK_PLETH_DATA, ...MOCK_PLETH_DATA];
  const plethStepX = svgWidth / (plethData.length / 2);
  const plethPoints = plethData.map((v, i) => {
    const x = i * plethStepX;
    const y = plethHeight - v * 30 - 4;
    return `${x},${y}`;
  }).join(' ');

  const ecgStatusLabel = heartRate > 100 ? 'Sinus Tachycardia' : heartRate < 60 ? 'Sinus Bradycardia' : 'Normal Sinus Rhythm';
  const isAbnormal = heartRate > 100 || heartRate < 60;

  return (
    <div className="rtm-waveform-section">
      <div className="rtm-waveform-header">
        <div className="rtm-waveform-header-left">
          <h4>
            <FiActivity size={14} style={{ color: '#22d3ee' }} />
            Telemetry Waveform
          </h4>
          <span className="rtm-waveform-lead-info">Lead II • 25 mm/s • 10 mm/mV • Filter: ON</span>
        </div>
        <div className="rtm-waveform-stats">
          <div className="rtm-waveform-bpm">
            <FiHeart size={13} style={{ color: '#ef4444', animation: 'rtmPulse 1s infinite' }} />
            {heartRate}<span>bpm</span>
          </div>
          <span className={`rtm-waveform-status ${isAbnormal ? 'abnormal' : 'normal'}`}>
            {ecgStatusLabel}
          </span>
        </div>
      </div>

      <div className="rtm-waveforms-container">
        {/* Channel 1: ECG */}
        <div className="rtm-single-wave-channel">
          <span className="rtm-channel-label">ECG II</span>
          <svg
            className="rtm-ecg-canvas"
            viewBox={`0 0 ${svgWidth} ${ecgHeight}`}
            preserveAspectRatio="none"
          >
            {[0.25, 0.5, 0.75].map(frac => (
              <line
                key={frac}
                x1="0" y1={ecgHeight * frac}
                x2={svgWidth * 2} y2={ecgHeight * frac}
                className="rtm-ecg-grid-line"
              />
            ))}
            <g className="rtm-ecg-animated">
              <polyline points={ecgPoints} className="rtm-ecg-line" />
            </g>
          </svg>
        </div>

        {/* Channel 2: SpO2 Plethysmogram */}
        <div className="rtm-single-wave-channel">
          <span className="rtm-channel-label" style={{ color: '#34d399' }}>PLETH (SpO₂ {spo2}%)</span>
          <svg
            className="rtm-pleth-canvas"
            viewBox={`0 0 ${svgWidth} ${plethHeight}`}
            preserveAspectRatio="none"
          >
            {[0.5].map(frac => (
              <line
                key={frac}
                x1="0" y1={plethHeight * frac}
                x2={svgWidth * 2} y2={plethHeight * frac}
                className="rtm-ecg-grid-line"
              />
            ))}
            <g className="rtm-ecg-animated">
              <polyline points={plethPoints} className="rtm-pleth-line" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// ADDITIONAL CLINICAL PARAMETERS (RR, MAP, EtCO2, Blood Sugar)
// ═══════════════════════════════════════════════════════════════
const ADDITIONAL_PARAM_CONFIG = [
  { key: 'respRate', label: 'Respiratory Rate' },
  { key: 'map', label: 'Mean Art. (MAP)' },
  { key: 'etco2', label: 'EtCO₂' },
  { key: 'bloodSugar', label: 'Blood Glucose' },
];

const AdditionalParams = ({ vitals }) => (
  <div className="rtm-additional-params">
    {ADDITIONAL_PARAM_CONFIG.map(({ key, label }) => {
      const v = vitals[key];
      if (!v) return null;
      return (
        <div key={key} className="rtm-add-param-card">
          <div className="rtm-apc-label">{label}</div>
          <div>
            <span className="rtm-apc-value">{v.value}</span>
            <span className="rtm-apc-unit">{v.unit}</span>
          </div>
          <span className={`rtm-apc-status ${v.status}`}>{v.status}</span>
          <div className="rtm-apc-sparkline">
            <Sparkline
              data={v.trend}
              color={VITAL_SPARKLINE_COLORS[v.status] || '#0d9488'}
              width={42}
              height={14}
            />
          </div>
        </div>
      );
    })}
  </div>
);


// ═══════════════════════════════════════════════════════════════
// PATIENT LIVE MONITOR (Center Column)
// ═══════════════════════════════════════════════════════════════
const PatientLiveMonitor = ({ patient, devices }) => {
  const [activeTab, setActiveTab] = useState('live');
  const [alarmSilenced, setAlarmSilenced] = useState(false);
  const vitals = MOCK_VITALS[patient.id] || DEFAULT_VITALS;
  const notes = MOCK_PATIENT_NOTES[patient.id] || [];
  const telemetryHistory = MOCK_TELEMETRY_HISTORY[patient.id] || [];
  const primaryVitals = ['heartRate', 'spo2', 'bloodPressure', 'temperature'];

  return (
    <div className="rtm-center-panel">
      {/* Patient header */}
      <div className="rtm-patient-detail-header">
        <div className="rtm-pdh-left">
          <div className="rtm-pdh-avatar">{getInitials(patient.name)}</div>
          <div className="rtm-pdh-info">
            <h2>
              {patient.name}
              <span className={`rtm-status-badge ${patient.status}`}>{patient.status}</span>
            </h2>
            <div className="rtm-pdh-meta">
              <span><strong>MRN:</strong> {patient.mrn}</span>
              <span className="rtm-meta-sep">•</span>
              <span>{patient.age} Yrs ({patient.gender})</span>
              <span className="rtm-meta-sep">•</span>
              <span><strong>{patient.ward}</strong>, {patient.bed}</span>
              <span className="rtm-meta-sep">•</span>
              <span>Admitted: {formatAdmittedDate(patient.admittedAt)}</span>
            </div>
          </div>
        </div>
        <div className="rtm-pdh-right">
          <button
            className="rtm-btn-secondary"
            onClick={() => setAlarmSilenced(!alarmSilenced)}
            title="Silence current patient alarm"
          >
            {alarmSilenced ? (
              <><FiCheck size={12} style={{ color: '#10b981' }} /> Silenced</>
            ) : (
              <><FiVolumeX size={12} /> Silence Alarm</>
            )}
          </button>
          <button className="rtm-btn-secondary">
            <FiUser size={12} /> View Profile
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rtm-tabs">
        <button
          className={`rtm-tab ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          <FiActivity size={13} /> Live Monitoring
        </button>
        <button
          className={`rtm-tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          <FiCpu size={13} /> Devices ({devices.length})
        </button>
        <button
          className={`rtm-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <FiClock size={13} /> Telemetry Log
        </button>
        <button
          className={`rtm-tab ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          <FiFileText size={13} /> Clinical Notes ({notes.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="rtm-live-content">
        {activeTab === 'live' && (
          <>
            {/* Live Vital Signs Grid */}
            <div className="rtm-section-title">
              <h3>
                <FiHeart size={13} style={{ color: '#ef4444' }} />
                Primary Vital Signs
              </h3>
            </div>
            <div className="rtm-vitals-grid">
              {primaryVitals.map(key => (
                <VitalCard key={key} vitalKey={key} vital={vitals[key]} />
              ))}
            </div>

            {/* Dual Channel Waveform */}
            <LiveWaveform
              heartRate={vitals.heartRate.value}
              spo2={vitals.spo2.value}
            />

            {/* Additional Parameters */}
            <div className="rtm-section-title">
              <h3>Secondary Parameters</h3>
            </div>
            <AdditionalParams vitals={vitals} />
          </>
        )}

        {activeTab === 'devices' && (
          <div style={{ padding: '6px 0' }}>
            <div className="rtm-section-title">
              <h3>Assigned Telemetry Devices</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {devices.map(d => (
                <div key={d.id} className="rtm-device-card" style={{ padding: '10px' }}>
                  <div className="rtm-dc-top">
                    <div className="rtm-dc-left">
                      <div className="rtm-dc-icon" style={{ width: '32px', height: '32px', fontSize: '1rem' }}>
                        <DeviceIcon type={d.type} />
                      </div>
                      <div>
                        <p className="rtm-dc-name" style={{ fontSize: '0.82rem' }}>{d.name}</p>
                        <p className="rtm-dc-model">{d.model}</p>
                      </div>
                    </div>
                    <div className="rtm-dc-status-wrap">
                      <span className={`rtm-dc-status ${d.status}`}>
                        <span className="rtm-dc-status-dot" />
                        {d.status}
                      </span>
                      <span className="rtm-dc-battery">Battery: {d.battery}%</span>
                    </div>
                  </div>
                  <div className="rtm-dc-location" style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                    <span>Location: {d.ward} • {d.bed}</span>
                    <span style={{ marginLeft: 'auto', color: '#0d9488', fontWeight: 600 }}>Streaming Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ padding: '4px 0' }}>
            <div className="rtm-section-title">
              <h3>Recent Vital Log Entries</h3>
            </div>
            {telemetryHistory.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '20px' }}>
                No prior telemetry history recorded for today.
              </p>
            ) : (
              <table className="rtm-history-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Heart Rate</th>
                    <th>SpO₂</th>
                    <th>Blood Pressure</th>
                    <th>Temp</th>
                    <th>Resp Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetryHistory.map((row, i) => (
                    <tr key={i}>
                      <td><strong>{row.time}</strong></td>
                      <td>{row.hr}</td>
                      <td>{row.spo2}</td>
                      <td>{row.bp}</td>
                      <td>{row.temp}</td>
                      <td>{row.rr}</td>
                      <td>
                        <span className={`rtm-status-badge ${row.status}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={{ padding: '4px 0' }}>
            <div className="rtm-section-title">
              <h3>Doctor & Nurse Clinical Notes</h3>
            </div>
            <div className="rtm-notes-list">
              {notes.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '20px' }}>
                  No clinical notes recorded for this shift.
                </p>
              ) : (
                notes.map(n => (
                  <div key={n.id} className="rtm-note-card">
                    <div className="rtm-note-header">
                      <span className="rtm-note-author">{n.author}</span>
                      <span className="rtm-note-time">{n.time}</span>
                    </div>
                    <p className="rtm-note-text">{n.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// DEVICE ICON by type
// ═══════════════════════════════════════════════════════════════
const DeviceIcon = ({ type }) => {
  switch (type) {
    case 'ecg': return <FiHeart size={14} />;
    case 'ventilator': return <FiWind size={14} />;
    case 'spo2': return <FiDroplet size={14} />;
    case 'infusion': return <FiZap size={14} />;
    case 'monitor': return <FiMonitor size={14} />;
    default: return <FiCpu size={14} />;
  }
};


// ═══════════════════════════════════════════════════════════════
// DEVICE CARD (Right column)
// ═══════════════════════════════════════════════════════════════
const DeviceCard = ({ device }) => (
  <div className="rtm-device-card">
    <div className="rtm-dc-top">
      <div className="rtm-dc-left">
        <div className="rtm-dc-icon">
          <DeviceIcon type={device.type} />
        </div>
        <div>
          <p className="rtm-dc-name">{device.name}</p>
          <p className="rtm-dc-model">{device.model}</p>
        </div>
      </div>
      <div className="rtm-dc-status-wrap">
        <span className={`rtm-dc-status ${device.status}`}>
          <span className="rtm-dc-status-dot" />
          {device.status}
        </span>
        <span className="rtm-dc-battery">{device.battery}%</span>
      </div>
    </div>
    <div className="rtm-dc-location">
      {device.ward} <span className="rtm-dc-location-dot" /> {device.bed}
    </div>
  </div>
);


// ═══════════════════════════════════════════════════════════════
// CONNECTED DEVICES SECTION
// ═══════════════════════════════════════════════════════════════
const ConnectedDevices = ({ devices }) => (
  <div className="rtm-device-section">
    <div className="rtm-device-section-header">
      <h3>Connected Devices <span>({devices.length})</span></h3>
    </div>
    <div className="rtm-device-list">
      {devices.length === 0 ? (
        <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '0.74rem' }}>
          No devices connected
        </div>
      ) : (
        devices.map(d => <DeviceCard key={d.id} device={d} />)
      )}
    </div>
  </div>
);


// ═══════════════════════════════════════════════════════════════
// DEVICE TREND CHART (SVG line chart)
// ═══════════════════════════════════════════════════════════════
const TREND_COLORS = {
  heartRate: '#ef4444',
  spo2: '#0ea5e9',
  bpSystolic: '#8b5cf6',
  temperature: '#f59e0b',
};

const TREND_LABELS = {
  heartRate: 'HR',
  spo2: 'SpO₂',
  bpSystolic: 'BP',
  temperature: 'Temp',
};

const DeviceTrendChart = ({ patientId }) => {
  const trends = MOCK_DEVICE_TRENDS[patientId] || DEFAULT_DEVICE_TRENDS;
  const svgWidth = 260;
  const svgHeight = 65;
  const padX = 4;
  const padY = 6;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;

  const buildLine = (data, minVal, maxVal) => {
    const range = maxVal - minVal || 1;
    return data.map((v, i) => {
      const x = padX + (i / (data.length - 1)) * chartW;
      const y = padY + chartH - ((v - minVal) / range) * chartH;
      return `${x},${y}`;
    }).join(' ');
  };

  const trendKeys = ['heartRate', 'spo2', 'bpSystolic', 'temperature'];

  return (
    <div className="rtm-trend-section">
      <div className="rtm-trend-header">
        <h3>Device Reading Trend</h3>
        <span className="rtm-trend-time">1 Hour</span>
      </div>
      <div className="rtm-trend-chart-area">
        <div className="rtm-trend-legend">
          {trendKeys.map(k => (
            <span key={k} className="rtm-trend-legend-item">
              <span className="rtm-trend-legend-color" style={{ background: TREND_COLORS[k] }} />
              {TREND_LABELS[k]}
            </span>
          ))}
        </div>
        <svg className="rtm-trend-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map(frac => (
            <line
              key={frac}
              x1={padX} y1={padY + chartH * frac}
              x2={svgWidth - padX} y2={padY + chartH * frac}
              stroke="#f1f5f9"
              strokeWidth="0.5"
            />
          ))}
          {trendKeys.map(k => {
            const data = trends[k];
            if (!data || data.length < 2) return null;
            const min = Math.min(...data);
            const max = Math.max(...data);
            return (
              <polyline
                key={k}
                points={buildLine(data, min, max)}
                className="rtm-trend-line"
                stroke={TREND_COLORS[k]}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// ALERT ITEM
// ═══════════════════════════════════════════════════════════════
const AlertItem = ({ alert, patientName }) => (
  <div className="rtm-alert-item">
    <span className={`rtm-alert-dot ${alert.status}`} />
    <div className="rtm-alert-content">
      <p className="rtm-alert-msg">{alert.message}</p>
      <div className="rtm-alert-meta">
        <span className="rtm-alert-time">{alert.time}</span>
        <span>• {patientName}</span>
        <span className={`rtm-alert-status-tag ${alert.status}`}>{alert.status}</span>
      </div>
    </div>
  </div>
);


// ═══════════════════════════════════════════════════════════════
// RECENT ALERTS SECTION
// ═══════════════════════════════════════════════════════════════
const RecentAlerts = ({ alerts, patientName }) => (
  <div className="rtm-alerts-section">
    <div className="rtm-alerts-header">
      <h3>Active Alerts</h3>
    </div>
    <div className="rtm-alerts-list">
      {alerts.length === 0 ? (
        <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '0.74rem' }}>
          No active alerts
        </div>
      ) : (
        alerts.map(a => (
          <AlertItem key={a.id} alert={a} patientName={patientName} />
        ))
      )}
    </div>
    {alerts.length > 0 && (
      <button className="rtm-view-all-btn">View All Alerts</button>
    )}
  </div>
);


// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function RealTimeMonitoring() {
  const [selectedPatientId, setSelectedPatientId] = useState(MOCK_PATIENTS[0]?.id || null);
  const [headerWard, setHeaderWard] = useState('All Wards');
  const [headerSearch, setHeaderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [listSearch, setListSearch] = useState('');
  const [soundMuted, setSoundMuted] = useState(false);

  // Filter patients by header ward + header search
  const filteredPatients = useMemo(() => {
    let list = MOCK_PATIENTS;
    if (headerWard !== 'All Wards') {
      list = list.filter(p => p.ward === headerWard);
    }
    if (headerSearch.trim()) {
      const q = headerSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.bed.toLowerCase().includes(q)
      );
    }
    return list;
  }, [headerWard, headerSearch]);

  const selectedPatient = useMemo(
    () => MOCK_PATIENTS.find(p => p.id === selectedPatientId) || null,
    [selectedPatientId]
  );

  const patientDevices = useMemo(
    () => selectedPatientId ? MOCK_DEVICES.filter(d => d.patientId === selectedPatientId) : [],
    [selectedPatientId]
  );

  const patientAlerts = useMemo(
    () => selectedPatientId ? (MOCK_ALERTS[selectedPatientId] || []) : [],
    [selectedPatientId]
  );

  const summary = useMemo(() => getMonitoringSummary(filteredPatients), [filteredPatients]);

  const handleSelectPatient = useCallback((id) => {
    setSelectedPatientId(id);
  }, []);

  return (
    <div className="rtm-page">
      {/* Header */}
      <MonitoringHeader
        ward={headerWard}
        setWard={setHeaderWard}
        searchQuery={headerSearch}
        setSearchQuery={setHeaderSearch}
        soundMuted={soundMuted}
        setSoundMuted={setSoundMuted}
      />

      {/* Summary KPI row */}
      <MonitoringSummary summary={summary} />

      {/* 3-column workspace */}
      <div className="rtm-main-layout">
        {/* LEFT: Patient list */}
        <MonitoringPatientList
          patients={filteredPatients}
          selectedId={selectedPatientId}
          onSelect={handleSelectPatient}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          listSearch={listSearch}
          setListSearch={setListSearch}
        />

        {/* CENTER: Selected patient live monitor */}
        {selectedPatient ? (
          <PatientLiveMonitor
            patient={selectedPatient}
            devices={patientDevices}
          />
        ) : (
          <div className="rtm-center-panel">
            <div className="rtm-no-selection">
              <div className="rtm-no-selection-icon">
                <FiActivity size={24} />
              </div>
              <h3>Select a Patient</h3>
              <p>Choose a patient from the left panel to begin telemetry monitoring.</p>
            </div>
          </div>
        )}

        {/* RIGHT: Devices + Trends + Alerts */}
        <div className="rtm-right-panel">
          <ConnectedDevices devices={patientDevices} />
          {selectedPatient && (
            <DeviceTrendChart patientId={selectedPatient.id} />
          )}
          <RecentAlerts
            alerts={patientAlerts}
            patientName={selectedPatient?.name || ''}
          />
        </div>
      </div>
    </div>
  );
}

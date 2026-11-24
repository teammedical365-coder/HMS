import React, { useRef } from 'react';
import { FiPrinter, FiX, FiCheckCircle, FiClock, FiFileText, FiTag } from 'react-icons/fi';
import './LabOrderSlipModal.css';

const LabOrderSlipModal = ({ isOpen, onClose, order, isTokenOnly = false }) => {
    const printAreaRef = useRef(null);

    if (!isOpen || !order) return null;

    const patient = order.patientSnapshot || order.patient || {};
    const pricing = order.pricing || {};
    const placeholders = order.samplePlaceholders || [];
    const tests = order.tests || [];
    const packages = order.packages || [];
    const hospital = order.hospital || { name: 'Medical365 Laboratory Diagnostics' };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="lmd-slip-overlay" onClick={onClose}>
            <div className="lmd-slip-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* Header Controls (Hidden during print) */}
                <div className="lmd-slip-hdr no-print">
                    <div className="lmd-slip-hdr-title">
                        <FiPrinter /> {isTokenOnly ? 'Reception Queue Token Slip' : 'Laboratory Order Requisition Slip'}
                    </div>
                    <div className="lmd-slip-hdr-actions">
                        <button className="lmd-slip-btn-print" onClick={handlePrint}>
                            <FiPrinter /> Print {isTokenOnly ? 'Token' : 'Order Slip'}
                        </button>
                        <button className="lmd-slip-btn-close" onClick={onClose} title="Close">
                            <FiX />
                        </button>
                    </div>
                </div>

                {/* Printable Slip Area */}
                <div className="lmd-printable-document" ref={printAreaRef}>
                    {isTokenOnly ? (
                        /* ================= TOKEN ONLY SLIP ================= */
                        <div className="lmd-token-ticket">
                            <div className="lmd-ticket-hdr">
                                <h2>{hospital.name || 'Medical365 Diagnostic Lab'}</h2>
                                <p className="sub">RECEPTION QUEUE TOKEN</p>
                            </div>
                            <div className="lmd-ticket-token-box">
                                <span className="token-label">TOKEN NUMBER</span>
                                <span className="token-number">#{order.tokenNumber || '1'}</span>
                            </div>
                            <div className="lmd-ticket-info-grid">
                                <div><strong>Order No:</strong> {order.orderNumber}</div>
                                <div><strong>Date:</strong> {new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN')}</div>
                                <div><strong>Time:</strong> {new Date(order.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                <div><strong>Patient:</strong> {patient.name}</div>
                                <div><strong>UHID:</strong> {patient.uhid || patient.mrn || '—'}</div>
                                <div><strong>Priority:</strong> <span className={`priority-tag ${order.priority?.toLowerCase()}`}>{order.priority}</span></div>
                            </div>
                            <div className="lmd-ticket-footer">
                                <p>Please wait for your token to be called for sample collection.</p>
                                <p className="small">Medical365 LMS • Accurate • Reliable • Secure</p>
                            </div>
                        </div>
                    ) : (
                        /* ================= FULL ORDER REQUISITION SLIP ================= */
                        <div className="lmd-full-slip">
                            {/* Hospital Branding Header */}
                            <div className="lmd-slip-brand-hdr">
                                <div className="brand-left">
                                    <h1 className="hosp-name">{hospital.name || 'Medical365 Diagnostics'}</h1>
                                    <p className="hosp-details">
                                        {hospital.address || 'Central Clinical Laboratory & Molecular Pathology'}
                                        {hospital.phone ? ` • Tel: ${hospital.phone}` : ''}
                                        {hospital.email ? ` • Email: ${hospital.email}` : ''}
                                    </p>
                                </div>
                                <div className="brand-right">
                                    <div className="slip-badge-order">
                                        <span className="lbl">REQUISITION NO.</span>
                                        <span className="val">{order.orderNumber}</span>
                                    </div>
                                    <div className="slip-badge-token">
                                        <span className="lbl">TOKEN</span>
                                        <span className="token-val">#{order.tokenNumber}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Divider */}
                            <hr className="lmd-slip-divider" />

                            {/* Patient Demographics & Order Metadata */}
                            <div className="lmd-slip-section-grid">
                                <div className="slip-meta-box">
                                    <h3>PATIENT DEMOGRAPHICS</h3>
                                    <table className="meta-table">
                                        <tbody>
                                            <tr>
                                                <td className="meta-lbl">Patient Name:</td>
                                                <td className="meta-val bold">{patient.name}</td>
                                                <td className="meta-lbl">Age / Gender:</td>
                                                <td className="meta-val">{patient.age ? `${patient.age} Yrs` : '—'} / {patient.gender || '—'}</td>
                                            </tr>
                                            <tr>
                                                <td className="meta-lbl">UHID / MRN:</td>
                                                <td className="meta-val bold text-blue">{patient.uhid || patient.mrn || '—'}</td>
                                                <td className="meta-lbl">Mobile Phone:</td>
                                                <td className="meta-val">{patient.phone}</td>
                                            </tr>
                                            <tr>
                                                <td className="meta-lbl">Address:</td>
                                                <td className="meta-val" colSpan="3">
                                                    {[patient.address, patient.city, patient.state, patient.pinCode].filter(Boolean).join(', ') || 'Walk-in Patient'}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="slip-meta-box">
                                    <h3>REQUISITION DETAILS</h3>
                                    <table className="meta-table">
                                        <tbody>
                                            <tr>
                                                <td className="meta-lbl">Booking Date:</td>
                                                <td className="meta-val">{new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                                                <td className="meta-lbl">Time:</td>
                                                <td className="meta-val">{new Date(order.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                                            </tr>
                                            <tr>
                                                <td className="meta-lbl">Referring Doctor:</td>
                                                <td className="meta-val bold">{order.referringDoctorName || 'Self / Walk-in'}</td>
                                                <td className="meta-lbl">Priority:</td>
                                                <td className="meta-val">
                                                    <span className={`priority-pill ${order.priority?.toLowerCase()}`}>
                                                        {order.priority || 'Routine'}
                                                    </span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="meta-lbl">Collection Type:</td>
                                                <td className="meta-val">{order.collectionType || 'Walk-in'}</td>
                                                <td className="meta-lbl">Status:</td>
                                                <td className="meta-val bold text-green">{order.status || 'Confirmed'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Booked Investigations Breakdown */}
                            <div className="lmd-slip-items-section">
                                <h3>BOOKED INVESTIGATIONS &amp; PACKAGES</h3>
                                <table className="lmd-slip-items-table">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Code</th>
                                            <th>Test / Package Description</th>
                                            <th>Department</th>
                                            <th>Specimen / Container</th>
                                            <th>Est. TAT</th>
                                            <th style={{ textAlign: 'right' }}>Standard (₹)</th>
                                            <th style={{ textAlign: 'right' }}>Tariff (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Individual Tests */}
                                        {tests.map((t, idx) => (
                                            <tr key={`test-${idx}`}>
                                                <td><span className="badge-item test">TEST</span></td>
                                                <td className="bold">{t.testCode}</td>
                                                <td>
                                                    <div className="bold">{t.testName}</div>
                                                    {t.fastingRequired && (
                                                        <div className="fasting-note">⚠️ Fasting: {t.fastingInstructions || 'Overnight fasting required'}</div>
                                                    )}
                                                </td>
                                                <td>{t.department || 'General'}</td>
                                                <td>{t.specimenType} / {t.containerType}</td>
                                                <td>{t.turnaroundTime || 24} {t.tatUnit || 'h'}</td>
                                                <td style={{ textAlign: 'right' }}>₹{t.standardPrice}</td>
                                                <td style={{ textAlign: 'right' }} className="bold">₹{t.price}</td>
                                            </tr>
                                        ))}

                                        {/* Packages */}
                                        {packages.map((p, idx) => (
                                            <tr key={`pkg-${idx}`} className="pkg-row">
                                                <td><span className="badge-item pkg">PACKAGE</span></td>
                                                <td className="bold">{p.packageCode}</td>
                                                <td>
                                                    <div className="bold">{p.packageName}</div>
                                                    <div className="pkg-sub">({p.tests?.length || 0} Comprehensive Tests)</div>
                                                </td>
                                                <td>Health Packages</td>
                                                <td>Multiple Specimen Standards</td>
                                                <td>24 h</td>
                                                <td style={{ textAlign: 'right' }}>₹{p.standardPrice}</td>
                                                <td style={{ textAlign: 'right' }} className="bold text-green">₹{p.discountedPrice}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Specimen Collection Placeholders & Phlebotomy Guidance */}
                            <div className="lmd-slip-specimens-section">
                                <h3>REQUIRED SAMPLE SPECIMENS (FOR PHLEBOTOMY)</h3>
                                <div className="lmd-specimen-grid">
                                    {placeholders.map((sp, idx) => (
                                        <div key={idx} className="specimen-card">
                                            <div className="specimen-card-hdr">
                                                <span className="smp-id">{sp.samplePlaceholderId}</span>
                                                <span className="smp-container">{sp.containerType}</span>
                                            </div>
                                            <div className="specimen-details">
                                                <div><strong>Specimen:</strong> {sp.specimenType} ({sp.requiredVolume || '2-3 mL'})</div>
                                                <div className="tests-list"><strong>For Tests:</strong> {sp.testNames?.join(', ')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Pricing & Net Payable Summary */}
                            <div className="lmd-slip-pricing-footer">
                                <div className="slip-notes">
                                    <strong>Important Patient Instructions:</strong>
                                    <ul>
                                        <li>Please retain this requisition slip to collect verified diagnostic reports.</li>
                                        <li>Reports may also be accessed through the Medical365 Patient Portal.</li>
                                        <li>Inquiries &amp; Status: Please quote Requisition No. <strong>{order.orderNumber}</strong>.</li>
                                    </ul>
                                </div>
                                <div className="slip-total-card">
                                    <div className="tot-row">
                                        <span>Standard Tariff:</span>
                                        <span>₹{pricing.totalStandardPrice || 0}</span>
                                    </div>
                                    {pricing.totalDiscount > 0 && (
                                        <div className="tot-row text-green">
                                            <span>Package Discount:</span>
                                            <span>- ₹{pricing.totalDiscount}</span>
                                        </div>
                                    )}
                                    <div className="tot-row net-total">
                                        <span>Net Payable:</span>
                                        <span>₹{pricing.netAmount || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Signatures */}
                            <div className="lmd-slip-signatures">
                                <div className="sig-block">
                                    <div className="sig-line"></div>
                                    <span>Receptionist / Biller</span>
                                </div>
                                <div className="sig-block">
                                    <div className="sig-line"></div>
                                    <span>Phlebotomist Drawing</span>
                                </div>
                                <div className="sig-block">
                                    <div className="sig-line"></div>
                                    <span>Patient / Relative</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LabOrderSlipModal;

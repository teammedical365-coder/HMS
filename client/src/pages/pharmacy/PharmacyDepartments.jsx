import React, { useState, useEffect } from 'react';
import { pharmacyAPI, billingAPI } from '../../utils/api';
import { FiPlus, FiArrowRightCircle, FiZap, FiBox } from 'react-icons/fi';
import './PharmacyDepartments.css';

const PharmacyDepartments = () => {
    const [departments, setDepartments] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [patients, setPatients] = useState([]); // Mock or search for billing
    
    // Modals state
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showUsageModal, setShowUsageModal] = useState(false);

    // Form states
    const [deptForm, setDeptForm] = useState({ name: '', description: '' });
    const [transferForm, setTransferForm] = useState({ departmentId: '', medicineId: '', quantity: '' });
    const [usageForm, setUsageForm] = useState({ departmentId: '', medicineId: '', patientId: '', quantity: '', unitPrice: '' });
    const [patientSearch, setPatientSearch] = useState('');

    useEffect(() => {
        fetchData();
        fetchInventory();
    }, []);

    const fetchData = async () => {
        try {
            const deptRes = await pharmacyAPI.getDepartments();
            if (deptRes.success) setDepartments(deptRes.departments);

            const stockRes = await pharmacyAPI.getDepartmentStocks();
            if (stockRes.success) setStocks(stockRes.stocks);
        } catch (error) {
            console.error('Error fetching data:', error);
            alert('Failed to load department data');
        }
    };

    const fetchInventory = async () => {
        try {
            const res = await pharmacyAPI.getInventory();
            const invData = res.medicines || res.inventory || res.data || res || [];
            setInventory(Array.isArray(invData) ? invData : []);
        } catch (error) {
            console.error('Error fetching inventory:', error);
        }
    };

    const handleCreateDepartment = async (e) => {
        e.preventDefault();
        try {
            const res = await pharmacyAPI.createDepartment(deptForm);
            if (res.success) {
                setShowDeptModal(false);
                setDeptForm({ name: '', description: '' });
                fetchData();
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Error creating department');
        }
    };

    const handleTransfer = async (e) => {
        e.preventDefault();
        try {
            const res = await pharmacyAPI.transferToDepartment({
                ...transferForm,
                quantity: Number(transferForm.quantity)
            });
            if (res.success) {
                setShowTransferModal(false);
                setTransferForm({ departmentId: '', medicineId: '', quantity: '' });
                fetchData();
                fetchInventory(); // refresh main stock
                alert('Stock transferred successfully!');
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Error transferring stock');
        }
    };

    const searchPatients = async (query) => {
        setPatientSearch(query);
        // Clear selected patient if user starts typing again
        if (usageForm.patientId) {
            setUsageForm({ ...usageForm, patientId: '' });
        }
        
        if (query.length < 2) {
            setPatients([]);
            return;
        }
        try {
            const res = await billingAPI.searchPatients(query);
            if (res.success) {
                setPatients(res.patients);
            }
        } catch (error) {
            console.error('Error searching patients:', error);
        }
    };

    const handleUsage = async (e) => {
        e.preventDefault();
        try {
            const res = await pharmacyAPI.recordDepartmentUsage({
                ...usageForm,
                quantity: Number(usageForm.quantity),
                unitPrice: Number(usageForm.unitPrice)
            });
            if (res.success) {
                setShowUsageModal(false);
                setUsageForm({ departmentId: '', medicineId: '', patientId: '', quantity: '', unitPrice: '' });
                setPatientSearch('');
                fetchData();
                alert('Usage recorded and patient billed successfully!');
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Error recording usage');
        }
    };

    // Helper for usage form: auto-fill price when medicine selected
    const handleUsageMedicineChange = (e) => {
        const medId = e.target.value;
        const stockItem = stocks.find(s => s.medicineId._id === medId && s.departmentId._id === usageForm.departmentId);
        
        setUsageForm(prev => ({
            ...prev,
            medicineId: medId,
            unitPrice: stockItem ? stockItem.medicineId.sellingPrice || 0 : 0
        }));
    };

    return (
        <div className="pharmacy-departments-container">
            <div className="header-actions">
                <h2>Departments & Stock Transfers</h2>
                <div className="action-buttons">
                    <button className="btn-primary" onClick={() => setShowDeptModal(true)}>
                        <FiPlus /> Add Department
                    </button>
                    <button className="btn-warning" onClick={() => setShowTransferModal(true)}>
                        <FiArrowRightCircle /> Transfer to Dept
                    </button>
                    <button className="btn-success" onClick={() => setShowUsageModal(true)}>
                        <FiZap /> Record Usage & Bill
                    </button>
                </div>
            </div>

            {/* Departments Grid */}
            <div className="departments-grid">
                {departments.map(dept => (
                    <div key={dept._id} className="department-card">
                        <h3>{dept.name}</h3>
                        <p>{dept.description || 'No description provided'}</p>
                    </div>
                ))}
            </div>

            {/* Stock Table */}
            <div className="stock-table-container">
                <h3><FiBox style={{marginRight: '8px'}} /> Department Stock Inventory</h3>
                <table className="stock-table">
                    <thead>
                        <tr>
                            <th>Department</th>
                            <th>Medicine / Item Name</th>
                            <th>Batch #</th>
                            <th>Available Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stocks.map(stock => (
                            <tr key={stock._id}>
                                <td>{stock.departmentId?.name || 'Unknown'}</td>
                                <td>{stock.medicineId?.name || 'Unknown'}</td>
                                <td>{stock.medicineId?.batchNumber || 'N/A'}</td>
                                <td><strong>{stock.quantity}</strong> {stock.medicineId?.unit || 'units'}</td>
                            </tr>
                        ))}
                        {stocks.length === 0 && (
                            <tr><td colSpan="4" style={{textAlign: 'center', padding: '20px'}}>No stock found in any department</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Department Modal */}
            {showDeptModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Create New Department</h3>
                        <form onSubmit={handleCreateDepartment}>
                            <div className="form-group">
                                <label>Department Name</label>
                                <input required type="text" placeholder="e.g., ICU, Operation Theater" 
                                    value={deptForm.name} onChange={e => setDeptForm({...deptForm, name: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label>Description (Optional)</label>
                                <textarea rows="3" value={deptForm.description} 
                                    onChange={e => setDeptForm({...deptForm, description: e.target.value})}></textarea>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowDeptModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Save Department</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Transfer Stock Modal */}
            {showTransferModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Transfer Stock to Department</h3>
                        <form onSubmit={handleTransfer}>
                            <div className="form-group">
                                <label>Target Department</label>
                                <select required value={transferForm.departmentId} onChange={e => setTransferForm({...transferForm, departmentId: e.target.value})}>
                                    <option value="">Select Department...</option>
                                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Medicine (Main Inventory)</label>
                                <select required value={transferForm.medicineId} onChange={e => setTransferForm({...transferForm, medicineId: e.target.value})}>
                                    <option value="">Select Medicine...</option>
                                    {(inventory || []).filter(i => i.stock > 0).map(med => (
                                        <option key={med._id || med.id} value={med._id || med.id}>
                                            {med.name || med.medicineName} (Avail: {med.stock})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Transfer Quantity</label>
                                <input required type="number" min="1" value={transferForm.quantity} 
                                    onChange={e => setTransferForm({...transferForm, quantity: e.target.value})} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowTransferModal(false)}>Cancel</button>
                                <button type="submit" className="btn-warning">Execute Transfer</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Record Usage Modal */}
            {showUsageModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Record Usage & Bill Patient</h3>
                        <form onSubmit={handleUsage}>
                            <div className="form-group">
                                <label>Source Department</label>
                                <select required value={usageForm.departmentId} 
                                    onChange={e => {
                                        setUsageForm({...usageForm, departmentId: e.target.value, medicineId: ''});
                                    }}>
                                    <option value="">Select Department...</option>
                                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Item Consumed</label>
                                <select required value={usageForm.medicineId} onChange={handleUsageMedicineChange} disabled={!usageForm.departmentId}>
                                    <option value="">Select Item from Dept Stock...</option>
                                    {stocks.filter(s => s.departmentId._id === usageForm.departmentId).map(s => (
                                        <option key={s.medicineId._id} value={s.medicineId._id}>
                                            {s.medicineId.name} (Avail: {s.quantity})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Search Patient (Name / MRN / Phone)</label>
                                <input type="text" placeholder="Type to search..." value={patientSearch} onChange={e => searchPatients(e.target.value)} />
                                {patients.length > 0 && !usageForm.patientId && (
                                    <div style={{border: '1px solid #ccc', maxHeight: '100px', overflowY: 'auto', background: '#fff'}}>
                                        {patients.map(p => (
                                            <div key={p._id} style={{padding: '5px', cursor: 'pointer', borderBottom: '1px solid #eee'}}
                                                onClick={() => { setUsageForm({...usageForm, patientId: p._id}); setPatients([]); setPatientSearch(p.name); }}>
                                                {p.name} - MRN: {p.mrn} ({p.phone})
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="form-group" style={{display: 'flex', gap: '10px'}}>
                                <div style={{flex: 1}}>
                                    <label>Quantity</label>
                                    <input required type="number" min="1" value={usageForm.quantity} 
                                        onChange={e => setUsageForm({...usageForm, quantity: e.target.value})} />
                                </div>
                                <div style={{flex: 1}}>
                                    <label>Unit Price (₹) <small>(Editable)</small></label>
                                    <input required type="number" min="0" step="0.01" value={usageForm.unitPrice} 
                                        onChange={e => setUsageForm({...usageForm, unitPrice: e.target.value})} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowUsageModal(false)}>Cancel</button>
                                <button type="submit" className="btn-success" disabled={!usageForm.patientId}>Bill Patient</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyDepartments;

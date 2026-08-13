import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { pharmacyOrderAPI, hospitalAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './PharmacyInventory.css';

const PharmacyOrders = () => {
    const hostname = window.location.hostname;
    const backendUrl = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost'))
        ? 'http://localhost:3000'
        : (import.meta.env.VITE_API_URL || 'https://hms-7ojp.onrender.com');

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [checkedItems, setCheckedItems] = useState({});
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    // External Data
    const [inventory, setInventory] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [hospitalInfo, setHospitalInfo] = useState({});
    const [dashboardStats, setDashboardStats] = useState({ todayCollection: 0, overallCollection: 0, pendingCollection: 0, doctorGuaranteedAmount: 0 });
    const [billingSettings, setBillingSettings] = useState({ gstin: '', dlNumber: '' });

    // Modals
    const [showBillModal, setShowBillModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentFlowOrder, setPaymentFlowOrder] = useState(null);
    const [paymentSource, setPaymentSource] = useState('Patient'); // 'Patient' | 'Doctor'
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [authorizedByDoctor, setAuthorizedByDoctor] = useState('');
    const [authorizationNote, setAuthorizationNote] = useState('');
    const [discountPercent, setDiscountPercent] = useState(0);

    // Walk-in Billing
    const [showWalkInModal, setShowWalkInModal] = useState(false);
    const [walkInForm, setWalkInForm] = useState({
        patientName: '',
        patientPhone: '',
        doctorName: '',
        items: [],
        discountPercent: 0,
        subtotal: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        totalAmount: 0,
        discountAmount: 0,
        grandTotal: 0,
        paymentMode: 'CASH'
    });
    const [walkInSearch, setWalkInSearch] = useState('');
    const [walkInSaving, setWalkInSaving] = useState(false);
    useEffect(() => {
        fetchOrders();
        fetchInventory();
        fetchHospital();
        fetchDashboardStats();
        fetchDoctors();
    }, []);

    const fetchInventory = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${backendUrl}/api/pharmacy/inventory`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`API returned status: ${res.status}`);
            const data = await res.json();
            if (data.success) {
                const inventoryData = data.medicines || data.inventory || data.items || data.data || data || [];
                console.log("Resolved Inventory Data:", inventoryData);
                setInventory(Array.isArray(inventoryData) ? inventoryData : []);
            }
        } catch (error) {
            console.error("Failed to load inventory", error);
        }
    };

    const fetchDoctors = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${backendUrl}/api/doctor`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`API returned status: ${res.status}`);
            const data = await res.json();
            if (data.success) setDoctors(data.doctors || data.data || []);
        } catch (error) {
            console.error("Failed to load doctors", error);
        }
    };

    const fetchDashboardStats = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${backendUrl}/api/pharmacy/orders/dashboard-summary`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`API returned status: ${res.status}`);
            const data = await res.json();
            if (data.success) setDashboardStats(data.data);
        } catch (error) {
            console.error("Failed to load dashboard stats", error);
        }
    };

    const fetchHospital = async () => {
        try {
            const res = await hospitalAPI.getMyHospital();
            if (res.success && res.hospital) {
                setHospitalInfo({
                    name: res.hospital.name,
                    address: res.hospital.address,
                    phone: res.hospital.phone,
                    email: res.hospital.email,
                    logoUrl: res.hospital.logo || res.hospital.branding?.logoUrl,
                    gstin: res.hospital.gstin,
                    dlNumber: res.hospital.dlNumber
                });
                setBillingSettings({
                    gstin: res.hospital.gstin || '',
                    dlNumber: res.hospital.dlNumber || ''
                });
            }
        } catch (error) {
            console.warn("Failed to load hospital info. Using default layout.", error.message);
            setHospitalInfo({ name: 'Aryan Hospital', address: 'Hospital Address', phone: '0000000000' });
        }
    };

    const handleUpdateBillingSettings = async () => {
        try {
            const token = localStorage.getItem('token');

            const res = await fetch(`${backendUrl}/api/pharmacy/hospital-billing`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(billingSettings)
            });
            const data = await res.json();
            if (data.success) {
                alert("Pharmacy Billing Details updated successfully!");
                fetchHospital();
            } else {
                alert(data.message || "Failed to update billing details");
            }
        } catch (error) {
            console.error(error);
            alert("Error updating billing details");
        }
    };

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await pharmacyOrderAPI.getOrders();
            if (res.success) setOrders(res.orders);
        } catch (err) {
            console.error("Failed to fetch pharmacy orders", err);
        } finally {
            setLoading(false);
        }
    };

    const handleWalkInSubmit = async (e) => {
        e.preventDefault();
        setWalkInSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${backendUrl}/api/pharmacy/orders/outside-patient-bill`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    patientName: walkInForm.patientName,
                    patientPhone: walkInForm.patientPhone,
                    doctorName: walkInForm.doctorName,
                    items: walkInForm.items,
                    totalAmount: walkInForm.subtotal,
                    taxableAmount: walkInForm.subtotal,
                    cgstAmount: walkInForm.cgstAmount,
                    sgstAmount: walkInForm.sgstAmount,
                    discountAmount: walkInForm.discountAmount,
                    paymentMode: walkInForm.paymentMode
                })
            });
            const data = await res.json();
            if (data.success) {
                setShowWalkInModal(false);
                fetchOrders();
                fetchInventory();
                // Reset form
                setWalkInForm({
                    patientName: '', patientPhone: '', doctorName: '', items: [], discountPercent: 0,
                    subtotal: 0, cgstAmount: 0, sgstAmount: 0, totalAmount: 0, discountAmount: 0, grandTotal: 0, paymentMode: 'CASH'
                });
                alert('Walk-in Bill generated successfully!');
                
                // Open bill modal to print
                setSelectedOrder(data.order);
                setShowBillModal(true);
            } else {
                alert(data.message || 'Failed to generate bill');
            }
        } catch (error) {
            console.error(error);
            alert('Error generating walk-in bill');
        } finally {
            setWalkInSaving(false);
        }
    };

    const isChecked = (orderId, idx) => {
        if (!checkedItems[orderId]) return true;
        if (checkedItems[orderId][idx] === undefined) return true;
        return checkedItems[orderId][idx];
    };

    const toggleCheck = (orderId, idx) => {
        setCheckedItems(prev => {
            const current = (prev[orderId] && prev[orderId][idx] !== undefined) ? prev[orderId][idx] : true;
            return {
                ...prev,
                [orderId]: {
                    ...(prev[orderId] || {}),
                    [idx]: !current
                }
            };
        });
    };

    const parseDuration = (durationString) => {
        if (!durationString) return 1;
        const str = String(durationString).toLowerCase();
        const match = str.match(/(\d+)/);
        const num = match ? parseInt(match[1], 10) : 1;
        if (str.includes('week')) return num * 7;
        if (str.includes('month')) return num * 30;
        return num;
    };

    const formatFrequencyText = (freq) => {
        if (!freq) return '1/day';
        const map = {
            '1-0-0': '1 Morning', '0-1-0': '1 Afternoon', '0-0-1': '1 Night',
            '1-0-1': '2/day (M,N)', '1-1-1': '3/day', '1-1-1-1': '4/day',
            'SOS': 'As needed', 'STAT': 'Immediately',
            'TDS': '3 times/day', 'BD': '2 times/day', 'OD': '1 time/day', 'QID': '4 times/day'
        };
        return map[freq.toUpperCase()] || freq;
    };

    const calculateTotalQty = (item) => {
        const freq = item.frequency || '';
        const dur = item.duration || item.days || item.durationDays || '';

        const days = dur ? parseDuration(dur) : 1;
        let timesPerDay = 1;

        const fUpper = freq.toUpperCase();
        if (item.frequencyCount) {
            timesPerDay = Number(item.frequencyCount);
        } else if (fUpper.includes('-')) {
            timesPerDay = fUpper.split('-').reduce((sum, val) => sum + (val === '1' ? 1 : (parseInt(val) || 0)), 0);
        } else if (fUpper.includes('TDS') || fUpper.includes('TID')) {
            timesPerDay = 3;
        } else if (fUpper.includes('BD') || fUpper.includes('BID')) {
            timesPerDay = 2;
        } else if (fUpper.includes('QID')) {
            timesPerDay = 4;
        } else if (fUpper === 'SOS' || fUpper === 'STAT') {
            timesPerDay = 1;
        } else {
            const match = freq.match(/(\d+)/);
            if (match) timesPerDay = parseInt(match[1], 10);
        }

        return timesPerDay * days;
    };

    const calculateOrderEstimatedTotal = (order) => {
        if (!order) return 0;
        const items = order.prescribedItems || order.items || [];
        if (!Array.isArray(items) || items.length === 0) return 0;

        let total = 0;
        items.forEach(item => {
            if (!item) return;

            // Search inventory or fallback
            const itemName = (item.medicineName || item.name || item.medicine || '').trim().toLowerCase();
            const invItem = (Array.isArray(inventory) ? inventory : []).find(inv => {
                if (!inv || !inv.name) return false;
                const invName = inv.name.trim().toLowerCase();
                return (item.medicineId && (inv._id === item.medicineId || inv.id === item.medicineId)) ||
                    invName === itemName || invName.includes(itemName) || itemName.includes(invName);
            });

            // Fallback price if not found in inventory
            const unitPrice = Number(invItem?.sellingPrice || invItem?.mrp || item.price || item.rate || 120);

            // Parse Duration (Default to 1 day if blank)
            const duration = Number(item.duration || item.days || item.durationDays || 1) || 1;

            // Parse Frequency
            let freqCount = 1;
            if (typeof item.frequency === 'number') freqCount = item.frequency;
            else if (item.frequencyCount) freqCount = Number(item.frequencyCount);
            else if (typeof item.frequency === 'string') {
                const f = item.frequency.toUpperCase();
                if (f.includes('TDS') || f.includes('TID') || f.includes('THREE')) freqCount = 3;
                else if (f.includes('BD') || f.includes('BID') || f.includes('TWO')) freqCount = 2;
                else if (f.includes('QID') || f.includes('FOUR')) freqCount = 4;
                else if (f.includes('OD') || f.includes('ONCE')) freqCount = 1;
            }

            const doseMl = Number(item.doseAmount || item.dose || item.volume || 2) || 2;
            const totalMl = doseMl * freqCount * duration;
            const packVol = Number(invItem?.packVolume || invItem?.totalVialSize || 10) || 10;

            // Vial Calculation: ceil(Total ML / Vial Volume)
            const vials = Math.ceil(totalMl / packVol) || 1;
            total += vials * unitPrice;
        });

        return total;
    };

    const openPaymentModal = (order) => {
        setPaymentFlowOrder(order);
        setPaymentSource('Patient');
        setPaymentMode('CASH');
        setAuthorizedByDoctor('');
        setAuthorizationNote('');
        setDiscountPercent(order.discountPercent || 0);
        setShowPaymentModal(true);
    };

    const handleCompleteOrder = async (orderId, payloadObj = null, totalItems = 100) => {
        try {
            const purchasedIndices = Array.from({ length: totalItems }, (_, i) => i);
            const payload = payloadObj || { purchasedIndices };

            console.log("🚀 [FRONTEND CHECKOUT] Payload to send:", JSON.stringify(payload, null, 2));
            console.log("🚀 [FRONTEND CHECKOUT] Frontend Totals:", payload.frontendTotals);

            const token = localStorage.getItem('token');

            // 👇 Yeh rasta seedha Render backend ki taraf jayega
            const res = await fetch(`${backendUrl}/api/pharmacy/orders/${orderId}/complete`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                alert("Order completed!");
                setOrders(prev => prev.map(o => o._id === orderId ? { ...o, paymentStatus: payload.paymentStatus || 'Paid', paymentMode: payload.paymentMode, status: 'COMPLETED', orderStatus: 'Completed' } : o));
                fetchDashboardStats();
            }
        } catch (err) {
            alert("Failed to update order.");
        }
    };
    const handleViewBill = (order) => {
        setSelectedOrder(order);
        setDiscountPercent(order.discountPercent || 0);
        setShowBillModal(true);
    };

    const generateReceipt = () => {
        if (!selectedOrder) return;
        const doc = new jsPDF('p', 'mm', 'a4');
        const hospitalName = hospitalInfo.name || 'Aryan Hospital';
        const hospitalAddress = hospitalInfo.address || 'Hospital Address';
        const hospitalPhone = hospitalInfo.phone || '9000000000';

        doc.setFontSize(22);
        doc.setTextColor(0, 51, 102);
        doc.text(hospitalName, 105, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(hospitalAddress, 105, 26, { align: 'center' });
        doc.text(`Phone: ${hospitalPhone}`, 105, 31, { align: 'center' });

        let yOffset = 0;
        let authString = [];
        if (hospitalInfo?.gstin) authString.push(`GSTIN: ${hospitalInfo.gstin}`);
        if (hospitalInfo?.dlNumber) authString.push(`DL No: ${hospitalInfo.dlNumber}`);
        
        if (authString.length > 0) {
            yOffset = 5;
            doc.setFontSize(9);
            doc.text(authString.join('  |  '), 105, 31 + yOffset, { align: 'center' });
        }

        doc.setDrawColor(200);
        doc.line(15, 35 + yOffset, 195, 35 + yOffset);

        doc.setFontSize(16);
        doc.setTextColor(0);
        doc.text('Pharmacy Invoice', 105, 45 + yOffset, { align: 'center' });

        doc.setFontSize(10);
        doc.text(`Invoice No: ${selectedOrder._id.slice(-8).toUpperCase()}`, 15, 55 + yOffset);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 150, 55 + yOffset);
        doc.text(`Patient: ${selectedOrder.userId?.name || 'N/A'}`, 15, 62 + yOffset);
        doc.text(`Doctor: Dr. ${selectedOrder.doctorId?.name || 'N/A'}`, 150, 62 + yOffset);

        let subtotal = 0;
        let totalCgst = 0;
        let totalSgst = 0;

        const orderItems = selectedOrder.items || selectedOrder.prescribedItems || [];
        const tableData = orderItems.map((item, idx) => {
            const parsedQty = calculateTotalQty(item);
            let doseAmount = Number(item.doseAmount || item.dose || 1);
            if (item.volumeMl) {
                const parsed = parseFloat(item.volumeMl);
                if (!isNaN(parsed) && parsed > 0) doseAmount = parsed;
            }
            const totalVolumeDeducted = doseAmount * parsedQty;

            const invMatch = (inventory || []).find(i => i.name && item.medicineName && i.name.toLowerCase() === item.medicineName.toLowerCase());

            let unitPrice = invMatch ? invMatch.sellingPrice : (item.price || 10);
            let billedQty = (item.quantity && item.quantity > 0) ? item.quantity : parsedQty;

            if (invMatch && invMatch.isMultiDose) {
                if (invMatch.billingType === 'PROPORTIONAL') {
                    unitPrice = invMatch.sellingPrice / (invMatch.packVolume || 1);
                    billedQty = totalVolumeDeducted;
                } else {
                    const packVol = invMatch.packVolume || invMatch.totalVialSize || 10;
                    billedQty = Math.ceil(totalVolumeDeducted / packVol);
                }
            } else {
                if (item.volumeMl && billedQty > 5 && doseAmount > 1 && (!invMatch || !invMatch.isMultiDose)) {
                    const packVol = invMatch?.packVolume || invMatch?.totalVialSize || 10;
                    billedQty = Math.ceil(totalVolumeDeducted / packVol);
                }
            }

            const totalGstPercent = invMatch ? ((invMatch.cgstPercent || 0) + (invMatch.sgstPercent || 0)) : 0;
            const cgstPercent = totalGstPercent / 2;
            const sgstPercent = totalGstPercent / 2;

            const itemTaxable = billedQty * unitPrice;
            const itemCgst = (itemTaxable * cgstPercent) / 100;
            const itemSgst = (itemTaxable * sgstPercent) / 100;
            const itemTotal = itemTaxable + itemCgst + itemSgst;

            subtotal += itemTaxable;
            totalCgst += itemCgst;
            totalSgst += itemSgst;

            return [
                idx + 1,
                item.medicineName,
                billedQty.toString(),
                unitPrice.toFixed(2),
                (cgstPercent + sgstPercent) + '%',
                itemTotal.toFixed(2)
            ];
        });

        doc.autoTable({
            startY: 70 + yOffset,
            head: [['#', 'Medicine Name', 'Billed Qty', 'Unit Rate', 'GST %', 'Total Amount']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 51, 102], textColor: 255 },
            styles: { fontSize: 9 }
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        const pct = selectedOrder.discountPercent || discountPercent || 0;
        let discountAmt = 0;
        if (pct > 0) {
            discountAmt = (subtotal * pct) / 100;
        } else {
            discountAmt = selectedOrder.discountAmount || 0;
        }
        const grandTotal = Math.max(0, subtotal + totalCgst + totalSgst - discountAmt);

        doc.setFontSize(10);
        doc.text(`Subtotal: Rs. ${subtotal.toFixed(2)}`, 140, finalY);
        doc.text(`CGST: Rs. ${totalCgst.toFixed(2)}`, 140, finalY + 6);
        doc.text(`SGST: Rs. ${totalSgst.toFixed(2)}`, 140, finalY + 12);
        
        let currentY = finalY + 12;
        if (discountAmt > 0) {
            currentY += 6;
            doc.setTextColor(220, 38, 38);
            const discountLabel = pct > 0 ? `Discount (${pct}%):` : `Discount:`;
            doc.text(`${discountLabel} -Rs. ${discountAmt.toFixed(2)}`, 140, currentY);
            doc.setTextColor(0);
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Grand Total: Rs. ${grandTotal.toFixed(2)}`, 140, currentY + 10);

        if (selectedOrder.paymentStatus === 'PAID_BY_DOCTOR' || selectedOrder.paymentMode === 'DOCTOR_AUTHORIZATION') {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(217, 119, 6);
            doc.text(`Status: Pending by Doctor - ${selectedOrder.authorizedDoctorName || selectedOrder.doctorName || 'Unknown Doctor'}`, 15, currentY + 10);
        }

        doc.save(`Pharmacy_Invoice_${selectedOrder._id.slice(-6)}.pdf`);
    };

    console.log("Modal rendering status:", { showBillModal, selectedOrder });

    const getInvoiceCalculations = (order, appliedDiscountPercent = null) => {
        const items = order?.prescribedItems || order?.items || [];
        let totalSubtotal = 0;
        let processedItemsTemp = [];

        const tempItems = items.map((item) => {
            const rawName = String(item.medicineName || item.name || '').toLowerCase();
            const isLiquidOrInj = rawName.includes('injection') || rawName.includes('inj') || rawName.includes('syrup') || rawName.includes('ceftriaxone');

            // 1. Strictly isolated local variables per item (No leakage across loop iterations)
            const itemDose = Number(item.dosePerAdmin || item.doseAdmin || item.dose || item.qtyPerDose || 1);
            const itemDays = Number(item.days || item.duration || item.numberOfDays || 1);
            const fStr = String(item.frequency || item.schedule || item.timing || item.sched || '').toUpperCase();

            let itemFreqPerDay = 1;
            if (fStr.includes('TDS') || fStr.includes('3')) itemFreqPerDay = 3;
            else if (fStr.includes('BD') || fStr.includes('BID') || fStr.includes('2')) itemFreqPerDay = 2;
            else if (fStr.includes('QID') || fStr.includes('4')) itemFreqPerDay = 4;

            // 2. Calculate correct quantity independently for each item type
            let finalQty = Number(item.qty || item.quantity || item.totalReqd || 0);
            if (finalQty === 0) {
                if (itemDose > 0 && itemDays > 0) {
                    finalQty = itemDose * itemFreqPerDay * itemDays;
                } else {
                    // Safe fallbacks if doctor data fields are missing
                    finalQty = isLiquidOrInj ? 36 : 9;
                }
            }

            const invMatch = (inventory || []).find(inv => {
                if (!inv || !inv.name) return false;
                const invName = inv.name.trim().toLowerCase();
                return (item.inventoryId && (inv._id === item.inventoryId || inv.id === item.inventoryId)) ||
                       (item.medicineId && (inv._id === item.medicineId || inv.id === item.medicineId)) ||
                       invName === rawName || rawName.includes(invName) || invName.includes(rawName);
            });

            // 3. User Requested Calculation Logic
            let sellingPrice = invMatch ? Number(invMatch.sellingPrice || invMatch.price || 0) : Number(item.sellingPrice || item.price || item.unitRate || 0);
            let buyingPrice = invMatch ? Number(invMatch.buyingPrice || invMatch.costPrice || 0) : Number(item.buyingPrice || item.costPrice || 0);
            
            const unit = (invMatch ? (invMatch.unit || '') : (item.unit || '')).toLowerCase();
            const unitsPerStrip = invMatch ? Number(invMatch.unitsPerStrip) : 1; 
            const volumePerUnit = invMatch ? (Number(invMatch.volumePerUnit) || Number(invMatch.packVolume)) : 1; 

            if (sellingPrice === 0) {
                sellingPrice = isLiquidOrInj ? 120 : 15;
            }
            if (buyingPrice === 0) {
                buyingPrice = sellingPrice * 0.7; // Fallback cost
            }
            
            // Prevent cross-contamination ONLY for legacy unmatched items to protect extremely old dirty data
            if (!invMatch && !isLiquidOrInj && sellingPrice >= 120) {
                sellingPrice = 15;
                buyingPrice = 10;
            }

            let billedQty = finalQty;
            let displayUnit = unit || 'units';

            if (['strip', 'strips'].includes(unit) || (!isLiquidOrInj && unitsPerStrip > 1)) {
                // If it's strictly a strip, or inventory enforces strips (unitsPerStrip > 1)
                const packCapacity = unitsPerStrip > 1 ? unitsPerStrip : 10; // Fallback to 10/strip if missing
                billedQty = Math.ceil(finalQty / packCapacity);
                displayUnit = 'strip(s)';
            } else if (['capsule', 'capsules', 'tablet', 'tablets', 'tabs'].includes(unit)) {
                // If prescribed as tablets/capsules but inventory doesn't strictly enforce strips
                if (unitsPerStrip > 1) {
                    billedQty = Math.ceil(finalQty / unitsPerStrip);
                    displayUnit = 'strip(s)';
                } else {
                    // Direct loose tablet billing
                    billedQty = finalQty;
                    displayUnit = 'tabs';
                }
            } else if (['syrup', 'injection', 'vial', 'drops', 'vials'].includes(unit) || isLiquidOrInj) {
                // Liquids: e.g. 50ml total dose. Bottle size = 100ml -> 1 Bottle
                // If packVolume is missing (<= 1), fallback to 100ml for syrup, 10ml for vials
                const fallbackVolume = rawName.includes('syrup') ? 100 : 10;
                const packCapacity = volumePerUnit > 1 ? volumePerUnit : fallbackVolume;
                billedQty = Math.ceil(finalQty / packCapacity);
                displayUnit = (unit === 'syrup' || rawName.includes('syrup')) ? 'bottle(s)' : 'vial(s)';
            } else {
                // Sachet, Powder, Nos (Direct 1:1 billing)
                billedQty = finalQty;
                displayUnit = unit || 'units';
            }

            // 4. Packaging breakdown string
            let packagingBreakdown = `${billedQty} ${displayUnit}`;
            const unitLabel = unit || 'units';
            const effectiveRate = sellingPrice;

            // 5. Final calculation per item
            const itemBase = billedQty * sellingPrice; 
            const itemCostBase = billedQty * buyingPrice;
            const gstPercent = Number(item.gst || item.gstPercent || 12);
            
            // Patient bills strictly use Selling Price + Tax
            // Tax will be calculated in the second pass after discount is applied

            totalSubtotal += itemBase;
            const tempItems = processedItemsTemp || [];
            tempItems.push(item);
            processedItemsTemp = tempItems;

            const freqText = itemFreqPerDay === 3 ? 'TDS (3 times/day)' : itemFreqPerDay === 2 ? 'BD (2 times/day)' : 'OD (Once daily)';

            const doseValue = item.dosePerAdmin || item.doseAdmin || item.dose || 1;
            const daysValue = item.days || item.duration || item.noOfDays || 1;

            return {
                ...item,
                qtyDisplay: `${item.totalDosageRequired || finalQty} ${unitLabel}`,
                packagingBreakdown,
                dose: itemDose,
                freqText,
                durationDays: itemDays,
                unitRate: effectiveRate,
                unitLabel,
                finalQty,
                itemBase,
                itemCostBase, // we'll use this for tax calculation in the second pass
                gstPercent,
                isLiquidOrInj
            };
        });

        // 6. Calculate total discount BEFORE tax
        const pct = appliedDiscountPercent !== null ? appliedDiscountPercent : Number(order?.discountPercent || order?.discountPercentage || 0);
        let finalDiscountAmount = 0;
        if (pct > 0) {
            finalDiscountAmount = (totalSubtotal * pct) / 100;
        } else {
            finalDiscountAmount = Number(order?.discountAmount || order?.discount || order?.discountValue || 0);
        }

        const discountRatio = totalSubtotal > 0 ? (finalDiscountAmount / totalSubtotal) : 0;

        // 7. Second Pass: Calculate Tax accurately on the discounted base
        let totalTax = 0;
        const finalizedItems = tempItems.map(item => {
            const discountedCostBase = item.itemCostBase * (1 - discountRatio);
            const itemTax = discountedCostBase * (item.gstPercent / 100);
            
            // Tax is now inclusive. The item Total is simply the base price.
            const itemTotal = item.itemBase; 
            totalTax += itemTax;
            
            return {
                ...item,
                itemTax,
                itemTotal
            };
        });

        // Grand Total does NOT include separate tax additions (GST Inclusive Billing)
        const grandTotal = Math.max(0, totalSubtotal - finalDiscountAmount);
        const halfTax = totalTax / 2;

        return {
            processedItems: finalizedItems,
            subtotal: totalSubtotal.toFixed(2),
            cgst: halfTax.toFixed(2),
            sgst: halfTax.toFixed(2),
            totalTax: totalTax.toFixed(2),
            discountPercent: pct,
            discountAmount: finalDiscountAmount.toFixed(2),
            grandTotal: grandTotal.toFixed(2)
        };
    };

    const calculatedStats = useMemo(() => {
        let todayCollection = 0;
        let todayCash = 0;
        let todayOnline = 0;
        let overallCollection = 0;
        let overallCash = 0;
        let overallOnline = 0;
        let pendingCollection = 0;
        let doctorGuaranteedAmount = 0;

        const todayIST = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" });

        (orders || []).forEach(order => {
            let amount = parseFloat(order.totalAmount || order.grandTotal) || 0;
            
            // Fallback for missing amounts in older orders
            if (amount === 0 && (order.items?.length > 0 || order.prescribedItems?.length > 0)) {
                const calcs = getInvoiceCalculations(order);
                amount = calcs.grandTotal || 0;
            }

            const oStatus = (order.orderStatus || '').toLowerCase();
            const pStatus = (order.paymentStatus || '').toLowerCase();

            if (oStatus === 'completed') {
                if (pStatus === 'paid') {
                    overallCollection += amount;
                    
                    // Normalize Payment Mode
                    let modeStr = (order.paymentMode || 'cash').toLowerCase().trim();
                    let isCash = true; // Default fallback
                    if (['upi', 'online', 'card', 'net_banking', 'net banking', 'netbanking'].includes(modeStr)) {
                        isCash = false;
                    }
                    
                    if (isCash) overallCash += amount;
                    else overallOnline += amount;

                    const orderDateStr = order.updatedAt || order.createdAt || new Date();
                    const orderDate = new Date(orderDateStr).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" });
                    if (orderDate === todayIST) {
                        todayCollection += amount;
                        if (isCash) todayCash += amount;
                        else todayOnline += amount;
                    }
                } else if (pStatus === 'paid_by_doctor' || order.paymentMode === 'DOCTOR_AUTHORIZATION') {
                    pendingCollection += amount;
                    doctorGuaranteedAmount += amount;
                } else {
                    pendingCollection += amount;
                }
            }
        });

        return {
            todayCollection, todayCash, todayOnline,
            overallCollection, overallCash, overallOnline,
            pendingCollection, doctorGuaranteedAmount
        };
    }, [orders]);

    return (
        <div className="pharmacy-management-container" style={{ padding: '20px' }}>
            {showBillModal && selectedOrder && (() => {
                const invoiceData = getInvoiceCalculations(selectedOrder, discountPercent);
                return (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100vw',
                            height: '100vh',
                            backgroundColor: 'rgba(15, 23, 42, 0.75)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 9999999,
                            padding: '16px',
                            overflowY: 'auto'
                        }}
                        onClick={() => setShowBillModal(false)}
                    >
                        {/* White Modal Card Container */}
                        <div
                            style={{
                                backgroundColor: '#ffffff',
                                borderRadius: '18px',
                                maxWidth: '900px',
                                width: '100%',
                                padding: '32px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                                border: '1px solid #cbd5e1',
                                position: 'relative',
                                maxHeight: '90vh',
                                overflowY: 'auto',
                                color: '#1e293b',
                                fontFamily: 'sans-serif'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#115e59', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    📑 Patient Bill / Invoice
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setShowBillModal(false)}
                                    style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', fontWeight: 'bold' }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Invoice Card Box */}
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#ffffff', padding: '16px', marginTop: '16px' }}>

                                {/* Hospital Letterhead Header */}
                                <div style={{ textAlign: 'center', borderBottom: '2px solid #0d9488', paddingBottom: '12px' }}>
                                    <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {hospitalInfo?.name || 'ARYAN HOSPITAL'}
                                    </h1>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Pharmacy & Dispensary Section</p>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                        {hospitalInfo?.address || 'Mumbai, Maharashtra'} | Ph: {hospitalInfo?.phone || '9089089899'} | Email: {hospitalInfo?.email || 'aryan@gmail.com'}
                                    </p>
                                    {(hospitalInfo?.gstin || hospitalInfo?.dlNumber) && (
                                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#334155', fontWeight: 'bold' }}>
                                            {hospitalInfo.gstin ? `GSTIN: ${hospitalInfo.gstin}` : ''}
                                            {hospitalInfo.gstin && hospitalInfo.dlNumber ? '  |  ' : ''}
                                            {hospitalInfo.dlNumber ? `DL No: ${hospitalInfo.dlNumber}` : ''}
                                        </p>
                                    )}
                                </div>

                                {/* Invoice Meta Bar */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', color: '#334155', margin: '12px 0' }}>
                                    <div>INVOICE NO: <span style={{ color: '#0f172a' }}>{selectedOrder?.billNo || selectedOrder?._id?.slice(-8).toUpperCase() || '8A967317'}</span></div>
                                    <div>DATE: <span style={{ color: '#0f172a' }}>{selectedOrder?.createdAt ? new Date(selectedOrder.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</span></div>
                                    <div>
                                        STATUS: <span style={{ color: selectedOrder?.paymentStatus === 'Paid' ? '#059669' : (selectedOrder?.paymentStatus === 'PAID_BY_DOCTOR' ? '#d97706' : '#dc2626'), fontWeight: '900' }}>
                                            {selectedOrder?.paymentStatus === 'Paid' ? `PAID ${selectedOrder?.paymentMode ? `(${String(selectedOrder.paymentMode).toUpperCase()})` : ''}` : (selectedOrder?.paymentStatus === 'PAID_BY_DOCTOR' ? `PENDING BY DR - ${selectedOrder?.authorizedDoctorName || selectedOrder?.doctorName || 'Unknown'}`.toUpperCase() : 'PENDING')}
                                        </span>
                                    </div>
                                </div>

                                {/* Patient / Doctor Details Grid */}
                                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                                    <div>
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Patient Name</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', color: '#0f172a', fontSize: '13px' }}>{selectedOrder?.userId?.name || selectedOrder?.patientName || selectedOrder?.patient?.name || 'Unknown Patient'}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Patient ID / Phone</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', color: '#0f172a', fontSize: '13px' }}>{selectedOrder?.patientId || selectedOrder?.uhid || selectedOrder?.patientPhone || selectedOrder?.patient?.uhid || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Doctor Name</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', color: '#334155' }}>Dr. {selectedOrder?.doctorId?.name || selectedOrder?.doctorName || selectedOrder?.doctor?.name || 'Unknown'}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Prescribed Date</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', color: '#334155' }}>{selectedOrder?.createdAt ? new Date(selectedOrder.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                                    </div>
                                </div>

                                {/* Itemized Table */}
                                <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>
                                                <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>#</th>
                                                <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Medicine Name</th>
                                                <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Batch / Exp</th>
                                                <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Qty & Schedule</th>
                                                <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0', textAlign: 'right' }}>MRP (₹)</th>
                                                <th style={{ padding: '8px', textAlign: 'right' }}>Total (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoiceData.processedItems.length > 0 ? (
                                                invoiceData.processedItems.map((item, idx) => {
                                                    return (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>{idx + 1}</td>
                                                            <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0', fontWeight: 'bold', color: '#0f172a' }}>
                                                                {item.medicineName || item.name || 'Medicine Name'}
                                                            </td>
                                                            <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0', color: '#64748b' }}>
                                                                <div>{item.batch || 'sdfdf'}</div>
                                                                <div style={{ fontSize: '9px' }}>{item.exp || '10/29/2029'}</div>
                                                            </td>
                                                            <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>
                                                                <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                                                                    {selectedOrder?.orderStatus === 'Completed' ? (
                                                                        <span>{item.packagingBreakdown ? `📦 ${item.packagingBreakdown}` : `${item.finalQty} ${item.unitLabel}`}</span>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={item.finalQty}
                                                                                onChange={(e) => {
                                                                                    const val = Number(e.target.value);
                                                                                    if (val < 0) return;
                                                                                    const updatedOrder = { ...selectedOrder };
                                                                                    const itemsArray = updatedOrder.prescribedItems || updatedOrder.items || [];
                                                                                    const updatedItems = [...itemsArray];
                                                                                    updatedItems[idx] = { ...updatedItems[idx], qty: val, quantity: val, totalReqd: val };
                                                                                    if (updatedOrder.prescribedItems) updatedOrder.prescribedItems = updatedItems;
                                                                                    if (updatedOrder.items) updatedOrder.items = updatedItems;
                                                                                    setSelectedOrder(updatedOrder);
                                                                                    setOrders(prev => prev.map(o => o._id === updatedOrder._id ? updatedOrder : o));
                                                                                    if (paymentFlowOrder?._id === updatedOrder._id) setPaymentFlowOrder(updatedOrder);
                                                                                }}
                                                                                style={{ width: '60px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center' }}
                                                                            />
                                                                            <span style={{ fontSize: '11px', color: '#059669', marginLeft: '4px' }}>{item.packagingBreakdown ? `(📦 ${item.packagingBreakdown})` : item.unitLabel}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                                                                    {item.dose} {item.isLiquidOrInj || ['syrup', 'injection', 'vial', 'vials', 'drops', 'ml'].includes(String(item.unitLabel).toLowerCase()) ? 'ml' : 'tab(s)'} • {item.freqText} • {item.durationDays} Days
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0', textAlign: 'right' }}>₹{item.unitRate.toFixed(2)} /{item.unitLabel}</td>
                                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>₹{item.itemTotal.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan="6" style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No medicines listed.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals Summary */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <div style={{ width: '220px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', fontSize: '11px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>Subtotal:</span>
                                            <span style={{ fontWeight: 'bold' }}>₹{invoiceData.subtotal}</span>
                                        </div>
                                        {selectedOrder?.orderStatus !== 'Completed' && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                                                <span>Discount (%):</span>
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    value={discountPercent} 
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value) || 0;
                                                        setDiscountPercent(val);
                                                        if (selectedOrder) {
                                                            const updatedOrder = { ...selectedOrder, discountPercent: val };
                                                            setSelectedOrder(updatedOrder);
                                                            setOrders(prev => prev.map(o => o._id === updatedOrder._id ? updatedOrder : o));
                                                            if (paymentFlowOrder?._id === updatedOrder._id) setPaymentFlowOrder(updatedOrder);
                                                        }
                                                    }} 
                                                    style={{ width: '60px', padding: '2px 4px', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                />
                                            </div>
                                        )}
                                        {Number(invoiceData.discountAmount) > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#dc2626', background: '#fee2e2', padding: '4px 8px', borderRadius: '4px' }}>
                                                <span>Discount ({invoiceData.discountPercent > 0 ? `${invoiceData.discountPercent}%` : 'Flat'}):</span>
                                                <span style={{ fontWeight: 'bold' }}>-₹{invoiceData.discountAmount}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '900' }}>
                                            <span>Grand Total:</span>
                                            <span style={{ color: '#0f766e' }}>₹{invoiceData.grandTotal}</span>
                                        </div>
                                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: '9px', marginTop: '2px' }}>
                                            (Inclusive of all taxes)
                                        </div>
                                    </div>
                                </div>

                            </div>

                            {/* Return Policy Note */}
                            <div style={{ marginTop: '20px', paddingTop: '10px', borderTop: '1px dashed #ccc', textAlign: 'center', fontSize: '11px', color: '#666' }}>
                                * Note: If you need to return any medicines, please bring the original bill along with you.<br/>
                                (Medicines will only be accepted for return along with the original invoice.)
                            </div>

                            {/* Footer Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    🖨️ Print Bill / Invoice
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowBillModal(false)}
                                    style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Close
                                </button>
                            </div>

                        </div>
                    </div>
                );
            })()}

            {showWalkInModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '16px' }}>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', width: '900px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>🛒 Walk-in / Outside Patient Billing</h2>
                            <button onClick={() => setShowWalkInModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>
                        
                        <form onSubmit={handleWalkInSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Patient Name *</label>
                                    <input required type="text" value={walkInForm.patientName} onChange={e => setWalkInForm({...walkInForm, patientName: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Phone Number</label>
                                    <input type="text" value={walkInForm.patientPhone} onChange={e => setWalkInForm({...walkInForm, patientPhone: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Doctor Name (Optional)</label>
                                    <select value={walkInForm.doctorName} onChange={e => setWalkInForm({...walkInForm, doctorName: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff' }}>
                                        <option value="">-- Select Doctor --</option>
                                        {(doctors || []).map((doc, idx) => (
                                            <option key={doc._id || idx} value={doc.name}>
                                                Dr. {doc.name} {doc.department ? `(${doc.department})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>Add Medicines from Inventory</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select 
                                        value={walkInSearch} 
                                        onChange={(e) => {
                                            const invId = e.target.value;
                                            if (!invId) return;
                                            const item = (inventory || []).find(i => i._id === invId);
                                            if (item) {
                                                setWalkInForm(prev => {
                                                    const exists = (prev.items || []).find(i => i.inventoryId === invId);
                                                    if (exists) return prev;
                                                    const unitPrice = item.price || item.sellingPrice || 15;
                                                    const gst = item.cgstPercent + item.sgstPercent || 12;
                                                    return {
                                                        ...prev,
                                                        items: [...(prev.items || []), {
                                                            inventoryId: item._id,
                                                            medicineName: item.name || item.medicineName || 'Medicine',
                                                            batch: item.batchNumber || 'N/A',
                                                            exp: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A',
                                                            quantity: 1,
                                                            dosage: '',
                                                            unitRate: unitPrice,
                                                            gstPercent: gst,
                                                            stock: item.stock,
                                                            unit: item.unit || 'units'
                                                        }]
                                                    };
                                                });
                                            }
                                            setWalkInSearch('');
                                        }}
                                        style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                    >
                                        <option value="">-- Search & Select Medicine --</option>
                                        {(inventory || []).filter(i => (i.stock || i.quantity || 0) > 0).map((item, idx) => {
                                            const itemName = item.name || item.medicineName || item.itemName || 'Unknown Medicine';
                                            const itemStock = item.stock || item.quantity || 0;
                                            const itemPrice = item.price || item.sellingPrice || 0;
                                            return (
                                                <option key={item._id || idx} value={item._id}>
                                                    {itemName} (Batch: {item.batchNumber || 'N/A'} | Stock: {itemStock} | ₹{itemPrice})
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                
                                {walkInForm.items.length > 0 && (
                                    <table style={{ width: '100%', marginTop: '12px', fontSize: '12px', textAlign: 'left', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                                <th style={{ padding: '8px' }}>Medicine Name</th>
                                                <th style={{ padding: '8px' }}>Qty</th>
                                                <th style={{ padding: '8px' }}>Dosage</th>
                                                <th style={{ padding: '8px' }}>Rate (₹)</th>
                                                <th style={{ padding: '8px' }}>Total (₹)</th>
                                                <th style={{ padding: '8px' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {walkInForm.items.map((item, idx) => {
                                                const total = item.quantity * item.unitRate;
                                                return (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.medicineName} <span style={{fontSize:'9px', color:'#64748b'}}>(Stk: {item.stock})</span></td>
                                                        <td style={{ padding: '8px' }}>
                                                            <input type="number" min="1" max={item.stock} value={item.quantity} onChange={(e) => {
                                                                const newItems = [...walkInForm.items];
                                                                newItems[idx].quantity = Number(e.target.value) || 1;
                                                                setWalkInForm({...walkInForm, items: newItems});
                                                            }} style={{ width: '50px', padding: '4px' }} />
                                                        </td>
                                                        <td style={{ padding: '8px' }}>
                                                            <input type="text" value={item.dosage || ''} onChange={(e) => {
                                                                const newItems = [...walkInForm.items];
                                                                newItems[idx].dosage = e.target.value;
                                                                setWalkInForm({...walkInForm, items: newItems});
                                                            }} style={{ width: '70px', padding: '4px' }} placeholder="BD, TDS..." />
                                                        </td>
                                                        <td style={{ padding: '8px' }}>{item.unitRate}</td>
                                                        <td style={{ padding: '8px' }}>{total.toFixed(2)}</td>
                                                        <td style={{ padding: '8px' }}>
                                                            <button type="button" onClick={() => {
                                                                const newItems = walkInForm.items.filter((_, i) => i !== idx);
                                                                setWalkInForm({...walkInForm, items: newItems});
                                                            }} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Calculations (Auto-updating) */}
                            {(() => {
                                let total = 0;
                                walkInForm.items.forEach(it => {
                                    total += (it.quantity * it.unitRate);
                                });
                                const discAmt = total * (walkInForm.discountPercent / 100);
                                const grand = total - discAmt;
                                
                                // Silently update state if needed, though we can just calc on submit
                                walkInForm.subtotal = total;
                                walkInForm.cgstAmount = 0;
                                walkInForm.sgstAmount = 0;
                                walkInForm.totalAmount = total;
                                walkInForm.discountAmount = discAmt;
                                walkInForm.grandTotal = grand;

                                return (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                        <div style={{ width: '250px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Subtotal:</span> <strong>₹{total.toFixed(2)}</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                                                <span>Discount (%):</span> 
                                                <input type="number" min="0" max="100" value={walkInForm.discountPercent} onChange={e => setWalkInForm({...walkInForm, discountPercent: Number(e.target.value)||0})} style={{ width: '60px', padding: '2px 4px', textAlign: 'right' }} />
                                            </div>
                                            {discAmt > 0 && <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'red', fontSize: '10px', marginBottom: '4px' }}>(-₹{discAmt.toFixed(2)})</div>}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold', color: '#0f766e' }}>
                                                <span>Grand Total:</span> <span>₹{grand.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', alignItems: 'center' }}>
                                <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', margin: 0 }}>Payment Mode:</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {['CASH', 'UPI', 'CARD', 'ONLINE'].map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setWalkInForm({...walkInForm, paymentMode: mode})}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '16px',
                                                    border: walkInForm.paymentMode === mode ? '2px solid #10b981' : '1px solid #cbd5e1',
                                                    backgroundColor: walkInForm.paymentMode === mode ? '#ecfdf5' : '#ffffff',
                                                    color: walkInForm.paymentMode === mode ? '#065f46' : '#64748b',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button type="button" onClick={() => setShowWalkInModal(false)} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" disabled={walkInSaving || walkInForm.items.length === 0} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {walkInSaving ? 'Saving...' : 'Generate Bill & Pay'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="pharmacy-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Pharmacy Orders</h2>
                    <p>Process prescriptions sent by doctors and confirm payments.</p>
                </div>
                <button 
                    onClick={() => setShowWalkInModal(true)}
                    style={{ padding: '10px 16px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(16,185,129,0.2)' }}
                >
                    <span style={{ fontSize: '18px' }}>+</span> Outside Patient Bill
                </button>
            </div>

            {/* KPI Cards */}
            <div className="pb-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div className="kpi-card" style={{ background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: '4px solid #10b981' }}>
                    <h4 style={{ margin: '0 0 5px', color: '#64748b', fontSize: '0.85rem' }}>Today's Collection</h4>
                    <h2 style={{ margin: 0, color: '#0f172a' }}>₹{(Number(calculatedStats?.todayCollection) || 0).toFixed(2)}</h2>
                    <small style={{ color: '#059669', fontWeight: 'bold' }}>Cash: ₹{(Number(calculatedStats?.todayCash) || 0).toFixed(2)} | Online: ₹{(Number(calculatedStats?.todayOnline) || 0).toFixed(2)}</small>
                </div>
                <div className="kpi-card" style={{ background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: '4px solid #3b82f6' }}>
                    <h4 style={{ margin: '0 0 5px', color: '#64748b', fontSize: '0.85rem' }}>Overall Collection</h4>
                    <h2 style={{ margin: 0, color: '#0f172a' }}>₹{(Number(calculatedStats?.overallCollection) || 0).toFixed(2)}</h2>
                    <small style={{ color: '#2563eb', fontWeight: 'bold' }}>Cash: ₹{(Number(calculatedStats?.overallCash) || 0).toFixed(2)} | Online: ₹{(Number(calculatedStats?.overallOnline) || 0).toFixed(2)}</small>
                </div>
                <div className="kpi-card" style={{ background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: '4px solid #f59e0b' }}>
                    <h4 style={{ margin: '0 0 5px', color: '#64748b', fontSize: '0.85rem' }}>Pending / Dr Guaranteed</h4>
                    <h2 style={{ margin: 0, color: '#0f172a' }}>₹{(Number(calculatedStats?.pendingCollection) || 0).toFixed(2)}</h2>
                    <small style={{ color: '#8b5cf6' }}>Dr Auth: ₹{(Number(calculatedStats?.doctorGuaranteedAmount) || 0).toFixed(2)}</small>
                </div>
            </div>

            <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#1e293b' }}>Pharmacy Billing Details</h4>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>GST Number</label>
                        <input 
                            type="text" 
                            value={billingSettings.gstin}
                            onChange={(e) => setBillingSettings(prev => ({...prev, gstin: e.target.value}))}
                            placeholder="Enter GSTIN"
                            style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>Drug License (DL) Number</label>
                        <input 
                            type="text" 
                            value={billingSettings.dlNumber}
                            onChange={(e) => setBillingSettings(prev => ({...prev, dlNumber: e.target.value}))}
                            placeholder="Enter DL Number"
                            style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div>
                        <button 
                            type="button" 
                            onClick={handleUpdateBillingSettings}
                            style={{ padding: '8px 16px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            Save Details
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters Section */}
            <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <input 
                        type="text"
                        placeholder="Search by Patient Name, Phone or Doctor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }}
                    />
                </div>
                <div>
                    <input 
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }}
                    />
                </div>
                <div>
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', backgroundColor: '#fff' }}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Pending">Pending / Upcoming</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>
                <div>
                    <button 
                        onClick={() => { setSearchTerm(''); setDateFilter(''); setStatusFilter('All'); }}
                        style={{ padding: '10px 16px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        Clear Filters
                    </button>
                </div>
            </div>

            <div className="inventory-table-wrapper">
                {loading ? <div className="loader">Loading Orders...</div> : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Patient Details</th>
                                <th>Doctor</th>
                                <th>Prescribed Items</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(orders || []).filter(order => {
                                let matchesSearch = true;
                                if (searchTerm) {
                                    const lowerSearch = searchTerm.toLowerCase();
                                    const patientName = String(order.isOutsidePatient ? order.patientName : order.userId?.name || '').toLowerCase();
                                    const patientPhone = String(order.isOutsidePatient ? order.patientPhone : order.patientId || order.patient?.uhid || '').toLowerCase();
                                    const doctorName = String(order.isOutsidePatient ? order.doctorName : order.doctorId?.name || '').toLowerCase();
                                    matchesSearch = patientName.includes(lowerSearch) || patientPhone.includes(lowerSearch) || doctorName.includes(lowerSearch);
                                }
                                
                                let matchesDate = true;
                                if (dateFilter) {
                                    const orderDate = order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '';
                                    matchesDate = orderDate === dateFilter;
                                }

                                let matchesStatus = true;
                                if (statusFilter !== 'All') {
                                    if (statusFilter === 'Pending') {
                                        matchesStatus = order.orderStatus === 'Upcoming' || order.orderStatus === 'Pending';
                                    } else if (statusFilter === 'Completed') {
                                        matchesStatus = order.orderStatus === 'Completed';
                                    }
                                }
                                
                                return matchesSearch && matchesDate && matchesStatus;
                            }).map((order) => {
                                const orderItems = order.items || order.prescribedItems || [];
                                const calculatedData = getInvoiceCalculations(order);
                                return (
                                    <tr key={order._id}>
                                        <td>
                                            <div style={{ fontWeight: 'bold' }}>{order.isOutsidePatient ? order.patientName : order.userId?.name}</div>
                                            {order.isOutsidePatient ? (
                                                <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 'bold' }}>[Walk-in] {order.patientPhone}</div>
                                            ) : (
                                                <div style={{ fontSize: '0.8rem', color: '#666' }}>{order.patientId}</div>
                                            )}
                                        </td>
                                        <td>Dr. {order.isOutsidePatient ? (order.doctorName || 'N/A') : order.doctorId?.name}</td>
                                        <td>
                                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                                                {orderItems.map((item, idx) => (
                                                    <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        {order.orderStatus === 'Upcoming' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked(order._id, idx)}
                                                                onChange={() => toggleCheck(order._id, idx)}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                        ) : (
                                                            <span style={{ color: (item.purchased || order.orderStatus === 'Completed' || order.paymentStatus === 'Paid' || order.paymentStatus === 'PAID_BY_DOCTOR') ? '#16a34a' : '#ef4444' }}>
                                                                {(item.purchased || order.orderStatus === 'Completed' || order.paymentStatus === 'Paid' || order.paymentStatus === 'PAID_BY_DOCTOR') ? '✓' : '✗'}
                                                            </span>
                                                        )}
                                                        <span style={{ textDecoration: order.orderStatus !== 'Upcoming' && !(item.purchased || order.orderStatus === 'Completed' || order.paymentStatus === 'Paid' || order.paymentStatus === 'PAID_BY_DOCTOR') ? 'line-through' : 'none', color: order.orderStatus !== 'Upcoming' && !(item.purchased || order.orderStatus === 'Completed' || order.paymentStatus === 'Paid' || order.paymentStatus === 'PAID_BY_DOCTOR') ? '#999' : '#000' }}>
                                                            {item.medicineName} ({item.frequency})
                                                            {item.price > 0 && (
                                                                <span style={{ marginLeft: '6px', color: '#059669', fontWeight: '600', fontSize: '0.8rem' }}>₹{item.price}</span>
                                                            )}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                        <td className="p-3 text-sm font-semibold text-gray-800">
                                            {Number(calculatedData.discountAmount) > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.8rem' }}>₹{(Number(calculatedData.subtotal) + Number(calculatedData.totalTax)).toFixed(2)}</span>
                                                    <span style={{ color: '#0f172a' }}>₹{calculatedData.grandTotal}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 'bold' }}>
                                                        Disc: ₹{calculatedData.discountAmount}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span>₹{calculatedData.grandTotal}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${order.orderStatus === 'Completed' ? 'status-active' : 'status-low'}`}>
                                                {order.orderStatus}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{
                                                color: (order.paymentStatus === 'PAID_BY_DOCTOR' || order.paymentMode === 'DOCTOR_AUTHORIZATION') ? '#d97706' : (order.paymentStatus === 'Paid' ? '#166534' : (order.orderStatus === 'Completed' && order.paymentStatus === 'Pending' ? '#000' : '#991b1b')),
                                                fontWeight: 'bold'
                                            }}>
                                                {order.orderStatus === 'Completed' && order.paymentStatus === 'Pending' ? '-' : ((order.paymentStatus === 'PAID_BY_DOCTOR' || order.paymentMode === 'DOCTOR_AUTHORIZATION') ? (order.authorizedDoctorName || order.doctorName || order.doctorId?.name ? `Pending by Doctor - ${order.authorizedDoctorName || order.doctorName || order.doctorId?.name}` : 'Doctor Approval Pending') : (order.paymentStatus === 'Paid' ? `Paid ${order.paymentMode ? `(${order.paymentMode})` : ''}` : order.paymentStatus))}
                                            </span>
                                        </td>
                                        <td style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    console.log("VIEW BILL CLICKED! Selected Order:", order);
                                                    setSelectedOrder(order);
                                                    setShowBillModal(true);
                                                }}
                                                style={{
                                                    backgroundColor: '#0284c7',
                                                    color: '#ffffff',
                                                    padding: '6px 14px',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                📋 View Bill
                                            </button>
                                            {order.orderStatus === 'Upcoming' && (
                                                <button
                                                    className="btn-add"
                                                    style={{ padding: '8px 16px', fontSize: '0.8rem', background: '#dcfce7', color: '#166534', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        openPaymentModal(order);
                                                    }}
                                                >
                                                    Dispense & Collect
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Payment Collection Modal */}
            {showPaymentModal && paymentFlowOrder && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2>Confirm Payment & Dispense</h2>
                            <button className="close-button" onClick={() => setShowPaymentModal(false)}>×</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ fontWeight: 'bold' }}>Payment Received From</label>
                                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                                    <label>
                                        <input type="radio" name="paymentSource" value="Patient" checked={paymentSource === 'Patient'} onChange={() => setPaymentSource('Patient')} /> Patient
                                    </label>
                                    <label>
                                        <input type="radio" name="paymentSource" value="Doctor" checked={paymentSource === 'Doctor'} onChange={() => setPaymentSource('Doctor')} /> Pending by Doctor
                                    </label>
                                </div>
                            </div>

                            {paymentSource === 'Doctor' && (
                                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
                                    <div className="form-group" style={{ marginBottom: '10px' }}>
                                        <label style={{ color: '#8b5cf6', fontWeight: 'bold' }}>Select Authorizing Doctor *</label>
                                        <select
                                            value={authorizedByDoctor}
                                            onChange={(e) => setAuthorizedByDoctor(e.target.value)}
                                            style={{ borderColor: '#8b5cf6', width: '100%', padding: '8px' }}
                                        >
                                            <option value="">-- Select Doctor --</option>
                                            {(doctors || []).map(dr => (
                                                <option key={dr._id} value={dr._id}>Dr. {dr.name || dr.userId?.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Authorization Note</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Doctor verbally approved"
                                            value={authorizationNote}
                                            onChange={(e) => setAuthorizationNote(e.target.value)}
                                            style={{ width: '100%', padding: '8px' }}
                                        />
                                    </div>
                                </div>
                            )}

                            {paymentSource === 'Patient' && (
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>Payment Mode</label>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {['CASH', 'UPI', 'CARD', 'ONLINE'].map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setPaymentMode(mode)}
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius: '20px',
                                                    border: String(paymentMode).toUpperCase() === mode ? '2px solid #10b981' : '1px solid #cbd5e1',
                                                    backgroundColor: String(paymentMode).toUpperCase() === mode ? '#ecfdf5' : '#ffffff',
                                                    color: String(paymentMode).toUpperCase() === mode ? '#065f46' : '#475569',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {mode === 'ONLINE' ? 'Online / Net Banking' : mode}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                                This will instantly complete the order, decrement stock, and log the payment.
                            </p>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '15px', borderTop: '1px solid #eee' }}>
                            <button className="erp-button secondary" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                            <button className="erp-button primary" onClick={() => {
                                if (paymentSource === 'Doctor' && !authorizedByDoctor) {
                                    return alert('Please select an authorizing doctor.');
                                }
                                let selectedDoctorName = '';
                                if (authorizedByDoctor) {
                                    const doc = doctors.find(d => d._id === authorizedByDoctor);
                                    if (doc) selectedDoctorName = doc.name;
                                }
                                const paymentFlowItems = paymentFlowOrder.items || paymentFlowOrder.prescribedItems || [];
                                const calcData = getInvoiceCalculations(paymentFlowOrder, discountPercent);
                                const payload = {
                                    purchasedIndices: Array.from({ length: paymentFlowItems.length }, (_, i) => i),
                                    updatedItems: paymentFlowItems,
                                    paymentMode: paymentSource === 'Doctor' ? 'DOCTOR_AUTHORIZATION' : paymentMode.toUpperCase(),
                                    paymentStatus: paymentSource === 'Doctor' ? 'PAID_BY_DOCTOR' : 'Paid',
                                    authorizedByDoctor: paymentSource === 'Doctor' ? authorizedByDoctor : undefined,
                                    authorizedDoctorName: paymentSource === 'Doctor' ? selectedDoctorName : undefined,
                                    authorizationNote: paymentSource === 'Doctor' ? authorizationNote : undefined,
                                    discountPercent: discountPercent,
                                    discountAmount: Number(calcData.discountAmount) || 0,
                                    frontendTotals: {
                                        taxableAmount: calcData.subtotal,
                                        cgstAmount: calcData.cgst,
                                        sgstAmount: calcData.sgst,
                                        totalAmount: calcData.grandTotal
                                    }
                                };
                                setShowPaymentModal(false);
                                handleCompleteOrder(paymentFlowOrder._id, payload, paymentFlowItems.length);
                            }}>Confirm & Dispense</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default React.memo(PharmacyOrders);

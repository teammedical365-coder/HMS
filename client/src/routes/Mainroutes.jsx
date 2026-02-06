import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Components
import Navbar from '../components/Navbar';
import Home from '../pages/Home';
import ProtectedRoute from '../components/ProtectedRoute';

// User Pages
import Services from '../pages/user/Services';
import Doctors from '../pages/user/Doctors';
import Appointment from '../pages/user/Appointment';
import AppointmentSuccess from '../pages/user/AppointmentSuccess';
import LabReports from '../pages/user/LabReports';
import Dashboard from '../pages/user/Dashboard';
import Pharmacy from '../pages/user/Pharmacy';
import Login from '../pages/user/Login';
import Signup from '../pages/user/Signup';

// Doctor Pages
import Patient from '../pages/doctors/Patient';
import DoctorPatientDetails from '../pages/doctors/DoctorPatientDetails';
import DoctorDashboard from '../pages/doctors/DoctorDashboard'; // Ensure this exists if used

// Admin Pages
import Admin from '../pages/admin/Admin';
import AdminDoctors from '../pages/admin/AdminDoctors';
import AdminLabs from '../pages/admin/AdminLabs';
import AdminPharmacy from '../pages/admin/AdminPharmacy';
import AdminReception from '../pages/admin/AdminReception';
import AdminServices from '../pages/admin/AdminServices';

// Admin Auth
import AdminLogin from '../pages/administration/AdminLogin';
import AdminSignup from '../pages/administration/AdminSignup';
import Administrator from '../pages/administration/Administrator';

// Lab Pages
import LabDashboard from '../pages/lab/LabDashboard';
import AssignedTests from '../pages/lab/AssignedTests';
// import CompletedReports from '../pages/lab/CompletedReports'; // Uncomment if created

// Pharmacy Management Pages
import PharmacyInventory from '../pages/pharmacy/PharmacyInventory';
import PharmacyOrders from '../pages/pharmacy/PharmacyOrders';

// Reception Pages
import ReceptionDashboard from '../pages/reception/ReceptionDashboard';

const MainRoutes = () => {
    return (
        <>
            <Navbar />

            <Routes>
                {/* --- Public/User Routes --- */}
                <Route path="/" element={<Home />} />
                <Route path="/services" element={<Services />} />
                <Route path="/doctors" element={<Doctors />} />
                <Route path="/services/:serviceId/doctors" element={<Doctors />} />

                <Route path="/appointment" element={<Appointment />} />
                <Route path="/appointment/success" element={<AppointmentSuccess />} />
                <Route path="/lab-reports" element={<LabReports />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pharmacy" element={<Pharmacy />} />

                {/* --- Authentication --- */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />

                {/* --- Doctor Routes --- */}
                <Route path="/doctor/dashboard" element={
                    <ProtectedRoute allowedRoles={['doctor']}>
                        <Patient />
                    </ProtectedRoute>
                } />
                <Route path="/doctor/patients" element={
                    <ProtectedRoute allowedRoles={['doctor']}>
                        <Patient />
                    </ProtectedRoute>
                } />

                {/* --- CRITICAL FIX HERE: Changed :patientId to :appointmentId --- */}
                <Route path="/doctor/patient/:appointmentId" element={
                    <ProtectedRoute allowedRoles={['doctor']}>
                        <DoctorPatientDetails />
                    </ProtectedRoute>
                } />

                {/* --- Admin Routes (Manager) --- */}
                <Route path="/admin" element={
                    <ProtectedRoute allowedRoles={['admin', 'administrator']}>
                        <Admin />
                    </ProtectedRoute>
                } />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/signup" element={<AdminSignup />} />

                <Route path="/admin/doctors" element={<ProtectedRoute allowedRoles={['admin', 'administrator']}><AdminDoctors /></ProtectedRoute>} />
                <Route path="/admin/labs" element={<ProtectedRoute allowedRoles={['admin', 'administrator']}><AdminLabs /></ProtectedRoute>} />
                <Route path="/admin/pharmacy" element={<ProtectedRoute allowedRoles={['admin', 'administrator']}><AdminPharmacy /></ProtectedRoute>} />
                <Route path="/admin/reception" element={<ProtectedRoute allowedRoles={['admin', 'administrator']}><AdminReception /></ProtectedRoute>} />
                <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['admin', 'administrator']}><AdminServices /></ProtectedRoute>} />

                {/* --- Administrator Routes (Super Admin) --- */}
                <Route path="/administrator/login" element={<AdminLogin />} />
                <Route path="/administrator/signup" element={<AdminSignup />} />
                <Route path="/administrator" element={
                    <ProtectedRoute allowedRoles={['administrator']}>
                        <Administrator />
                    </ProtectedRoute>
                } />

                {/* --- Lab Routes --- */}
                <Route path="/lab/dashboard" element={
                    <ProtectedRoute allowedRoles={['lab']}>
                        <LabDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/lab/tests" element={
                    <ProtectedRoute allowedRoles={['lab']}>
                        <AssignedTests />
                    </ProtectedRoute>
                } />

                {/* --- Pharmacy Management Routes --- */}
                <Route path="/pharmacy/inventory" element={
                    <ProtectedRoute allowedRoles={['pharmacy']}>
                        <PharmacyInventory />
                    </ProtectedRoute>
                } />
                <Route path="/pharmacy/orders" element={
                    <ProtectedRoute allowedRoles={['pharmacy']}>
                        <PharmacyOrders />
                    </ProtectedRoute>
                } />

                {/* --- Reception Routes --- */}
                <Route path="/reception/dashboard" element={
                    <ProtectedRoute allowedRoles={['reception']}>
                        <ReceptionDashboard />
                    </ProtectedRoute>
                } />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </>
    );
};

export default MainRoutes;
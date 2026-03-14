import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Components
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RoleDashboard from '../pages/RoleDashboard';
import { useAuth } from '../store/hooks';

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
import AdminLabTests from '../pages/admin/AdminLabTests';
import DoctorPatientDetails from '../pages/doctors/DoctorPatientDetails';
import UnifiedPatientProfile from '../pages/patient/UnifiedPatientProfile';

// Hospital Admin (Tier 2) Pages
import Admin from '../pages/admin/Admin';
import AdminDoctors from '../pages/admin/AdminDoctors';
import AdminLabs from '../pages/admin/AdminLabs';
import AdminPharmacy from '../pages/admin/AdminPharmacy';
import AdminReception from '../pages/admin/AdminReception';
import AdminServices from '../pages/admin/AdminServices';
import AdminRoles from '../pages/admin/AdminRoles';
import AdminMainDashboard from '../pages/admin/AdminMainDashboard';
import AdminMedicines from '../pages/admin/AdminMedicines';
import AdminQuestionLibrary from '../pages/admin/AdminQuestionLibrary';
import AdminTestPackages from '../pages/admin/AdminTestPackages';

// Central Admin (Tier 1) Pages — /supremeadmin
import CentralAdminLogin from '../pages/centraladmin/CentralAdminLogin';
import CentralAdminSignup from '../pages/centraladmin/CentralAdminSignup';
import CentralAdminDashboard from '../pages/centraladmin/CentralAdminDashboard';

// Hospital Admin (Tier 2) Pages — /hospitaladmin
import HospitalAdminLogin from '../pages/hospitaladmin/HospitalAdminLogin';
import HospitalAdminDashboard from '../pages/hospitaladmin/HospitalAdminDashboard';
import HospitalLogin from '../pages/hospitaladmin/HospitalLogin';
import HospitalAdminQuestionLibrary from '../pages/hospitaladmin/HospitalAdminQuestionLibrary';

// Cashier Routing
import CashierDashboard from '../pages/cashier/CashierDashboard';

// Legacy Admin Auth (keep for backward-compat)
import AdminLogin from '../pages/administration/AdminLogin';
import AdminSignup from '../pages/administration/AdminSignup';

// Lab Pages
import LabDashboard from '../pages/lab/LabDashboard';
import AssignedTests from '../pages/lab/AssignedTests';

// Pharmacy Management Pages
import PharmacyInventory from '../pages/pharmacy/PharmacyInventory';
import PharmacyOrders from '../pages/pharmacy/PharmacyOrders';

// Reception Pages
import ReceptionDashboard from '../pages/reception/ReceptionDashboard';

// Accountant / Finance Pages
import AccountantDashboard from '../pages/accountant/AccountantDashboard';

const MainRoutes = () => {
    const { isAuthenticated } = useAuth();
    
    return (
        <>
            <Navbar />

            <Routes>
                {/* --- Public/User Routes --- */}
                <Route path="/" element={<Navigate to={isAuthenticated ? "/my-dashboard" : "/login"} replace />} />
                <Route path="/services" element={<Navigate to="/" replace />} />
                <Route path="/doctors" element={<Navigate to="/" replace />} />
                <Route path="/services/:serviceId/doctors" element={<Navigate to="/" replace />} />

                {/* --- Unified Shared Patient Profile --- */}
                <Route path="/patient/:id" element={
                    <ProtectedRoute requiredPermissions={[]}>
                        <UnifiedPatientProfile />
                    </ProtectedRoute>
                } />

                {/* --- Dynamic Role Dashboard (all authenticated users) --- */}
                <Route path="/my-dashboard" element={
                    <ProtectedRoute requiredPermissions={[]}>
                        <RoleDashboard />
                    </ProtectedRoute>
                } />

                <Route path="/appointment" element={<Appointment />} />
                <Route path="/appointment/success" element={<AppointmentSuccess />} />
                <Route path="/lab-reports" element={<LabReports />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pharmacy" element={<Pharmacy />} />

                {/* --- Authentication --- */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />

                {/* --- Doctor Routes (permission: visit_diagnose) --- */}
                <Route path="/doctor/dashboard" element={
                    <ProtectedRoute requiredPermissions={['visit_diagnose']}>
                        <Patient />
                    </ProtectedRoute>
                } />
                <Route path="/doctor/patients" element={<Patient />} />
                <Route path="/doctor/patient/:appointmentId" element={
                    <ProtectedRoute requiredPermissions={['visit_diagnose']}>
                        <DoctorPatientDetails />
                    </ProtectedRoute>
                } />

                {/* --- Hospital Admin Routes (both centraladmin and hospitaladmin can access) --- */}
                <Route path="/admin" element={
                    <ProtectedRoute requiredPermissions={['admin_view_stats', 'admin_manage_roles']}>
                        <AdminMainDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                    <ProtectedRoute requiredPermissions={['admin_manage_roles']}>
                        <Admin />
                    </ProtectedRoute>
                } />

                {/* Legacy admin login — redirect to hospitaladmin login for backward-compat */}
                <Route path="/admin/login" element={<HospitalAdminLogin />} />
                <Route path="/admin/signup" element={<AdminSignup />} />

                <Route path="/admin/doctors" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminDoctors /></ProtectedRoute>} />
                <Route path="/admin/labs" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabs /></ProtectedRoute>} />
                <Route path="/admin/lab-tests" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabTests /></ProtectedRoute>} />
                <Route path="/admin/pharmacy" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminPharmacy /></ProtectedRoute>} />
                <Route path="/admin/reception" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminReception /></ProtectedRoute>} />
                <Route path="/admin/services" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminServices /></ProtectedRoute>} />
                <Route path="/admin/roles" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminRoles /></ProtectedRoute>} />
                <Route path="/admin/medicines" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminMedicines /></ProtectedRoute>} />
                <Route path="/admin/question-library" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminQuestionLibrary /></ProtectedRoute>} />
                <Route path="/admin/test-packages" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminTestPackages /></ProtectedRoute>} />

                {/* =====================================================
                    CENTRAL ADMIN ROUTES (Tier 1 — Top Level)
                    Login: /supremeadmin/login
                    Dashboard: /supremeadmin
                    ===================================================== */}
                <Route path="/supremeadmin/login" element={<CentralAdminLogin />} />
                <Route path="/supremeadmin/signup" element={<CentralAdminSignup />} />
                <Route path="/supremeadmin" element={
                    <ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}>
                        <CentralAdminDashboard />
                    </ProtectedRoute>
                } />

                {/* Legacy routes — redirect to new URLs */}
                <Route path="/superadmin/login" element={<Navigate to="/supremeadmin/login" replace />} />
                <Route path="/superadmin/signup" element={<Navigate to="/supremeadmin/signup" replace />} />
                <Route path="/superadmin" element={<Navigate to="/supremeadmin" replace />} />

                {/* =====================================================
                    HOSPITAL SLUG LOGIN (Path-based multi-tenancy)
                    URL: /:hospitalSlug/login  e.g. /akg-hospital/login
                    Staff access their hospital's isolated portal via this URL
                    ===================================================== */}
                <Route path="/:hospitalSlug/login" element={<HospitalLogin />} />

                {/* =====================================================
                    HOSPITAL ADMIN ROUTES (Tier 2 — Hospital Level)
                    Login: /hospitaladmin/login
                    Dashboard: /hospitaladmin
                    ===================================================== */}
                <Route path="/hospitaladmin/login" element={<HospitalAdminLogin />} />
                <Route path="/hospitaladmin" element={
                    <ProtectedRoute allowedRoles={['hospitaladmin']}>
                        <HospitalAdminDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/hospitaladmin/question-library" element={
                    <ProtectedRoute allowedRoles={['hospitaladmin']}>
                        <HospitalAdminQuestionLibrary />
                    </ProtectedRoute>
                } />

                {/* --- Lab Routes (permission: lab_view, lab_manage) --- */}
                <Route path="/lab/dashboard" element={
                    <ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}>
                        <LabDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/lab/tests" element={
                    <ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}>
                        <AssignedTests />
                    </ProtectedRoute>
                } />

                {/* --- Pharmacy Management Routes (permission: pharmacy_view, pharmacy_manage) --- */}
                <Route path="/pharmacy/inventory" element={
                    <ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}>
                        <PharmacyInventory />
                    </ProtectedRoute>
                } />
                <Route path="/pharmacy/orders" element={
                    <ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}>
                        <PharmacyOrders />
                    </ProtectedRoute>
                } />

                {/* --- Reception Routes (permission: appointment_manage) --- */}
                <Route path="/reception/dashboard" element={
                    <ProtectedRoute requiredPermissions={['appointment_manage']}>
                        <ReceptionDashboard />
                    </ProtectedRoute>
                } />

                {/* --- Accountant / Finance Dashboard --- */}
                <Route path="/accountant/dashboard" element={
                    <ProtectedRoute requiredPermissions={['finance_view']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}>
                        <AccountantDashboard />
                    </ProtectedRoute>
                } />

                {/* --- Cashier / Billing Dashboard --- */}
                <Route path="/cashier/billing" element={
                    <ProtectedRoute requiredPermissions={['billing_view', 'billing_manage']} allowedRoles={['cashier', 'centraladmin', 'superadmin', 'hospitaladmin']}>
                        <CashierDashboard />
                    </ProtectedRoute>
                } />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </>
    );
};

export default MainRoutes;

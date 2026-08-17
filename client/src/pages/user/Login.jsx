import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginUser, clearError } from '../../store/slices/authSlice';
import { motion } from 'framer-motion';
import { RiInformationLine } from 'react-icons/ri';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { loading, error, isAuthenticated, user } = useAuth();

  const [formData, setFormData] = useState({ email: '', password: '' });

  useEffect(() => { dispatch(clearError()); }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const redirectMap = {
        admin: '/admin', superadmin: '/superadmin', doctor: '/doctor/patients',
        nurse: '/doctor/patients', lab: '/lab/dashboard', pharmacy: '/pharmacy/dashboard',
        reception: '/reception/dashboard', receptionist: '/reception/dashboard', accountant: '/accountant/dashboard', patient: '/dashboard',
        hospitaladmin: '/hospitaladmin', 'clinic doctor': '/hospitaladmin'
      };
      const role = (user.role || '').toLowerCase();
      let targetPath = redirectMap[role] || searchParams.get('redirect') || '/my-dashboard';
      if (role === 'doctor' && user.clinicType === 'clinic') {
        targetPath = '/hospitaladmin';
      }
      navigate(targetPath);
    }
  }, [isAuthenticated, user, navigate, searchParams]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    if (!formData.email || !formData.password) return;
    await dispatch(loginUser({ email: formData.email, password: formData.password }));
  };

  return (
    <section className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl border border-slate-100"
      >
        <div className="text-center">
            <img src="https://www.medical365.in/logo/medical365fav.jpg" alt="Medical 365" className="max-w-[180px] h-auto mx-auto mb-4" />
        </div>

        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Global Instance Login</h3>
          <p className="text-sm text-slate-500 mt-1">Access management for distributed medical nodes.</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 text-slate-900 font-bold mb-2">
              <RiInformationLine className="text-teal-500 text-xl" />
              Secure Access Only
          </div>
          <p className="m-0 text-sm text-slate-500 leading-relaxed">
            For enhanced data isolation, you must sign in through your <strong>private hospital portal link</strong>.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <div className="text-sm text-yellow-800">
              <strong>Access Tip:</strong> Check your institution's registration email for your unique login URL.
          </div>
        </div>

        <div className="text-center mt-8 text-xs text-slate-400 font-medium">
          System-wide isolation enabled
        </div>
      </motion.div>
    </section>
  );
};

export default Login;
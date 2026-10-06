import React from 'react';
import { Navigate } from 'react-router-dom';

const PatientProtectedRoute = ({ children }) => {
  const patientToken = localStorage.getItem('patientToken') || localStorage.getItem('token');
  const patientUser = localStorage.getItem('patientUser') || localStorage.getItem('user');

  if (!patientToken || !patientUser) {
    return <Navigate to="/patient" replace />;
  }

  return children;
};

export default PatientProtectedRoute;

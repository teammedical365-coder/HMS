import { useDispatch, useSelector } from 'react-redux';
import { useMemo } from 'react';

// Typed hooks for better TypeScript-like experience
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;

// Memoized selectors for performance
export const useAuth = () => {
  return useAppSelector((state) => state.auth);
};

export const useAppointments = () => {
  return useAppSelector((state) => state.appointments);
};

export const useDoctors = () => {
  return useAppSelector((state) => state.doctors);
};

export const usePublicData = () => {
  return useAppSelector((state) => state.publicData);
};

export const useAdminEntities = () => {
  return useAppSelector((state) => state.adminEntities);
};

export const useServices = () => {
  return useAppSelector((state) => state.services);
};

// FIXED: Simplified Data Hooks to prevent "undefined" crashes
export const useCachedServices = () => {
  const { services, loading, error } = useAppSelector(
    (state) => state.publicData
  );
  
  // Return structure compatible with your components
  return {
    services: services || [],
    loading,
    error,
    isCached: false // Caching handled by browser/network layer for simplicity
  };
};

export const useCachedDoctors = (serviceId = null) => {
  const { doctors, loading, error } = useAppSelector(
    (state) => state.publicData
  );
  
  // Return structure compatible with your components
  return {
    doctors: doctors || [],
    loading,
    error,
    isCached: false
  };
};
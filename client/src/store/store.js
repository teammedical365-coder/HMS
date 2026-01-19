import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import appointmentReducer from './slices/appointmentSlice';
import doctorReducer from './slices/doctorSlice';
import serviceReducer from './slices/serviceSlice';
import publicDataReducer from './slices/publicDataSlice';
import adminEntitiesReducer from './slices/adminEntitiesSlice';
import labReducer from './slices/labSlice'; // Import the new Lab Slice
import { setStoreRef } from './storeRef';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    appointments: appointmentReducer,
    doctors: doctorReducer,
    services: serviceReducer,
    publicData: publicDataReducer,
    adminEntities: adminEntitiesReducer,
    lab: labReducer, // Register the Lab Reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these specific action types for serializability checks
        // (Useful if you use redux-persist or pass non-serializable data)
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

// Set store reference for use in API interceptors (e.g., for logging out on 401)
setStoreRef(store);

export default store;
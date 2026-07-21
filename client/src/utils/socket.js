import io from 'socket.io-client';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : (import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com');

const socket = io(API_BASE_URL, {
    autoConnect: false // Connect manually when authenticated
});

export default socket;

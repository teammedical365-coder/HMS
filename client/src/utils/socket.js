import io from 'socket.io-client';

const rawBaseUrl = import.meta.env.DEV ? 'http://localhost:3000' : (import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com');
const API_BASE_URL = rawBaseUrl.startsWith('http') ? rawBaseUrl : `https://${rawBaseUrl}`;

const socket = io(API_BASE_URL, {
    autoConnect: false // Connect manually when authenticated
});

export default socket;

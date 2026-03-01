import io from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const socket = io(API_BASE_URL, {
    autoConnect: false // Connect manually when authenticated
});

export default socket;

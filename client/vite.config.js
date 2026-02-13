import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // Add this proxy configuration to connect to Backend
        proxy: {
            '/api': {
                target: 'http://localhost:3000', // Matches your server.js PORT
                changeOrigin: true,
                secure: false,
            },
        },
        historyApiFallback: true,
    }
})
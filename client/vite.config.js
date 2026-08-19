import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    base: './', // <--- FIXED: Capacitor mein CSS aur Images load karne ke liye zaroori hai
    plugins: [react()],

    // --- BUILD SECTION TO FIX REDUX ---
    build: {
        commonjsOptions: {
            transformMixedEsModules: true,
            include: [/use-sync-external-store/, /node_modules/],
        },
    },
    // ----------------------------------

    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        },
        historyApiFallback: true,
    }
})
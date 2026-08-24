import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    base: './', // <--- FIXED: Capacitor mein CSS aur Images load karne ke liye zaroori hai
    plugins: [react()],

    // --- BUILD SECTION TO FIX REDUX & CHUNK SPLITTING ---
    build: {
        commonjsOptions: {
            transformMixedEsModules: true,
            include: [/use-sync-external-store/, /node_modules/],
        },
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom') || id.includes('@reduxjs') || id.includes('react-redux') || id.includes('use-sync-external-store')) {
                            return 'vendor-react';
                        }
                        if (id.includes('framer-motion')) {
                            return 'vendor-motion';
                        }
                        if (id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('html2canvas') || id.includes('dompurify')) {
                            return 'vendor-pdf';
                        }
                        if (id.includes('react-icons')) {
                            return 'vendor-icons';
                        }
                        if (id.includes('lenis') || id.includes('axios') || id.includes('socket.io-client')) {
                            return 'vendor-utils';
                        }
                    }
                }
            }
        }
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
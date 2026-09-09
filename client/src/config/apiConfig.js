/**
 * apiConfig.js — Centralized API configuration for Medical365 HMS
 * Independent configuration module to eliminate circular dependencies.
 */

const liveBackend = 'https://hms-n6nk.onrender.com';
const rawBaseURL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || liveBackend;

export const baseURL = rawBaseURL.startsWith('http') ? rawBaseURL : `https://${rawBaseURL}`;

/**
 * API Configuration Utility
 * 
 * Centralizes API base URL configuration for production and development.
 * In development, uses relative paths (works with Vite proxy).
 * In production, uses the configured backend URL.
 */

// Get API base URL from environment variable or use default
const getApiBaseUrl = () => {
  // Check for Vite environment variable (prefixed with VITE_)
  const envApiUrl = import.meta.env.VITE_API_URL;
  
  if (envApiUrl) {
    // Remove trailing slash if present
    return envApiUrl.replace(/\/$/, '');
  }
  
  // Default to Koyeb backend URL
  const defaultApiUrl = 'https://certain-cathyleen-atlascare-deploy-eaa43123.koyeb.app';
  
  // In development, return empty string to use relative paths (Vite proxy)
  // In production, use the configured URL
  if (import.meta.env.DEV) {
    return ''; // Empty string = relative paths (uses Vite proxy)
  }
  
  return defaultApiUrl;
};

// Export the base URL
export const API_BASE_URL = getApiBaseUrl();

/**
 * Build full API URL from endpoint path
 * @param {string} endpoint - API endpoint path (e.g., '/api/login')
 * @returns {string} Full URL
 */
export const getApiUrl = (endpoint) => {
  // Ensure endpoint starts with /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // If API_BASE_URL is empty (dev mode), return relative path
  if (!API_BASE_URL) {
    return path;
  }
  
  // Return full URL
  return `${API_BASE_URL}${path}`;
};

/**
 * Helper function for fetch with automatic API URL
 * @param {string} endpoint - API endpoint path
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>}
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = getApiUrl(endpoint);
  return fetch(url, options);
};

export default {
  API_BASE_URL,
  getApiUrl,
  apiFetch
};


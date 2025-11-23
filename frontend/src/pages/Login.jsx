import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLogIn, FiUser, FiLock, FiAlertCircle } from 'react-icons/fi';
import { getApiUrl } from '../utils/api';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Set the document title for the page
  useEffect(() => {
    document.title = 'AtlasCare | Sign in';
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setError('');
    setIsSubmitting(true);
    setIsLoading(true);

    // Simple validation
    if (!formData.username.trim() || !formData.password) {
      setError('Please enter both username and password');
      setIsSubmitting(false);
      setIsLoading(false);
      return;
    }

    try {
      // In a real app, this would be an API call to your backend
      const response = await fetch(getApiUrl('/api/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        // Store JWT for authorized API calls
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
        }
        // Store user info for frontend use
        if (data.fullName) {
          localStorage.setItem('user_fullName', data.fullName);
        }
        if (data.specialty) {
          localStorage.setItem('user_specialty', data.specialty);
        }
        onLogin({ username: formData.username, role: data.role });
        // Add a small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Redirect based on role
        navigate(data.role === 'doctor' ? '/doctor' : '/pharmacist');
      } else {
        setError(data.message || 'Invalid credentials');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError('Failed to connect to the server. Please try again.');
      console.error('Login error:', err);
      setIsSubmitting(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="mb-8 text-center">
          <img 
            src="/Logo-V2.png" 
            alt="AtlasCare Logo" 
            className="w-48 h-auto mx-auto mb-2 drop-shadow-lg"
            style={{ filter: 'brightness(1.0) contrast(1.0)' }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <p className="text-lg font-semibold text-slate-700 mb-6">
            <span className="text-teal-600">Care,</span><span className="text-blue-600">Connected</span>
          </p>
        </div>

        {/* Features Section - Horizontal Layout */}
        <div className="mb-8">
          <div className="flex justify-center gap-2">
            <div className="flex flex-col items-center p-2 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-300/50">
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center mb-1">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-emerald-700 text-xs font-medium text-center leading-tight">Secure<br/>E-Prescriptions</span>
            </div>
            
            <div className="flex flex-col items-center p-2 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-300/50">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mb-1">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-blue-700 text-xs font-medium text-center leading-tight">Real-time<br/>Verification</span>
            </div>
            
            <div className="flex flex-col items-center p-2 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-300/50">
              <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center mb-1">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-purple-700 text-xs font-medium text-center leading-tight">End-to-end<br/>Encryption</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-300 text-red-700">
            <FiAlertCircle className="mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
              Username
            </label>
            <div className="mt-2 relative">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <FiUser className="text-slate-400" size={18} />
              </div>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                style={{ paddingLeft: '3.5rem' }}
                className="block w-full rounded-xl border-0 bg-white pr-4 py-3.5 text-base text-slate-900 placeholder-slate-400 shadow-lg ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Enter your email"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
              Password
            </label>
            <div className="mt-2 relative">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <FiLock className="text-slate-400" size={18} />
              </div>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                style={{ paddingLeft: '3.5rem' }}
                className="block w-full rounded-xl border-0 bg-white pr-4 py-3.5 text-base text-slate-900 placeholder-slate-400 shadow-lg ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Enter your password"
                required
              />
            </div>
          </div>

          <div className="flex justify-center">
            <button
              type="submit"
              disabled={isLoading}
              className={`relative w-1/2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-teal-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:from-indigo-500 hover:via-blue-500 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-slate-100 ${isLoading ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Signing in...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <FiLogIn />
                Sign in
              </span>
            )}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          By continuing you agree to our Terms and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default Login;

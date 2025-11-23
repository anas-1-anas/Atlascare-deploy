import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw, FiAlertTriangle, FiCheckCircle, FiClock, FiPackage } from 'react-icons/fi';
import axios from 'axios';
import { getApiUrl } from '../utils/api';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const response = await axios.get(getApiUrl(`/api/admin/hcs-logs?filter=${filter}`), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (response.data.success) {
        setLogs(response.data.logs || []);
      } else {
        setError('Failed to fetch logs');
      }
    } catch (err) {
      console.error('Failed to fetch HCS logs:', err);
      setError(err.response?.data?.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const getEventBadgeClass = (eventType) => {
    switch (eventType) {
      case 'issued':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'verified':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'paid':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'dispensed':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'issued':
        return <FiCheckCircle className="h-4 w-4" />;
      case 'verified':
        return <FiCheckCircle className="h-4 w-4" />;
      case 'paid':
        return <FiClock className="h-4 w-4" />;
      case 'dispensed':
        return <FiPackage className="h-4 w-4" />;
      default:
        return <FiClock className="h-4 w-4" />;
    }
  };

  const filters = [
    { value: 'all', label: 'All Events' },
    { value: 'issued', label: 'Issued' },
    { value: 'verified', label: 'Verified' },
    { value: 'paid', label: 'Paid' },
    { value: 'dispensed', label: 'Dispensed' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('admin.dashboard')}
        </h1>
        <p className="text-gray-600">
          Monitor HCS logs and prescription events in real-time
        </p>
      </div>

      {/* Filter Buttons */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filter === f.value
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <FiAlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && logs.length === 0 && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {/* Logs Table */}
      {!loading && logs.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg p-12 text-center">
          <p className="text-gray-500">No logs found for the selected filter.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prescription ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log, idx) => (
                  <tr 
                    key={idx} 
                    className={`hover:bg-gray-50 ${log.fraudAlert ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getEventBadgeClass(log.eventType)}`}>
                        {getEventIcon(log.eventType)}
                        {log.eventType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {log.topicID}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <span className="capitalize">{log.signerRole}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="space-y-1">
                        {log.fraudAlert && (
                          <div className="flex items-start gap-2 text-red-700 font-semibold">
                            <FiAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span className="text-xs">{log.fraudAlert.reason}</span>
                          </div>
                        )}
                        {log.dispenseCount !== undefined && (
                          <span className="text-xs">
                            Dispense: {log.dispenseCount}/{log.maxDispenses}
                          </span>
                        )}
                        {log.drugIds && log.drugIds.length > 0 && (
                          <span className="text-xs text-gray-500">
                            Drugs: {log.drugIds.slice(0, 2).join(', ')}
                            {log.drugIds.length > 2 && '...'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {logs.length} {logs.length === 1 ? 'event' : 'events'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;


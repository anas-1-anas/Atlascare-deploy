import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { getApiUrl } from '../utils/api';

const PaymentPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [prescription, setPrescription] = useState(location.state?.prescription || null);
  const [paymentStatus, setPaymentStatus] = useState('pending'); // 'pending', 'processing', 'success', 'failed'
  const [error, setError] = useState('');
  const [method, setMethod] = useState(''); // 'cash' | 'card'
  const [paymentDetails, setPaymentDetails] = useState({
    amount: '10.00',
    currency: 'HBAR',
    walletAddress: '0.0.1234567',
    transactionHash: ''
  });

  useEffect(() => {
    // If we don't have the prescription in location state, try to fetch it
    if (!prescription && id) {
      fetchPrescription(id);
    }
  }, [id, prescription]);

  const fetchPrescription = async (prescriptionId) => {
    try {
      const response = await fetch(getApiUrl(`/api/prescriptions/${prescriptionId}`));
      const data = await response.json();
      
      if (data.success) {
        setPrescription(data.prescription);
      } else {
        setError(data.message || 'Failed to load prescription');
      }
    } catch (err) {
      setError('Failed to connect to the server');
      console.error('Error fetching prescription:', err);
    }
  };

  const handlePayment = async () => {
    if (!prescription) return;
    if (!method) {
      setError('Please choose a payment method (cash or credit card).');
      return;
    }
    
    setPaymentStatus('processing');
    setError('');
    
    try {
      // In a real app, this would connect to the user's wallet and process the payment
      // For demo purposes, we'll simulate a payment with the backend
      const response = await fetch(getApiUrl('/api/payments'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prescriptionId: prescription.id,
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          method,
          // send identifiers to allow backend to compute hashes
          doctorId: 'doctor@example.com',
          pharmacyId: (JSON.parse(localStorage.getItem('user') || '{}').username) || undefined,
          drugCodes: (prescription.medications || []).map(m => m.code || m.name)
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPaymentStatus('success');
        setPaymentDetails(prev => ({
          ...prev,
          transactionHash: data.transactionId
        }));
      } else {
        throw new Error(data.error || 'Payment failed');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setPaymentStatus('failed');
      setError(err.message || 'An error occurred during payment');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleNewSearch = () => {
    navigate('/pharmacist');
  };

  if (!prescription) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <XCircleIcon className="mx-auto h-12 w-12 text-red-500" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">Prescription not found</h3>
          <p className="mt-1 text-sm text-gray-500">The requested prescription could not be found or is no longer available.</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate('/pharmacist')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to Search
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate total amount based on medications
  const calculateTotal = () => {
    // In a real app, this would come from your pricing logic
    return (prescription.medications.length * 10).toFixed(2);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        {/* Header */}
        <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Payment for Prescription #{prescription.id.substring(0, 8)}...
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Complete your payment to process this prescription
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {paymentStatus === 'pending' && 'Payment Pending'}
              {paymentStatus === 'processing' && 'Processing...'}
              {paymentStatus === 'success' && 'Payment Successful'}
              {paymentStatus === 'failed' && 'Payment Failed'}
            </span>
          </div>
        </div>
        
        {/* Prescription Summary */}
        <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
          {/* Payment method selection */}
          {paymentStatus === 'pending' && (
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-900 mb-2">Choose Payment Method</h4>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMethod('cash')}
                  className={`px-4 py-2 rounded-md border text-sm font-medium ${method === 'cash' ? 'bg-green-600 text-white border-green-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  className={`px-4 py-2 rounded-md border text-sm font-medium ${method === 'card' ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  Credit Card
                </button>
              </div>
              {error && (
                <div className="mt-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>
              )}
            </div>
          )}

          <h4 className="text-md font-medium text-gray-900 mb-4">Prescription Summary</h4>
          
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Medication
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dosage
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {prescription.medications.map((med, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {med.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {med.dosage} {med.unit} - {med.frequency} times/day for {med.duration} {med.durationUnit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      $10.00
                    </td>
                  </tr>
                ))}
                
                {/* Total */}
                <tr className="bg-gray-50">
                  <td colSpan="2" className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    Total
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                    ${calculateTotal()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {paymentStatus === 'success' && (
            <div className="mt-4 p-4 bg-green-50 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Payment successful!</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>Transaction ID: {paymentDetails.transactionHash}</p>
                    <p className="mt-1">The prescription has been marked as paid and is ready for dispensing.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {paymentStatus === 'failed' && (
            <div className="mt-4 p-4 bg-red-50 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <XCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Payment failed</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error || 'An error occurred while processing your payment. Please try again.'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Payment Actions */}
        <div className="px-4 py-4 bg-gray-50 text-right sm:px-6">
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={handleNewSearch}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to Search
            </button>
            
            <div className="space-x-3">
              {paymentStatus === 'success' && (
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Print Receipt
                </button>
              )}
              
              {paymentStatus === 'pending' && (
                <button
                  type="button"
                  onClick={handlePayment}
                  disabled={paymentStatus === 'processing'}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {paymentStatus === 'processing' ? 'Processing...' : method === 'card' ? 'Pay by Card' : method === 'cash' ? 'Record Cash Payment' : 'Choose Payment Method'}
                </button>
              )}
              
              {paymentStatus === 'failed' && (
                <button
                  type="button"
                  onClick={handlePayment}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Retry Payment
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Payment Instructions (only visible when pending) */}
      {paymentStatus === 'pending' && (
        <div className="mt-8 bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-blue-800 mb-4">How to Pay with HBAR</h3>
          <ol className="space-y-4 text-sm text-blue-700">
            <li className="flex items-start">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-medium mr-3">1</span>
              <span>Open your Hedera wallet (e.g., HashPack, Blade, or Wallawallet)</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-medium mr-3">2</span>
              <span>Send <span className="font-mono font-bold">{paymentDetails.amount} {paymentDetails.currency}</span> to:</span>
            </li>
            <li className="ml-9 mb-4">
              <div className="bg-white p-3 rounded border border-blue-200 flex items-center justify-between">
                <code className="text-sm break-all">{paymentDetails.walletAddress}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentDetails.walletAddress);
                    // You might want to add a toast notification here
                  }}
                  className="ml-2 p-1 rounded-md text-blue-600 hover:bg-blue-100"
                  title="Copy to clipboard"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
              </div>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-medium mr-3">3</span>
              <span>Click the &quot;Pay with HBAR&quot; button above after sending the payment</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-medium mr-3">4</span>
              <span>Wait for the transaction to be confirmed on the Hedera network</span>
            </li>
          </ol>
          
          <div className="mt-6 p-4 bg-blue-100 border-l-4 border-blue-500">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h2a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> This is a test payment on the Hedera testnet. No real HBAR will be transferred.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentPage;

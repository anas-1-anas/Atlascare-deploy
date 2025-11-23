import { useState, useEffect } from 'react';
// Medicines will be fetched from backend unified endpoint
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode.react';
import QrScannerWrapper from '../components/QrScannerWrapper';
import { FiSearch, FiAlertCircle, FiCheckCircle, FiCamera, FiCameraOff, FiWifi, FiWifiOff, FiLayers, FiX, FiShoppingCart, FiTrash2 } from 'react-icons/fi';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { performOfflineVerification } from '../utils/offlineVerification';
import { cachePrescriptionWithKey } from '../utils/doctorKeyCache';
import offlineQueueManager from '../utils/offlineQueue';
import { getApiUrl } from '../utils/api';

const PharmacistLookup = () => {
  const [step, setStep] = useState(1); // 1 Verify, 2 Dispense & Payment, 3 Complete (FSE + JSON + PDF)
  const [topicId, setTopicId] = useState('');
  const [medicinesData, setMedicinesData] = useState([]);
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mirrorResult, setMirrorResult] = useState(null);
  const [fseLoading, setFseLoading] = useState(false);
  const [fseJson, setFseJson] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [doctorNationalId, setDoctorNationalId] = useState('');
  const [pharmacistNationalId, setPharmacistNationalId] = useState('119876510');
  const [qrJson, setQrJson] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannedData, setScannedData] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [verifiedOffline, setVerifiedOffline] = useState(false);
  const [fraudAlert, setFraudAlert] = useState(null);
  const [fraudAcknowledged, setFraudAcknowledged] = useState(false);
  
  // Batch Mode State
  const [batchMode, setBatchMode] = useState(false);
  const [prescriptionQueue, setPrescriptionQueue] = useState([]);
  const [batchPaymentMethod, setBatchPaymentMethod] = useState('cash');
  
  const navigate = useNavigate();

  // Dynamic title based on current step
  const getStepTitle = () => {
    switch (step) {
      case 1: return 'Verify Prescription';
      case 2: return 'Dispense & Payment';
      case 3: return 'E-Claim (FSE) Generation';
      default: return 'Pharmacist Portal';
    }
  };
  
  useDocumentTitle(getStepTitle());

  useEffect(() => {
    // Check for URL parameters (in case of deep linking)
    const params = new URLSearchParams(window.location.search);
    const t = params.get('topic');
    if (t) {
      setTopicId(t);
      handleLookup(t);
    }
    // Ensure default INPE for pharmacist if empty
    setPharmacistNationalId(prev => prev && String(prev).trim() !== '' ? prev : '119876510');
    // Load medicines from backend unified endpoint
    (async () => {
      try {
        const resp = await fetch(getApiUrl('/api/medicines'));
        const data = await resp.json();
        setMedicinesData(Array.isArray(data) ? data : []);
      } catch (_) {
        setMedicinesData([]);
      }
    })();
  }, []);

  // Monitor online/offline status (automatic)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsOfflineMode(false);
      console.log('[NETWORK] Connection restored - online mode active');
      
      // Show brief success notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-20 right-4 z-50 px-4 py-3 rounded-lg bg-emerald-500 text-white shadow-lg flex items-center gap-2 animate-slide-in';
      notification.innerHTML = `
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <span class="font-medium">Back Online</span>
      `;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setIsOfflineMode(true);
      console.log('[NETWORK] Connection lost - automatic offline mode activated');
      
      // Show persistent warning
      const notification = document.createElement('div');
      notification.className = 'fixed top-20 right-4 z-50 px-4 py-3 rounded-lg bg-orange-500 text-white shadow-lg flex items-center gap-2';
      notification.id = 'offline-notification';
      notification.innerHTML = `
        <svg class="h-5 w-5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <span class="font-medium">Working Offline</span>
      `;
      document.body.appendChild(notification);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Clean up offline notification
      document.getElementById('offline-notification')?.remove();
    };
  }, []);

  const handleLookup = async (id = null) => {
    const lookupTopic = id || topicId.trim();
    if (!lookupTopic) {
      setError('Please enter a unique prescription ID');
      return;
    }

    // Reset UI and eligibility before starting lookup
    setCanProceed(false);
    setPrescription(null);
    setStep(1);
    setLoading(true);
    setError('');
    setVerifiedOffline(false);

    try {
      // Automatically try offline verification if no network
      if (!isOnline) {
        console.log('[OFFLINE MODE] Network unavailable - attempting offline verification...');
        
        // Parse QR data if available from scanner
        let qrPayload = null;
        if (scannedData) {
          try {
            qrPayload = JSON.parse(scannedData);
          } catch (e) {
            console.warn('Could not parse scanned QR data for offline verification');
          }
        }

        // If no QR data, try to construct minimal payload from topic ID
        if (!qrPayload) {
          qrPayload = { t: lookupTopic };
        }

        const offlineResult = await performOfflineVerification(qrPayload);
        
        if (offlineResult.valid) {
          console.log('Offline verification successful');
          setPrescription(offlineResult.prescription);
          setVerifiedOffline(true);
          setCanProceed(true);
          setStep(2);
          
          // Queue verification message for when online
          try {
            await offlineQueueManager.queueVerification(lookupTopic, {
              pharmacistNationalId,
              offlineVerified: true,
              timestamp: new Date().toISOString()
            });
            console.log('Verification queued for sync when online');
          } catch (queueErr) {
            console.warn('Failed to queue verification:', queueErr);
          }
          
          return;
        } else {
          console.warn('Offline verification failed:', offlineResult.reason);
          if (!isOnline) {
            setError(`Offline verification failed: ${offlineResult.reason}. Please connect to network.`);
            setPrescription(null);
            return;
          }
          // Fall through to online verification if network is available
        }
      }

      // Online verification (original logic)
      // Load prescription
      const response = await fetch(getApiUrl(`/api/prescriptions/topic/${encodeURIComponent(lookupTopic)}`));
      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Prescription not found');
        setPrescription(null);
        return;
      }

        // PROACTIVE FRAUD DETECTION - Check immediately on lookup
        try {
          // Try to get payload from QR scan, or let backend fetch from memory
          let fraudCheckPayload = undefined;
          try {
            if (qrJson) {
              fraudCheckPayload = JSON.parse(qrJson);
            }
          } catch (parseErr) {
            // Silent: QR JSON parsing failed (expected when no QR data)
          }
          
          const fraudResp = await fetch(getApiUrl('/api/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payload: fraudCheckPayload,
              topicID: lookupTopic, // Backend will fetch from memory if payload is missing
              doctorNationalId,
              pharmacistNationalId
            })
          });
          
          // Only process response if it's successful
          if (fraudResp.ok) {
            const fraudData = await fraudResp.json();
            
            if (fraudData.fraudAlert) {
              setFraudAlert(fraudData.fraudAlert);
              setFraudAcknowledged(false); // Require acknowledgment
              console.warn('[PROACTIVE FRAUD ALERT]', fraudData.fraudAlert);
            } else {
              setFraudAlert(null);
              setFraudAcknowledged(true); // No fraud, auto-acknowledge
            }
          } else {
            // Silent: Non-OK status (409 Conflict is expected for processing prescriptions)
            setFraudAlert(null);
            setFraudAcknowledged(true);
          }
        } catch (fraudErr) {
          // Silent: Fraud check failed (don't block prescription flow)
          setFraudAlert(null);
          setFraudAcknowledged(true);
        }

      // Check latest status and dispense count
      try {
        const statusResp = await fetch(getApiUrl(`/api/status/topic/${encodeURIComponent(lookupTopic)}`));
        const statusData = await statusResp.json();
        const status = ((statusData && statusData.status) || 'unknown').toLowerCase();
        
        // Check if prescription has remaining dispenses
        const prescription = data.prescription;
        const dispenseCount = prescription.dispenseCount || 0;
        const maxDispenses = prescription.maxDispenses || 1;
        
        // Allow if status is 'issued', 'paid', OR if there are remaining dispenses
        if (status === 'issued' || status === 'paid' || dispenseCount < maxDispenses) {
          // Proceed to Medications
          setPrescription(prescription);
        } else {
          // Fully dispensed or invalid status
          setError(`This prescription has been fully dispensed (${dispenseCount}/${maxDispenses})`);
          setPrescription(null);
          setStep(1);
          return;
        }
        
        // Cache prescription with doctor key for future offline use
        if (data.prescription && data.doctorPublicKey) {
          try {
            await cachePrescriptionWithKey(data.prescription, data.doctorPublicKey);
            console.log('Prescription cached for offline access');
          } catch (cacheErr) {
            console.warn('Failed to cache prescription:', cacheErr);
          }
        }
        
        window.history.pushState({}, '', `/pharmacist?topic=${encodeURIComponent(lookupTopic)}`);
        
        // BATCH MODE: Add to queue instead of advancing
        if (batchMode) {
          const newQueueItem = {
            id: lookupTopic,
            prescription: prescription,
            fraudAlert: fraudAlert,
            fraudAcknowledged: fraudAcknowledged,
            addedAt: new Date().toISOString()
          };
          setPrescriptionQueue(prev => [...prev, newQueueItem]);
          
          // Reset form for next scan
          setTopicId('');
          setQrJson('');
          setScannedData('');
          setLoading(false);
          
          // Show success notification
          const notification = document.createElement('div');
          notification.className = 'fixed top-20 right-4 z-50 px-4 py-3 rounded-lg bg-emerald-500 text-white shadow-lg flex items-center gap-2 animate-slide-in';
          notification.innerHTML = `
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="font-medium">Added to queue (${prescriptionQueue.length + 1})</span>
          `;
          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 2000);
          
          return; // Don't advance to step 2 in batch mode
        }
        
        // Normal mode: proceed to dispense
        setCanProceed(true);
        setStep(2);
      } catch (_) {
        // If status check fails, do not advance; require explicit verification
        setPrescription(null);
        setError('Unable to check prescription status. Please try again.');
        setStep(1);
      }
    } catch (err) {
      setError('Failed to fetch prescription. Please try again.');
      console.error('Error fetching prescription:', err);
      setPrescription(null);
    } finally {
      setLoading(false);
    }
  };

  const ensureStillIssued = async () => {
    try {
      const id = topicId && topicId.trim();
      if (!id) return false;
      const statusResp = await fetch(`/api/status/topic/${encodeURIComponent(id)}`);
      const statusData = await statusResp.json();
      const status = ((statusData && statusData.status) || 'unknown').toLowerCase();
      
      // Allow if status is 'issued' OR if prescription has remaining dispenses
      if (status === 'issued') return true;
      
      // If paid or dispensed, check if there are remaining dispenses (for multi-dispense refills)
      if ((status === 'paid' || status === 'dispensed') && prescription) {
        const dispenseCount = prescription.dispenseCount || 0;
        const maxDispenses = prescription.maxDispenses || 1;
        return dispenseCount < maxDispenses;
      }
      
      return false;
    } catch (_) {
      return false;
    }
  };

  const handleGenerateFSE = async () => {
    try {
      if (!prescription) {
        setError('Load a prescription first');
        return;
      }
      setFseLoading(true);
      setError('');
      const token = localStorage.getItem('auth_token');
      const resp = await fetch(getApiUrl('/api/generate-fse'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ 
          prescription,
          pharmacistNationalId: pharmacistNationalId || '119876510'
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data?.error || 'Failed to generate FSE');
      }
      
      // Store FSE JSON for display (demo purposes)
      if (data.fseJson) {
        setFseJson(data.fseJson);
        console.log('[FSE] Generated E-Claim:', data.fseJson);
      }
      
      // Store PDF for manual download if available
      if (data.fsePdfBase64) {
        // PDF data is stored, user can download via button if needed
        console.log('[FSE] PDF generated successfully');
      }
    } catch (e) {
      setError(e.message || 'Failed to generate FSE');
    } finally {
      setFseLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setLoading(true); setError('');
      if (!qrJson && !topicId) throw new Error('Scan the QR or enter a unique prescription ID first');
      // Extract topic ID from QR or use manual input
      const effectiveTopic = (() => {
        try {
          if (qrJson) {
            const parsed = JSON.parse(qrJson);
            // Handle new QR payload format (spec Section 3.1)
            if (parsed?.t) return parsed.t;
            // Fallback for old format
            if (parsed?.topicID) return parsed.topicID;
          }
        } catch (_) {}
        return topicId;
      })();
      
      // Skip pre-check - let handleLookup do proper validation with prescription data
      let payload = undefined;
      try {
        if (qrJson) {
          payload = JSON.parse(qrJson);
        }
      } catch (parseErr) {
        console.warn('Failed to parse QR JSON:', parseErr);
      }
      
      const resp = await fetch(getApiUrl('/api/verify'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, topicID: effectiveTopic, doctorNationalId, pharmacistNationalId }) });
      const data = await resp.json();
      if (!resp.ok || !data.success || !data.valid) throw new Error(data?.error || 'Invalid prescription');
      
      // Check for fraud alert
      if (data.fraudAlert) {
        setFraudAlert(data.fraudAlert);
        console.warn('[FRAUD ALERT]', data.fraudAlert);
      } else {
        setFraudAlert(null);
      }
      
      // Load prescription; step advancement is controlled inside handleLookup based on status
      await handleLookup(effectiveTopic);
    } catch (e) {
      setError(e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (data) => {
    if (!data) return;
    try {
      // Try JSON first
      const parsed = JSON.parse(data);
      setQrJson(data);
      
      // Handle new QR payload format (spec Section 3.1)
      if (parsed?.t) {
        setTopicId(parsed.t);
        handleLookup(parsed.t);
        setScannedData(`QR v${parsed.v || 'unknown'} detected - Dispense ${parsed.dc || 0}/${parsed.md || 1}`);
      } else if (parsed?.topicID) {
        // Fallback for old format
        setTopicId(parsed.topicID);
        handleLookup(parsed.topicID);
        setScannedData('QR JSON detected (legacy format)');
      }
      
      setCameraActive(false);
    } catch (_) {
      try {
        // Try URL pattern
        const url = new URL(data);
        const id = url.searchParams.get('topic') || url.pathname.split('/').pop();
        if (id) {
          setTopicId(id);
          handleLookup(id);
          setScannedData('URL detected');
          setCameraActive(false);
        }
      } catch (e) {
        // Raw text, ignore
        setScannedData('Unrecognized QR payload');
      }
    }
  };

  // Helpers to compute dispense items and totals from local CNSS data
  const normalizeKey = (key) => (key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const pickRawField = (raw, candidates) => {
    if (!raw) return undefined;
    const candNorm = candidates.map(normalizeKey);
    for (const k of Object.keys(raw)) {
      if (candNorm.includes(normalizeKey(k))) {
        const v = raw[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return undefined;
  };

  const extractPrice = (obj) => {
    if (obj?.price) return obj.price;
    const raw = obj?.raw || obj?.sourceRaw || {};
    const direct = pickRawField(raw, ['Prix public de vente', 'Prix public', 'Prix', 'PPP', 'PPA', 'Tarif', 'Price', 'PRIX', 'PRIX PUBLIC']);
    if (direct) return direct;
    let best = null;
    for (const [k, v] of Object.entries(raw)) {
      const keyNorm = normalizeKey(k);
      if (!v && v !== 0) continue;
      const valStr = String(v);
      const numMatch = valStr.match(/\d+[\.,]?\d*/);
      if (!numMatch) continue;
      const num = parseFloat(numMatch[0].replace(',', '.'));
      if (isNaN(num)) continue;
      const isPriceKey = /(prix|price|tarif|ppa|ppp|montant)/.test(keyNorm);
      if (isPriceKey && num > 0 && num < 100000) { best = valStr; break; }
      if (!best && num > 0 && num < 100000) { best = valStr; }
    }
    return best || undefined;
  };

  const extractRate = (obj) => {
    if (obj?.reimbursementRate) return obj.reimbursementRate;
    const raw = obj?.raw || obj?.sourceRaw || {};
    const direct = pickRawField(raw, ['Taux de remboursement', 'Taux', 'Remboursement', 'Rate', 'Reimbursement rate', 'TAUX']);
    if (direct) return direct;
    let best = null;
    for (const [k, v] of Object.entries(raw)) {
      const keyNorm = normalizeKey(k);
      if (!v && v !== 0) continue;
      const valStr = String(v);
      const pct = valStr.match(/\d{1,3}(?:\.\d+)?\s*%/);
      if (pct) { best = pct[0]; break; }
      const numMatch = valStr.match(/\b\d{1,3}(?:\.\d+)?\b/);
      if (!numMatch) continue;
      const num = parseFloat(numMatch[0]);
      const isRateKey = /(taux|rate|rembours)/.test(keyNorm);
      if (isRateKey && num >= 0 && num <= 100) { best = `${num}%`; break; }
      if (!best && num >= 0 && num <= 100) { best = `${num}%`; }
    }
    return best || undefined;
  };

  const getPriceNumber = (p) => {
    if (!p) return 0;
    const m = String(p).match(/\d+[\.,]?\d*/);
    if (!m) return 0;
    return parseFloat(m[0].replace(',', '.')) || 0;
  };

  const getRateNumber = (r) => {
    if (!r) return 0;
    const m = String(r).match(/\d+(?:\.\d+)?/);
    if (!m) return 0;
    const v = parseFloat(m[0]);
    return isNaN(v) ? 0 : Math.min(100, Math.max(0, v));
  };

  const computeDispenseTotals = (rx) => {
    const meds = Array.isArray(rx?.medications) ? rx.medications : [];
    const items = meds.map(m => ({ drugId: m?.code || 'unknown', quantity: 1, unit: 'box' }));
    const agg = meds.reduce((acc, m) => {
      const match = (medicinesData || []).find(x => (x.code && m.code && x.code === m.code)) || {};
      const price = getPriceNumber(extractPrice(match));
      const rate = getRateNumber(extractRate(match));
      acc.amount += price;
      acc.covered += price * (rate/100);
      return acc;
    }, { amount: 0, covered: 0 });
    const patient = Math.max(0, agg.amount - agg.covered);
    return { items, totals: { amountMAD: Number(agg.amount.toFixed(2)), coveredMAD: Number(agg.covered.toFixed(2)), patientMAD: Number(patient.toFixed(2)) } };
  };

  const renderMockBarcode = (seed) => {
    const text = String(seed || '').trim() || '000000';
    const nums = Array.from(text).map((ch, i) => (ch.charCodeAt(0) + i) % 10);
    const bars = nums.map((n, i) => ({ x: i * 4, w: 2 + (n % 3), h: 28 }));
    const width = nums.length * 4 + 6;
    return (
      <svg width={width} height={32} viewBox={`0 0 ${width} 32`} aria-label="mock-barcode">
        <rect x="0" y="0" width={width} height="32" fill="#fff" />
        {bars.map((b, i) => (
          <rect key={i} x={3 + b.x} y={2} width={b.w} height={b.h} fill="#111827" />
        ))}
      </svg>
    );
  };

  const handlePayment = async () => {
    try {
      if (!prescription) return;
      
      // Final status check before payment
      const stillEligible = await ensureStillIssued();
      if (!stillEligible) {
        const dispenseCount = prescription?.dispenseCount || 0;
        const maxDispenses = prescription?.maxDispenses || 1;
        setError(`This prescription has been fully dispensed (${dispenseCount}/${maxDispenses})`);
        setCanProceed(false);
        setStep(1);
        return;
      }
      
      setPaymentLoading(true);
      const { totals: payTotals } = computeDispenseTotals(prescription);
      const resp = await fetch(getApiUrl('/api/payments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prescriptionId: prescription.id, method: paymentMethod, amountMAD: payTotals.amountMAD, pharmacistNationalId })
      });
      const result = await resp.json();
      if (!resp.ok || !result?.success) {
        if (result?.error?.includes('already paid or dispensed')) {
          setError('This prescription has already been paid or dispensed');
          setCanProceed(false);
          setStep(1);
          return;
        }
        throw new Error(result?.error || 'Payment failed');
      }
      try {
        // Call dispense after successful payment (enqueue dispensed event)
        const { items, totals } = computeDispenseTotals(prescription);
        await fetch(getApiUrl('/api/dispense'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topicID: topicId, pharmacistNationalId, paymentMethod, items, totals }) });
      } catch (_) {}
      setStep(3);
    } catch (e) {
      setError(e.message || 'Payment failed');
    } finally {
      setPaymentLoading(false);
    }
  };

  const toggleCamera = () => {
    setCameraActive(!cameraActive);
    if (cameraActive) {
      setScannedData('');
    }
  };

  // BATCH MODE FUNCTIONS
  const removeFromQueue = (prescriptionId) => {
    setPrescriptionQueue(prev => prev.filter(item => item.id !== prescriptionId));
  };

  const acknowledgeFraud = (prescriptionId) => {
    setPrescriptionQueue(prev => prev.map(item => 
      item.id === prescriptionId ? { ...item, fraudAcknowledged: true } : item
    ));
  };

  const processBatchPayments = async () => {
    try {
      setPaymentLoading(true);
      
      // Check if all fraud alerts are acknowledged
      const unacknowledged = prescriptionQueue.filter(item => item.fraudAlert && !item.fraudAcknowledged);
      if (unacknowledged.length > 0) {
        setError(`Please acknowledge ${unacknowledged.length} fraud alert(s) before processing`);
        return;
      }
      
      // Calculate total batch amount
      let batchTotal = 0;
      const prescriptionIds = [];
      
      for (const item of prescriptionQueue) {
        const { totals } = computeDispenseTotals(item.prescription);
        batchTotal += totals.amountMAD;
        prescriptionIds.push(item.prescription.id);
      }
      
      // Process batch payment (single API call for all)
      const resp = await fetch(getApiUrl('/api/payments/batch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prescriptionIds,
          method: batchPaymentMethod,
          totalAmountMAD: batchTotal,
          pharmacistNationalId
        })
      });
      
      const result = await resp.json();
      
      if (!resp.ok || !result?.success) {
        throw new Error(result?.error || 'Batch payment failed');
      }
      
      // Dispense all prescriptions
      for (const item of prescriptionQueue) {
        try {
          const { items, totals } = computeDispenseTotals(item.prescription);
          await fetch(getApiUrl('/api/dispense'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicID: item.id,
              pharmacistNationalId,
              paymentMethod: batchPaymentMethod,
              items,
              totals
            })
          });
        } catch (dispenseErr) {
          console.warn(`Dispense failed for ${item.id}:`, dispenseErr);
        }
      }
      
      // Success - clear queue and show summary
      const count = prescriptionQueue.length;
      setPrescriptionQueue([]);
      setBatchMode(false);
      setStep(3);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-20 right-4 z-50 px-4 py-3 rounded-lg bg-emerald-500 text-white shadow-lg flex items-center gap-2 animate-slide-in';
      notification.innerHTML = `
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <span class="font-medium">Processed ${count} prescriptions successfully</span>
      `;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
      
    } catch (e) {
      setError(e.message || 'Batch payment failed');
      console.error('Batch payment error:', e);
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Pharmacist Portal</h1>
          
          {/* Network Status & Batch Mode Toggle */}
          <div className="flex items-center gap-3">
            {/* Batch Mode Toggle */}
            <button
              onClick={() => {
                setBatchMode(!batchMode);
                if (!batchMode) {
                  // Entering batch mode
                  setPrescriptionQueue([]);
                  setStep(1);
                } else {
                  // Exiting batch mode
                  if (prescriptionQueue.length > 0) {
                    if (confirm(`Clear ${prescriptionQueue.length} queued prescription(s)?`)) {
                      setPrescriptionQueue([]);
                    } else {
                      return; // Don't toggle if user cancels
                    }
                  }
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
                batchMode
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-2 border-indigo-300'
                  : 'bg-white text-slate-700 border-2 border-slate-200 hover:border-indigo-300'
              }`}
            >
              <FiLayers className="h-4 w-4" />
              <span className="font-semibold">{batchMode ? 'Batch Mode ON' : 'Batch Mode'}</span>
              {batchMode && prescriptionQueue.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-bold">
                  {prescriptionQueue.length}
                </span>
              )}
            </button>
            
            {/* Network Status Indicator (Automatic) */}
            {!isOnline && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-orange-50 to-yellow-50 text-orange-700 border border-orange-200 shadow-sm animate-pulse">
                <FiWifiOff className="h-4 w-4" />
                <span className="font-semibold">Working Offline</span>
                <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-200 text-xs">Auto Mode</span>
              </div>
            )}
            {isOnline && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700">
                <FiWifi className="h-4 w-4" />
                <span>Connected</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-4 flex justify-center">
          <div className="flex items-center gap-3">
            {[1,2,3].map((s, idx) => (
              <div key={s} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{s}</div>
                  <span className={`mt-1 text-xs ${step===s?'text-emerald-700 font-semibold':'text-slate-500'}`}>{s===1?'Verify':s===2?'Dispense':'E-Claim'}</span>
                </div>
                {idx < 2 && (
                  <div className={`mx-3 h-1 w-24 sm:w-32 rounded ${step > s ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step 1: Verify (simplified UI) */}
      {step === 1 && (
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-slate-900/5 p-8 mb-8 max-w-xl mx-auto text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Verify Prescription</h2>
          <p className="text-sm text-slate-600 mb-5">Scan QR code or enter unique prescription ID manually</p>
          <div className="grid grid-cols-1 md:grid-cols-1 gap-3 mb-4 text-left">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Pharmacist National ID</label>
              <input type="text" value={pharmacistNationalId} onChange={(e)=>setPharmacistNationalId(e.target.value)} className="mt-1 block w-full rounded-xl border-0 ring-1 ring-slate-300 px-3 py-2 focus:ring-2 focus:ring-emerald-400" placeholder="e.g. CD987654" />
            </div>
          </div>
          <div className="flex justify-center mb-6">
            {cameraActive ? (
              <div className="relative">
                <div className="w-80 h-60 border-2 border-emerald-300 rounded-xl overflow-hidden bg-black">
                  <QrScannerWrapper
                    onDecode={handleScan}
                    onError={(error) => {
                      console.error('QR Scanner error:', error);
                      setError('Camera error. Please try again.');
                    }}
                    constraints={{
                      facingMode: 'environment'
                    }}
                    containerStyle={{
                      width: '100%',
                      height: '100%'
                    }}
                  />
                </div>
                <button
                  onClick={toggleCamera}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                  title="Stop camera"
                >
                  <FiCameraOff className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="p-4 border-2 border-dashed border-emerald-300 rounded-xl bg-white/70">
                <QRCode value={topicId || 'topic-0.0.x'} size={160} />
              </div>
            )}
          </div>
          
          {scannedData && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                <FiCheckCircle className="inline h-4 w-4 mr-1" />
                {scannedData}
              </p>
            </div>
          )}
          
          <div className="flex justify-center mb-4">
            <button
              onClick={toggleCamera}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg ${
                cameraActive 
                  ? 'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200' 
                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              {cameraActive ? <><FiCameraOff /> Stop Camera</> : <><FiCamera /> Scan QR Code</>}
            </button>
          </div>
          <div>
            <label htmlFor="topicId" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Unique Prescription ID</label>
            <div className="mt-2">
              <div className="relative">
                <input id="topicId" type="text" value={topicId} onChange={(e)=>setTopicId(e.target.value)} onKeyDown={(e)=> e.key==='Enter' && handleLookup()} className="block w-full rounded-xl border-0 ring-1 ring-slate-300 px-3 py-3 focus:ring-2 focus:ring-emerald-400 placeholder-slate-400" placeholder="Enter unique prescription ID (e.g. 0.0.7153833)" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
            <button onClick={() => handleLookup()} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300">
              {loading ? 'Looking up…' : (<><FiSearch /> Look up</>)}
            </button>
            <button onClick={handleVerify} disabled={loading || !qrJson} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
              Verify QR
            </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  <FiAlertCircle className="mt-0.5 h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-800 mb-1">Verification Failed</h4>
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setError('');
                    if (topicId) {
                      handleLookup();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-100 hover:bg-red-200 text-red-800 transition-colors flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* BATCH QUEUE DISPLAY */}
      {batchMode && prescriptionQueue.length > 0 && step === 1 && (
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-slate-900/5 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FiShoppingCart className="h-5 w-5 text-indigo-600" />
              Batch Queue ({prescriptionQueue.length})
            </h3>
            <button
              onClick={() => {
                if (confirm(`Clear all ${prescriptionQueue.length} items?`)) {
                  setPrescriptionQueue([]);
                }
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Clear All
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {prescriptionQueue.map((item, idx) => {
              const { totals } = computeDispenseTotals(item.prescription);
              return (
                <div key={item.id} className={`relative ring-1 rounded-xl p-4 transition-all ${
                  item.fraudAlert && !item.fraudAcknowledged
                    ? 'ring-red-300 bg-red-50'
                    : 'ring-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50'
                }`}>
                  {/* Fraud Alert Overlay */}
                  {item.fraudAlert && !item.fraudAcknowledged && (
                    <div className="absolute inset-0 bg-red-500/10 backdrop-blur-[2px] rounded-xl flex items-center justify-center z-10">
                      <div className="bg-white rounded-lg shadow-xl p-4 max-w-sm mx-4">
                        <div className="flex items-start gap-3">
                          <FiAlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-red-800 mb-1">⚠️ Fraud Alert Detected</h4>
                            <p className="text-xs text-red-700 mb-2">{item.fraudAlert.reason}</p>
                            {item.fraudAlert.distance && (
                              <p className="text-xs text-red-600 mb-3">
                                Distance: {item.fraudAlert.distance} km between issuance and verification.
                              </p>
                            )}
                            <button
                              onClick={() => acknowledgeFraud(item.id)}
                              className="w-full px-3 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                              Acknowledge & Continue
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                        <span className="text-sm font-semibold text-slate-900">{item.prescription.patientName}</span>
                        {item.fraudAlert && item.fraudAcknowledged && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800">
                            <FiAlertCircle className="h-3 w-3" />
                            Risk Acknowledged
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">
                        {item.prescription.medications?.length || 0} medication(s) • {totals.patientMAD.toFixed(2)} MAD
                      </div>
                      <div className="text-xs text-slate-400 mt-1">ID: {item.id}</div>
                    </div>
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="ml-3 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from queue"
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Batch Totals */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700">Batch Totals:</span>
              <span className="text-lg font-bold text-indigo-600">
                {prescriptionQueue.reduce((sum, item) => {
                  const { totals } = computeDispenseTotals(item.prescription);
                  return sum + totals.patientMAD;
                }, 0).toFixed(2)} MAD
              </span>
            </div>
            
            {/* Payment Method Selection */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-600 mb-2">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all ${
                  batchPaymentMethod === 'cash' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="batchPayment"
                    checked={batchPaymentMethod === 'cash'}
                    onChange={() => setBatchPaymentMethod('cash')}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Cash</span>
                </label>
                <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all ${
                  batchPaymentMethod === 'card' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="batchPayment"
                    checked={batchPaymentMethod === 'card'}
                    onChange={() => setBatchPaymentMethod('card')}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Card</span>
                </label>
              </div>
            </div>
            
            <button
              onClick={processBatchPayments}
              disabled={paymentLoading || prescriptionQueue.some(item => item.fraudAlert && !item.fraudAcknowledged)}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg text-white shadow-lg ${
                paymentLoading || prescriptionQueue.some(item => item.fraudAlert && !item.fraudAcknowledged)
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500'
              }`}
            >
              {paymentLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processing {prescriptionQueue.length} prescriptions...</span>
                </>
              ) : (
                <>
                  <FiCheckCircle className="h-5 w-5" />
                  <span>Process Batch ({prescriptionQueue.length} items)</span>
                </>
              )}
            </button>
            
            {prescriptionQueue.some(item => item.fraudAlert && !item.fraudAcknowledged) && (
              <p className="mt-2 text-xs text-center text-red-600">
                Please acknowledge all fraud alerts before processing
              </p>
            )}
          </div>
        </div>
      )}
      
      {/* PROACTIVE FRAUD ALERT MODAL (Single Mode) */}
      {fraudAlert && !fraudAcknowledged && !batchMode && step === 2 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 ring-2 ring-red-500 animate-slide-in">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <FiAlertCircle className="h-7 w-7 text-red-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-900 mb-2">⚠️ Fraud Alert Detected</h3>
                <p className="text-sm text-red-700 mb-3">{fraudAlert.reason}</p>
                {fraudAlert.distance && (
                  <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-800 font-semibold">
                      📍 Distance: {fraudAlert.distance} km
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      Between prescription issuance and verification locations.
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-600 mb-4 italic">
                  Please verify the patient's identity carefully and confirm they have traveled this distance before proceeding.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFraudAcknowledged(true);
                      console.log('[FRAUD ACKNOWLEDGED] User acknowledged fraud risk for:', topicId);
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Acknowledge Risk & Continue
                  </button>
                  <button
                    onClick={() => {
                      setStep(1);
                      setPrescription(null);
                      setFraudAlert(null);
                      setFraudAcknowledged(false);
                      setTopicId('');
                    }}
                    className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Step 2: Dispense (Medications + Payment Combined) */}
      {step === 2 && prescription && (!fraudAlert || fraudAcknowledged) && (
        <div className="bg-white/80 backdrop-blur shadow-lg ring-1 ring-slate-900/5 rounded-2xl overflow-hidden mb-8">
          {paymentLoading && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl flex items-center justify-center z-50">
              <div className="text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-indigo-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Processing Payment</h3>
                <p className="text-sm text-slate-600 animate-pulse">Please wait while we process the transaction...</p>
              </div>
            </div>
          )}
          
          <div className="px-4 py-5 sm:px-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg leading-6 font-semibold text-slate-900">Dispense Prescription</h3>
            {verifiedOffline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 border border-blue-200">
                <FiWifiOff className="h-4 w-4" />
                Verified Offline
              </span>
            )}
          </div>
          
          {/* Fraud Alert Warning */}
          {fraudAlert && (
            <div className="mx-4 mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
              <div className="flex items-start">
                <FiAlertCircle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-800 mb-1">⚠️ Fraud Alert Detected</h4>
                  <p className="text-sm text-red-700 mb-2">{fraudAlert.reason}</p>
                  {fraudAlert.distance && (
                    <p className="text-xs text-red-600">
                      Distance: {fraudAlert.distance} km between prescription issuance and verification locations.
                    </p>
                  )}
                  <p className="text-xs text-red-600 mt-2 italic">
                    Please verify the patient's identity carefully and confirm they have traveled this distance.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Patient Info Header */}
          <div className="px-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="ring-1 ring-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-semibold text-slate-600 mb-1">Patient</h4>
                <p className="text-sm font-medium text-slate-900">{prescription.patientName}</p>
                <p className="text-xs text-slate-500">ID: {prescription.patientId}</p>
              </div>
              <div className="ring-1 ring-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-semibold text-slate-600 mb-1">Doctor</h4>
                <p className="text-sm font-medium text-slate-900">{prescription.doctor || 'Unknown Doctor'}</p>
                {prescription.doctorSpecialty && (
                  <p className="text-xs text-slate-500 mt-0.5">{prescription.doctorSpecialty}</p>
                )}
              </div>
              <div className="ring-1 ring-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-semibold text-slate-600 mb-1">Dispense Status</h4>
                <p className="text-sm font-medium text-slate-900">
                  {prescription.dispenseCount || 0} / {prescription.maxDispenses || 1}
                </p>
                {prescription.lastDispenseDate && prescription.dispenseCount > 0 && (
                  <p className="text-xs text-slate-600 mt-1">
                    Last: {(() => {
                      try {
                        const date = new Date(prescription.lastDispenseDate);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      } catch (e) {
                        return prescription.lastDispenseDate;
                      }
                    })()}
                  </p>
                )}
                {prescription.dispenseCount >= (prescription.maxDispenses || 1) && (
                  <p className="text-xs text-red-600 mt-1">Fully dispensed</p>
                )}
              </div>
            </div>
          </div>
          
          {/* Split Layout: Medications (Left) + Payment (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4 pb-4">
            {/* Left: Medications List */}
            <div className="lg:col-span-2 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 mb-3">Medications to Dispense</h4>
              {(prescription.medications||[]).map((m, i) => {
                const match = (medicinesData || []).find(x => (x.code && m.code && x.code === m.code)) || {};
                const priceText = extractPrice(match);
                const priceNum = getPriceNumber(priceText);
                const rateNum = getRateNumber(extractRate(match));
                const covered = priceNum * (rateNum/100);
                const patient = priceNum - covered;
                return (
                <div key={i} className="ring-1 ring-slate-200 rounded-xl p-3 bg-gradient-to-r from-emerald-50 to-teal-50">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 text-sm">{m.name}</div>
                      <div className="text-xs text-slate-600 mt-1">{m.dosage} {m.unit} • {m.frequency}/day • {m.duration} {m.durationUnit}</div>
                      {m.instructions && <div className="text-xs text-slate-500 mt-1 italic">{m.instructions}</div>}
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-1">
                      {priceText && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{priceText}</span>}
                      <div className="flex gap-1 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">CNSS: {covered.toFixed(2)}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Patient: {patient.toFixed(2)}</span>
                      </div>
                      <div className="mt-1">{renderMockBarcode(m.code || m.name)}</div>
                    </div>
                  </div>
                </div>
              );})}
              
              {/* Totals */}
            {(() => {
              const meds = Array.isArray(prescription.medications) ? prescription.medications : [];
              const totals = meds.reduce((acc, m) => {
                const match = (medicinesData || []).find(x => (x.code && m.code && x.code === m.code)) || {};
                const price = getPriceNumber(extractPrice(match));
                const rate = getRateNumber(extractRate(match));
                acc.amount += price;
                acc.covered += price * (rate/100);
                return acc;
              }, { amount: 0, covered: 0 });
              const patient = Math.max(0, totals.amount - totals.covered);
              return (
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">Total Cost:</span>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">{totals.amount.toFixed(2)} MAD</span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">-{totals.covered.toFixed(2)} CNSS</span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">=  {patient.toFixed(2)} Patient</span>
                      </div>
                    </div>
                </div>
              );
            })()}
            </div>
            
            {/* Right: Payment Method Selection */}
            <div className="lg:col-span-1">
              <h4 className="text-sm font-bold text-slate-900 mb-3">Payment Method</h4>
          <div className="space-y-3">
                <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${paymentMethod==='cash' ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}> 
              <div>
                    <div className="font-medium text-sm text-slate-800">Cash</div>
                    <div className="text-xs text-slate-500">Pay at counter</div>
              </div>
                  <input type="radio" name="pm" checked={paymentMethod==='cash'} onChange={() => setPaymentMethod('cash')} className="text-emerald-500 focus:ring-emerald-500" />
            </label>
                <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${paymentMethod==='card' ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}> 
              <div>
                    <div className="font-medium text-sm text-slate-800">Credit Card</div>
                    <div className="text-xs text-slate-500">Debit or credit</div>
              </div>
                  <input type="radio" name="pm" checked={paymentMethod==='card'} onChange={() => setPaymentMethod('card')} className="text-emerald-500 focus:ring-emerald-500" />
            </label>
          </div>
              
          {paymentMethod==='card' && (
                <div className="mt-4 ring-1 ring-slate-200 rounded-xl p-4 bg-gradient-to-r from-indigo-50 to-blue-50 space-y-3">
                  <h5 className="text-xs font-semibold text-slate-700 mb-2">Card Details</h5>
                  <input type="text" className="block w-full rounded-lg border-0 ring-1 ring-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" placeholder="Cardholder Name" />
                  <input type="text" inputMode="numeric" className="block w-full rounded-lg border-0 ring-1 ring-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" placeholder="Card Number" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" inputMode="numeric" className="block w-full rounded-lg border-0 ring-1 ring-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" placeholder="MM / YY" />
                    <input type="password" inputMode="numeric" className="block w-full rounded-lg border-0 ring-1 ring-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" placeholder="CVC" />
                </div>
                  <p className="text-xs text-slate-500 mt-2">Payments are processed securely.</p>
                </div>
      )}
                </div>
                </div>
          
          {/* Action Buttons */}
          <div className="px-4 pb-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button onClick={() => setStep(1)} className="inline-flex justify-center py-2.5 px-4 text-sm font-semibold rounded-lg text-slate-800 bg-white hover:bg-slate-50 border border-slate-200">Back</button>
            <button 
              onClick={handlePayment} 
              disabled={paymentLoading || !canProceed} 
              className={`inline-flex justify-center items-center gap-2 py-2.5 px-6 text-sm font-semibold rounded-lg text-white shadow ${
                paymentLoading || !canProceed 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-400 to-blue-400 hover:from-indigo-400 hover:via-indigo-300 hover:to-blue-300'
              }`}
            >
              {paymentLoading ? (
                <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <FiCheckCircle className="h-4 w-4" />
                  <span>Dispense & Process Payment</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: E-Claim (FSE) Generation - FINAL STEP */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Success Header */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-slate-900/5 p-6 text-center">
            <div className="rounded-full bg-emerald-100 p-3 inline-flex items-center justify-center mb-4">
              <FiCheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
          <h3 className="text-xl font-extrabold text-slate-900 mb-2">Transaction Complete!</h3>
            <p className="text-slate-600 mb-4">The prescription has been successfully processed and payment received.</p>
            <p className="text-sm text-slate-500">Generate E-Claim (FSE) to complete the workflow.</p>
          </div>

          {/* E-Claim Actions */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-slate-900/5 p-6">
            <h4 className="text-lg font-bold text-slate-900 mb-4">E-Claim (FSE) Management</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button 
                onClick={handleGenerateFSE} 
                disabled={fseLoading} 
                className="inline-flex justify-center items-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              >
                {fseLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FiCheckCircle className="h-4 w-4" />
                    <span>Generate E-Claim (FSE)</span>
                  </>
                )}
              </button>
              <button 
                onClick={async ()=>{
              try {
                const token = localStorage.getItem('auth_token');
                    const resp = await fetch(getApiUrl('/api/pharmacist-report'), { 
                      method: 'POST', 
                      headers: { 
                        'Content-Type': 'application/json', 
                        ...(token?{ Authorization: `Bearer ${token}` }: {}) 
                      }, 
                      body: JSON.stringify({ prescriptionId: prescription?.id }) 
                    });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data?.error || 'Report failed');
                    const bytes = atob(data.base64); 
                    const arr = new Uint8Array(bytes.length); 
                    for (let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
                    const blob = new Blob([arr], { type: 'application/pdf' }); 
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); 
                    a.href=url; 
                    a.download=data.filename||'Dispense_Report.pdf'; 
                    document.body.appendChild(a); 
                    a.click(); 
                    a.remove(); 
                    URL.revokeObjectURL(url);
                  } catch (e) { 
                    setError(e.message); 
                  }
                }} 
                disabled={fseLoading} 
                className="inline-flex justify-center items-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-60 shadow-sm"
              >
                Download Report (PDF)
              </button>
          </div>
        </div>

          {/* FSE JSON Display (Demo) */}
          {fseJson && (
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-slate-900/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Feuille de Soins Électronique (FSE)</h4>
                  <p className="text-xs text-slate-500 mt-1">CNSS FSE v2.0 | HL7 FHIR R4 Compliant | Hedera Blockchain Verified</p>
            </div>
                <span className="px-3 py-1 text-xs font-semibold bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full shadow-sm">
                  Production Ready
                </span>
            </div>
              
              {/* Key Claim Info - CNSS & HL7 FHIR Compliant */}
              <div className="space-y-3 mb-4">
                {/* Compliance Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-md">✓ CNSS FSE v2.0</span>
                  <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md">✓ HL7 FHIR R4</span>
                  <span className="px-2 py-1 text-xs font-semibold bg-purple-100 text-purple-800 rounded-md">✓ IHE Pharmacy</span>
                </div>
                
                {/* Claim Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                  <div>
                    <div className="text-xs font-medium text-slate-600">Claim ID</div>
                    <div className="text-sm font-bold text-slate-900 truncate">{fseJson.id}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-600">Total Amount</div>
                    <div className="text-sm font-bold text-emerald-600">{fseJson.total?.value?.toFixed(2)} MAD</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-600">CNSS Coverage</div>
                    <div className="text-sm font-bold text-blue-600">
                      {(fseJson.benefitBalance?.[0]?.financial?.[0]?.allowedMoney?.value || 0).toFixed(2)} MAD
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-600">Patient Pays</div>
                    <div className="text-sm font-bold text-amber-600">
                      {(fseJson.benefitBalance?.[0]?.financial?.[1]?.usedMoney?.value || 0).toFixed(2)} MAD
                    </div>
                  </div>
                </div>
                
                {/* Additional CNSS Info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="text-xs font-medium text-slate-600">Patient</div>
                    <div className="text-sm font-semibold text-slate-900">{fseJson.patient?.display || 'N/A'}</div>
                    <div className="text-xs text-slate-500 mt-1">ID: {fseJson.patient?.identifier?.value || 'N/A'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="text-xs font-medium text-slate-600">Prescriber</div>
                    <div className="text-sm font-semibold text-slate-900">{fseJson.prescriber?.display || 'N/A'}</div>
                    <div className="text-xs text-slate-500 mt-1">INPE: {fseJson.prescriber?.identifier?.value || 'N/A'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="text-xs font-medium text-slate-600">Pharmacy</div>
                    <div className="text-sm font-semibold text-slate-900">{fseJson.provider?.display || 'N/A'}</div>
                    <div className="text-xs text-slate-500 mt-1">INPE: {fseJson.provider?.identifier?.value || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* JSON Display */}
              <div className="relative bg-slate-900 rounded-lg p-4 overflow-auto max-h-96 shadow-inner">
                <div className="absolute top-2 right-2 px-2 py-1 text-xs font-mono text-emerald-400 bg-slate-800 rounded">
                  application/json
                  </div>
                <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap pt-6">
                  {JSON.stringify(fseJson, null, 2)}
                </pre>
                </div>
              
              {/* Action Buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(fseJson, null, 2));
                    const notification = document.createElement('div');
                    notification.className = 'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg bg-emerald-500 text-white shadow-lg animate-slide-in';
                    notification.textContent = '✓ FSE JSON copied to clipboard!';
                    document.body.appendChild(notification);
                    setTimeout(() => notification.remove(), 3000);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy JSON
                </button>
                <button 
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fseJson, null, 2));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute("download", `FSE_${fseJson.prescriptionId}.json`);
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-sm transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download JSON
                </button>
                <button 
                  onClick={() => {
                    const jsonWindow = window.open('', '_blank');
                    jsonWindow.document.write(`
                      <html>
                        <head>
                          <title>FSE Claim - ${fseJson.prescriptionId}</title>
                          <style>
                            body { 
                              background: #1e293b; 
                              color: #10b981; 
                              font-family: 'Courier New', monospace; 
                              padding: 20px; 
                              margin: 0;
                            }
                            pre { white-space: pre-wrap; word-wrap: break-word; }
                          </style>
                        </head>
                        <body>
                          <pre>${JSON.stringify(fseJson, null, 2)}</pre>
                        </body>
                      </html>
                    `);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  Open in New Tab
                </button>
                  </div>
                  </div>
          )}

          {/* Actions */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-slate-900/5 p-6">
            <button 
              onClick={() => { 
                setStep(1); 
                setPrescription(null); 
                setTopicId(''); 
                setMirrorResult(null); 
                setFseJson(null);
                setError('');
              }} 
              className="w-full inline-flex justify-center items-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 shadow-md"
            >
              Process New Prescription
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default PharmacistLookup;

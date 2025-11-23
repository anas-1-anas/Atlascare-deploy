import indexedDBManager from './indexedDB';
import { getApiUrl } from './api';

class OfflineQueueManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInterval = null;
    this.retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s exponential backoff
    this.maxRetries = 3;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.startSync();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.stopSync();
    });
  }

  async init() {
    await indexedDBManager.init();
    if (this.isOnline) {
      this.startSync();
    }
  }

  startSync() {
    if (this.syncInterval) return;
    
    this.syncInterval = setInterval(async () => {
      await this.processQueue();
    }, 5000); // Check every 5 seconds
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async addToQueue(item) {
    try {
      await indexedDBManager.addToOfflineQueue({
        type: item.type,
        data: item.data,
        endpoint: item.endpoint,
        method: item.method || 'POST',
        headers: item.headers || {},
        timestamp: Date.now()
      });
      
      // Try to process immediately if online
      if (this.isOnline) {
        await this.processQueue();
      }
    } catch (error) {
      console.error('Failed to add item to offline queue:', error);
    }
  }

  async processQueue() {
    if (!this.isOnline) return;

    try {
      const queue = await indexedDBManager.getOfflineQueue();
      
      for (const item of queue) {
        if (item.retryCount >= this.maxRetries) {
          // Remove items that have exceeded max retries
          await indexedDBManager.removeFromOfflineQueue(item.id);
          continue;
        }

        try {
          const success = await this.processItem(item);
          if (success) {
            await indexedDBManager.removeFromOfflineQueue(item.id);
          } else {
            await this.incrementRetryCount(item);
          }
        } catch (error) {
          console.error('Error processing queue item:', error);
          await this.incrementRetryCount(item);
        }
      }
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  }

  async processItem(item) {
    try {
      const response = await fetch(getApiUrl(item.endpoint), {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...item.headers
        },
        body: JSON.stringify(item.data)
      });

      if (response.ok) {
        return true;
      } else {
        console.warn(`Queue item failed with status ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('Network error processing queue item:', error);
      return false;
    }
  }

  async incrementRetryCount(item) {
    const newRetryCount = item.retryCount + 1;
    await indexedDBManager.updateRetryCount(item.id, newRetryCount);
  }

  // Specific queue methods for different operations
  async queueHCSMessage(topicID, messageData) {
    await this.addToQueue({
      type: 'hcs_message',
      endpoint: '/api/hcs/submit',
      data: {
        topicID,
        message: messageData
      }
    });
  }

  async queueVerification(topicID, verificationData) {
    await this.addToQueue({
      type: 'verification',
      endpoint: '/api/verify',
      data: {
        topicID,
        ...verificationData
      }
    });
  }

  async queueDispense(topicID, dispenseData) {
    await this.addToQueue({
      type: 'dispense',
      endpoint: '/api/dispense',
      data: {
        topicID,
        ...dispenseData
      }
    });
  }

  async queueFSEClaim(claimData) {
    await this.addToQueue({
      type: 'fse_claim',
      endpoint: '/api/fse/submit',
      data: claimData
    });
  }

  // Get queue status for UI
  async getQueueStatus() {
    const queue = await indexedDBManager.getOfflineQueue();
    return {
      total: queue.length,
      pending: queue.filter(item => item.retryCount < this.maxRetries).length,
      failed: queue.filter(item => item.retryCount >= this.maxRetries).length,
      isOnline: this.isOnline
    };
  }

  // Clear failed items
  async clearFailedItems() {
    const queue = await indexedDBManager.getOfflineQueue();
    const failedItems = queue.filter(item => item.retryCount >= this.maxRetries);
    
    for (const item of failedItems) {
      await indexedDBManager.removeFromOfflineQueue(item.id);
    }
    
    return failedItems.length;
  }

  // Retry failed items
  async retryFailedItems() {
    const queue = await indexedDBManager.getOfflineQueue();
    const failedItems = queue.filter(item => item.retryCount >= this.maxRetries);
    
    for (const item of failedItems) {
      // Reset retry count
      await indexedDBManager.updateRetryCount(item.id, 0);
    }
    
    // Process queue immediately
    await this.processQueue();
    
    return failedItems.length;
  }
}

// Create singleton instance
const offlineQueueManager = new OfflineQueueManager();

export default offlineQueueManager;

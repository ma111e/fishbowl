/**
 * FishBowl Security Extension - Cache Service
 * Handles caching of analysis results in browser.storage.local with expiration
 */

class FishBowlCacheService {
  /**
   * Constructor for the Cache Service
   */
  constructor() {
    this.CACHE_KEY_PREFIX = 'fishbowl_cache_';
    this.CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour in milliseconds
    this.enableCache = true; // Default to enabled, will be updated from settings

    // Load settings
    this.loadSettings();

    // Listen for settings changes and other cache-related actions
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'settingsUpdated') {
        this.enableCache = message.settings.enableCache !== undefined ? message.settings.enableCache : true;
        console.debug('Cache settings updated:', this.enableCache ? 'Enabled' : 'Disabled');
      } else if (message.action === 'purgeCache') {
        this.clearAllCache();
        console.debug('Cache purged via popup request');
        // Add a UI notification
        if (window.FishBowlUiManager) {
          window.FishBowlUiManager.addFeedEntry('Analysis cache purged (refresh the page to see the changes)', 'info');
        }
      }
    });

    console.debug('FishBowl Cache Service initialized');
  }

  /**
   * Set data in cache with current timestamp
   * @param {String} key The cache key
   * @param {Object} data The data to store
   * @returns {Promise<Boolean>} Success indicator
   */
  async setCache(key, data) {
    // Skip if caching is disabled
    if (!this.enableCache) {
      console.debug('Cache disabled, skipping cache set');
      return false;
    }

    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${key}`;
      const cacheItem = {
        timestamp: Date.now(),
        data: data
      };

      await browser.storage.local.set({ [cacheKey]: cacheItem });
      return true;
    } catch (error) {
      console.error('Error setting cache:', error);
      return false;
    }
  }

  /**
   * Get data from cache if not expired
   * @param {String} key The cache key
   * @returns {Promise<Object|null>} The cached data or null if expired/not found
   */
  async getCache(key) {
    // Skip if caching is disabled
    if (!this.enableCache) {
      console.debug('Cache disabled, skipping cache retrieval');
      return null;
    }

    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${key}`;
      const now = Date.now();

      const result = await browser.storage.local.get(cacheKey);
      const cacheItem = result[cacheKey];

      if (!cacheItem) {
        return null;
      }

      // Check if cache has expired
      if (now - cacheItem.timestamp > this.CACHE_EXPIRY_MS) {
        await this.removeCache(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.error('Error getting cache:', error);
      return null;
    }
  }

  /**
   * Remove a specific item from cache
   * @param {String} key The cache key
   */
  async removeCache(key) {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${key}`;
      await browser.storage.local.remove(cacheKey);
    } catch (error) {
      console.error('Error removing cache item:', error);
    }
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      const result = await browser.storage.local.get(['settings']);
      const settings = result.settings || {};
      this.enableCache = settings.enableCache !== undefined ? settings.enableCache : true;
      console.debug('Cache settings loaded:', this.enableCache ? 'Enabled' : 'Disabled');
    } catch (error) {
      console.error('Error loading cache settings:', error);
      // Use default value on error
      this.enableCache = true;
    }
  }

  /**
   * Clear all fishbowl cache entries
   */
  async clearAllCache() {
    try {
      const items = await browser.storage.local.get(null);
      const keys = Object.keys(items).filter(key => key.startsWith(this.CACHE_KEY_PREFIX));

      if (keys.length > 0) {
        await browser.storage.local.remove(keys);
        console.debug(`Cleared ${keys.length} cache entries`);
      } else {
        console.debug('No cache entries to clear');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }
}

// Initialize on load
window.FishBowlCacheService = new FishBowlCacheService();
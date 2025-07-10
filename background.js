// ============================================================================
// BACKGROUND SCRIPT for Backup Long-Open Tabs Extension
//
// This script runs in the background and handles:
//   - Tab tracking and age calculation
//   - Automatic backup scheduling with time-based triggers
//   - Manual backup requests from popup
//   - Settings management and alarm handling
//   - Error handling for missing or corrupted data
// ============================================================================

// Default settings - these are used when no user settings exist
const DEFAULT_SETTINGS = {
  // Basic settings
  minDays: 7,                    // Minimum days before a tab is considered "old"
  maxTabs: 1000,                  // Maximum number of tabs to backup

  // Automatic backup settings
  autoBackupEnabled: false,      // Whether automatic backups are enabled
  backupTime: '05:00',           // Time of day to perform backups (24-hour format)
  backupDays: ['Mon'],           // Days of week for automatic backup (Mon-Sun)
  toleranceHours: 12,            // Hours of tolerance for daylight saving time

  // Advanced settings
  excludePrivate: true,          // Exclude private browsing tabs
  excludePinned: false,          // Exclude pinned tabs
  maxTitleLength: 100,           // Maximum length for tab titles

  // Appearance
  theme: 'auto'                  // Theme setting (auto/light/dark)
};

// Current settings (will be loaded from storage)
let currentSettings = { ...DEFAULT_SETTINGS };

// Tab data storage
let tabData = {};

// Last automatic backup time
let lastAutomaticBackup = null;

// Initialize the background script
async function initialize() {
  try {
    // Load settings from storage
    await loadSettings();
    
    // Load existing tab data
    await loadTabData();
    
    // Set up alarm listener for automatic backups
    browser.alarms.onAlarm.addListener(handleAlarm);
    
    // Set up message listener for popup communication
    browser.runtime.onMessage.addListener(handleMessage);
    
    // Set up tab event listeners
    browser.tabs.onUpdated.addListener(handleTabUpdate);
    browser.tabs.onRemoved.addListener(handleTabRemoved);
    
    // Schedule automatic backup if enabled
    if (currentSettings.autoBackupEnabled) {
      await scheduleAutomaticBackup();
    }
    
    console.log('Background script initialized successfully');
  } catch (error) {
    console.error('Error initializing background script:', error);
  }
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await browser.storage.local.get('settings');
    if (result.settings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...result.settings };
    }
    console.log('Settings loaded:', currentSettings);
  } catch (error) {
    console.error('Error loading settings:', error);
    // Use default settings if loading fails
    currentSettings = { ...DEFAULT_SETTINGS };
  }
}

// Load tab data from storage with error handling
async function loadTabData() {
  try {
    const result = await browser.storage.local.get('tabData');
    // Treat missing or empty tabData as normal (no error)
    if (result.tabData && typeof result.tabData === 'object' && Object.keys(result.tabData).length > 0) {
      tabData = result.tabData;
    } else {
      tabData = {}; // No tabs tracked yet
    }
    console.log(`Loaded ${Object.keys(tabData).length} tracked tabs`);
  } catch (error) {
    console.error('Error loading tab data:', error);
    tabData = {}; // Fallback to empty
  }
}

// Save tab data to storage with error handling
async function saveTabData() {
  try {
    await browser.storage.local.set({ tabData });
    console.log(`Saved ${Object.keys(tabData).length} tabs to storage`);
  } catch (error) {
    console.error('Error saving tab data:', error);
    throw error;
  }
}

// Handle tab updates (new tabs, title changes, etc.)
async function handleTabUpdate(tabId, changeInfo, tab) {
  try {
    // Skip if tab is not complete or URL is not available
    if (changeInfo.status !== 'complete' || !tab.url) {
      return;
    }
    
    // Skip private browsing tabs if setting is enabled
    if (currentSettings.excludePrivate && tab.incognito) {
      return;
    }
    
    // Skip pinned tabs if setting is enabled
    if (currentSettings.excludePinned && tab.pinned) {
      return;
    }
    
    // Skip non-http(s) URLs
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
      return;
    }
    
    const now = Date.now();
    const tabAge = now - tab.createdAt;
    const tabAgeDays = tabAge / (24 * 60 * 60 * 1000);
    
    // Only track tabs that meet the minimum age requirement
    if (tabAgeDays >= currentSettings.minDays) {
      // Truncate title if it's too long
      let title = tab.title || '';
      if (title.length > currentSettings.maxTitleLength) {
        title = title.substring(0, currentSettings.maxTitleLength) + '...';
      }
      
      tabData[tabId] = {
        title: title,
        url: tab.url,
        createdAt: tab.createdAt,
        lastUpdated: now
      };
      
      await saveTabData();
      console.log(`Tracked tab: ${title} (${tabAgeDays.toFixed(1)} days old)`);
    }
  } catch (error) {
    console.error('Error handling tab update:', error);
  }
}

// Handle tab removal (clean up tracking data)
async function handleTabRemoved(tabId, removeInfo) {
  try {
    if (tabData[tabId]) {
      delete tabData[tabId];
      await saveTabData();
      console.log(`Removed tracking for tab ${tabId}`);
    }
  } catch (error) {
    console.error('Error handling tab removal:', error);
  }
}

// Handle automatic backup alarm
async function handleAlarm(alarm) {
  if (alarm.name === 'automaticBackup') {
    try {
      // Check if today is a selected backup day
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const today = daysOfWeek[new Date().getDay()];
      const backupDays = currentSettings.backupDays || ['Mon'];
      if (!backupDays.includes(today)) {
        console.log(`Automatic backup skipped: ${today} is not a selected backup day.`);
        return;
      }
      console.log('Automatic backup alarm triggered');
      // Check if enough time has passed since last backup
      const now = Date.now();
      const toleranceMs = currentSettings.toleranceHours * 60 * 60 * 1000;
      if (lastAutomaticBackup && (now - lastAutomaticBackup) < toleranceMs) {
        console.log('Skipping automatic backup - too soon since last backup');
        return;
      }
      // Perform automatic backup
      await performBackup();
      lastAutomaticBackup = now;
      // Save last backup time
      await browser.storage.local.set({ lastAutomaticBackup });
      console.log('Automatic backup completed successfully');
    } catch (error) {
      console.error('Error during automatic backup:', error);
    }
  }
}

// Schedule automatic backup alarm
async function scheduleAutomaticBackup() {
  try {
    // Clear existing alarm
    await browser.alarms.clear('automaticBackup');
    
    // Parse backup time
    const [hours, minutes] = currentSettings.backupTime.split(':').map(Number);
    
    // Calculate next backup time
    const now = new Date();
    const nextBackup = new Date();
    nextBackup.setHours(hours, minutes, 0, 0);
    
    // If backup time has already passed today, schedule for tomorrow
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }
    
    // Create alarm
    await browser.alarms.create('automaticBackup', {
      when: nextBackup.getTime(),
      periodInMinutes: currentSettings.backupInterval * 24 * 60
    });
    
    console.log(`Automatic backup scheduled for ${nextBackup.toLocaleString()}`);
  } catch (error) {
    console.error('Error scheduling automatic backup:', error);
  }
}

// Perform backup operation
async function performBackup() {
  try {
    // Get current tabs
    const tabs = await browser.tabs.query({});
    const now = Date.now();
    let backupCount = 0;
    // Use debug mode if minDays < 0
    const minDays = currentSettings.minDays;
    for (const tab of tabs) {
      // Skip if tab doesn't meet criteria
      if (currentSettings.excludePrivate && tab.incognito) continue;
      if (currentSettings.excludePinned && tab.pinned) continue;
      if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) continue;
      // If debug mode (minDays < 0), log all tabs
      let tabAgeDays = 0;
      if (minDays >= 0) {
        // Only backup tabs that meet minimum age requirement
        const createdAt = tabData[tab.id]?.createdAt || tabData[tab.id]?.lastUpdated || now;
        tabAgeDays = (now - createdAt) / (24 * 60 * 60 * 1000);
        if (tabAgeDays < minDays) continue;
      }
      // Truncate title if needed
      let title = tab.title || '';
      if (title.length > currentSettings.maxTitleLength) {
        title = title.substring(0, currentSettings.maxTitleLength) + '...';
      }
      // Always set createdAt if not present
      if (!tabData[tab.id] || !tabData[tab.id].createdAt) {
        tabData[tab.id] = {
          title: title,
          url: tab.url,
          createdAt: now,
          lastUpdated: now,
          favIconUrl: tab.favIconUrl || ''
        };
      } else {
        tabData[tab.id] = {
          ...tabData[tab.id],
          title: title,
          url: tab.url,
          lastUpdated: now,
          favIconUrl: tab.favIconUrl || tabData[tab.id].favIconUrl || ''
        };
      }
      backupCount++;
      // Stop if we've reached the maximum tab limit
      if (backupCount >= currentSettings.maxTabs) {
        console.log(`Reached maximum tab limit (${currentSettings.maxTabs})`);
        break;
      }
    }
    // Save backup data
    await saveTabData();
    if (backupCount === 0) {
      console.log('No tabs to back up');
      return { success: true, count: 0, message: 'No tabs to back up' };
    }
    console.log(`Backup completed: ${backupCount} tabs backed up`);
    return { success: true, count: backupCount };
  } catch (error) {
    console.error('Error performing backup:', error);
    return { success: false, message: error.message };
  }
}

// Handle messages from popup and options pages
async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'getTabCount':
        // Return count of tracked tabs
        sendResponse({ count: Object.keys(tabData).length });
        break;
        
      case 'performBackup':
        // Perform manual backup
        const result = await performBackup();
        sendResponse(result);
        break;
        
      case 'getSettings':
        // Return current settings
        sendResponse({ settings: currentSettings });
        break;
        
      case 'updateSettings':
        // Update settings and reschedule alarm if needed
        currentSettings = { ...currentSettings, ...message.settings };
        await browser.storage.local.set({ settings: currentSettings });
        
        if (currentSettings.autoBackupEnabled) {
          await scheduleAutomaticBackup();
        } else {
          await browser.alarms.clear('automaticBackup');
        }
        
        sendResponse({ success: true });
        break;
        
      case 'getBackupStatus':
        // Return backup status information
        const status = {
          tabCount: Object.keys(tabData).length,
          lastBackup: lastAutomaticBackup,
          autoBackupEnabled: currentSettings.autoBackupEnabled,
          nextBackup: null
        };
        
        // Calculate next backup time if enabled
        if (currentSettings.autoBackupEnabled) {
          const alarms = await browser.alarms.get('automaticBackup');
          if (alarms.length > 0) {
            status.nextBackup = alarms[0].scheduledTime;
          }
        }
        
        sendResponse(status);
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open for async response
}

// Initialize when the script loads
initialize(); 
initialize(); 
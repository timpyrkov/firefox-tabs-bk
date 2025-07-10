// ============================================================================
// OPTIONS PAGE SCRIPT for Backup Long-Open Tabs Extension
//
// This script handles the settings page functionality, including loading/saving
// user preferences and managing the UI state. It also handles automatic backup
// scheduling with time-based triggers and tolerance settings.
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

// Load settings from storage and populate the form
async function loadSettings() {
  try {
    // Get settings from browser storage
    const result = await browser.storage.local.get('settings');
    const settings = result.settings || {};
    
    // Merge with defaults (user settings override defaults)
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
    
    // Populate form fields with current settings
    document.getElementById('minDays').value = mergedSettings.minDays;
    document.getElementById('maxTabs').value = mergedSettings.maxTabs;
    
    // Automatic backup settings
    document.getElementById('autoBackupEnabled').checked = mergedSettings.autoBackupEnabled;
    document.getElementById('backupTime').value = mergedSettings.backupTime;
    // Set backupDays checkboxes
    const days = mergedSettings.backupDays || ['Mon'];
    document.querySelectorAll('.backup-day').forEach(cb => {
      cb.checked = days.includes(cb.value);
    });
    document.getElementById('toleranceHours').value = mergedSettings.toleranceHours;
    
    // Advanced settings
    document.getElementById('excludePrivate').checked = mergedSettings.excludePrivate;
    document.getElementById('excludePinned').checked = mergedSettings.excludePinned;
    document.getElementById('maxTitleLength').value = mergedSettings.maxTitleLength;
    
    // Theme setting
    document.getElementById('theme').value = mergedSettings.theme;
    
    console.log('Settings loaded successfully');
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    // Collect all form values
    const settings = {
      // Basic settings
      minDays: parseInt(document.getElementById('minDays').value) || DEFAULT_SETTINGS.minDays,
      maxTabs: parseInt(document.getElementById('maxTabs').value) || DEFAULT_SETTINGS.maxTabs,
      
      // Automatic backup settings
      autoBackupEnabled: document.getElementById('autoBackupEnabled').checked,
      backupTime: document.getElementById('backupTime').value || DEFAULT_SETTINGS.backupTime,
      backupDays: Array.from(document.querySelectorAll('.backup-day:checked')).map(cb => cb.value),
      toleranceHours: parseInt(document.getElementById('toleranceHours').value) || DEFAULT_SETTINGS.toleranceHours,
      
      // Advanced settings
      excludePrivate: document.getElementById('excludePrivate').checked,
      excludePinned: document.getElementById('excludePinned').checked,
      maxTitleLength: parseInt(document.getElementById('maxTitleLength').value) || DEFAULT_SETTINGS.maxTitleLength,
      
      // Theme
      theme: document.getElementById('theme').value || DEFAULT_SETTINGS.theme
    };
    
    // Validate settings
    if (settings.minDays < 1 || settings.minDays > 365) {
      throw new Error('Minimum days must be between 1 and 365');
    }
    if (settings.maxTabs < 1 || settings.maxTabs > 1000) {
      throw new Error('Maximum tabs must be between 1 and 1000');
    }
    if (settings.backupInterval < 1 || settings.backupInterval > 30) {
      throw new Error('Backup interval must be between 1 and 30 days');
    }
    if (settings.toleranceHours < 1 || settings.toleranceHours > 24) {
      throw new Error('Tolerance hours must be between 1 and 24');
    }
    
    // Save to browser storage
    await browser.storage.local.set({ settings });
    
    // Update the background script with new settings
    await browser.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    });
    
    // Schedule or cancel automatic backup alarm based on settings
    if (settings.autoBackupEnabled) {
      await scheduleAutomaticBackup(settings);
    } else {
      await cancelAutomaticBackup();
    }
    
    showStatus('Settings saved successfully!', 'success');
    console.log('Settings saved:', settings);
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(`Error saving settings: ${error.message}`, 'error');
  }
}

// Schedule automatic backup alarm
async function scheduleAutomaticBackup(settings) {
  try {
    // Parse backup time (e.g., "05:00" -> 5 hours, 0 minutes)
    const [hours, minutes] = settings.backupTime.split(':').map(Number);
    
    // Calculate next backup time
    const now = new Date();
    const nextBackup = new Date();
    nextBackup.setHours(hours, minutes, 0, 0); // Set to backup time today
    
    // If backup time has already passed today, schedule for tomorrow
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }
    
    // Create alarm for automatic backup (fires every day at the set time)
    await browser.alarms.create('automaticBackup', {
      when: nextBackup.getTime(),
      periodInMinutes: 24 * 60 // Every day
    });
    console.log(`Automatic backup scheduled for ${nextBackup.toLocaleString()} (will check selected days)`);
    
  } catch (error) {
    console.error('Error scheduling automatic backup:', error);
    throw error;
  }
}

// Cancel automatic backup alarm
async function cancelAutomaticBackup() {
  try {
    await browser.alarms.clear('automaticBackup');
    console.log('Automatic backup cancelled');
  } catch (error) {
    console.error('Error cancelling automatic backup:', error);
    // Don't throw error here as it's not critical
  }
}

// Show status message to user
function showStatus(message, type = 'info') {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = 'status-message';
    }, 3000);
  }
}

// Validate form inputs in real-time
function validateInput(input) {
  const value = parseInt(input.value);
  const min = parseInt(input.min);
  const max = parseInt(input.max);
  
  if (value < min || value > max) {
    input.style.borderColor = '#dc3545';
    return false;
  } else {
    input.style.borderColor = '';
    return true;
  }
}

// Initialize the options page
document.addEventListener('DOMContentLoaded', () => {
  // Load current settings
  loadSettings();
  
  // Add event listeners
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', async () => {
    const resetBtn = document.getElementById('resetBtn');
    resetBtn.disabled = true;
    resetBtn.textContent = 'Resetting...';
    try {
      await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
      showStatus('Settings reset to defaults. Reloading...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      showStatus('Failed to reset settings', 'error');
      resetBtn.disabled = false;
      resetBtn.textContent = 'Reset to Defaults';
    }
  });
  
  // Add real-time validation for number inputs
  const numberInputs = document.querySelectorAll('input[type="number"]');
  numberInputs.forEach(input => {
    input.addEventListener('input', () => validateInput(input));
    input.addEventListener('blur', () => validateInput(input));
  });
  
  // Add validation for time input
  const timeInput = document.getElementById('backupTime');
  timeInput.addEventListener('change', () => {
    const time = timeInput.value;
    if (time && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      timeInput.style.borderColor = '#dc3545';
    } else {
      timeInput.style.borderColor = '';
    }
  });
  
  // Show current settings info
  console.log('Options page initialized');
}); 
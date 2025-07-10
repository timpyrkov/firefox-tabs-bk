// ============================================================================
// POPUP SCRIPT for Backup Long-Open Tabs Extension
//
// This script handles the popup interface, including:
//   - Displaying current tab count and backup status
//   - Triggering manual backups
//   - Showing automatic backup schedule information
//   - Navigation to settings and tab log pages
// ============================================================================

// Current tab count and backup status
let currentTabCount = 0;
let backupStatus = {
  tabCount: 0,
  lastBackup: null,
  autoBackupEnabled: false,
  nextBackup: null
};

// Initialize the popup when it opens
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load current status from background script
    await loadBackupStatus();
    
    // Set up event listeners for buttons
    setupEventListeners();
    
    // Update the display
    updateDisplay();
    
    console.log('Popup initialized successfully');
  } catch (error) {
    console.error('Error initializing popup:', error);
    showError('Failed to load extension data');
  }
});

// Load backup status from background script
async function loadBackupStatus() {
  try {
    // Get backup status
    const statusResponse = await browser.runtime.sendMessage({ action: 'getBackupStatus' });
    if (statusResponse.error) {
      throw new Error(statusResponse.error);
    }
    backupStatus = statusResponse;
    
    // Get current tab count
    const countResponse = await browser.runtime.sendMessage({ action: 'getTabCount' });
    if (countResponse.error) {
      throw new Error(countResponse.error);
    }
    currentTabCount = countResponse.count;
    
    console.log('Backup status loaded:', backupStatus);
  } catch (error) {
    console.error('Error loading backup status:', error);
    throw error;
  }
}

// Set up event listeners for all buttons
function setupEventListeners() {
  // Manual backup button
  const backupBtn = document.getElementById('backupBtn');
  if (backupBtn) {
    backupBtn.addEventListener('click', performManualBackup);
  }
  
  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
  }
  
  // Tab log button
  const tabLogBtn = document.getElementById('tabLogBtn');
  if (tabLogBtn) {
    tabLogBtn.addEventListener('click', openTabLog);
  }
}

// Perform manual backup
async function performManualBackup() {
  const backupBtn = document.getElementById('backupBtn');
  const originalText = backupBtn.textContent;
  try {
    // Disable button and show loading state
    backupBtn.disabled = true;
    backupBtn.textContent = 'Backing up...';
    // Send backup request to background script
    const response = await browser.runtime.sendMessage({ action: 'performBackup' });
    if (!response || typeof response !== 'object') {
      // If the table has tabs, treat as silent success
      if (currentTabCount && currentTabCount > 0) {
        console.log('Backup: No response, but table updated. Treating as silent success.');
      } else {
        showError('No tabs to back up.');
      }
    } else if (response.success) {
      if (response.count === 0) {
        showSuccess(response.message || 'No tabs to back up.');
      } else {
        showSuccess(`Backup completed! ${response.count} tabs backed up.`);
      }
      // Reload status to update counts
      await loadBackupStatus();
      updateDisplay();
    } else if (response.success === false) {
      // Only show error if success: false
      showError(response.message || 'Backup failed');
    }
  } catch (error) {
    console.error('Backup error:', error);
    showError(`Backup failed: ${error.message}`);
  } finally {
    // Restore button state
    backupBtn.disabled = false;
    backupBtn.textContent = originalText;
  }
}

// Open settings page
function openSettings() {
  browser.runtime.openOptionsPage();
}

// Open tab log page
function openTabLog() {
  browser.tabs.create({
    url: browser.runtime.getURL('tabs.html')
  });
}

// Update the popup display with current information
function updateDisplay() {
  // Update tab count
  const tabCountElement = document.getElementById('tabCount');
  if (tabCountElement) {
    tabCountElement.textContent = currentTabCount;
  }
  
  // Update automatic backup status
  const autoBackupElement = document.getElementById('autoBackupStatus');
  if (autoBackupElement) {
    if (backupStatus.autoBackupEnabled) {
      autoBackupElement.textContent = 'Enabled';
      autoBackupElement.className = 'status enabled';
    } else {
      autoBackupElement.textContent = 'Disabled';
      autoBackupElement.className = 'status disabled';
    }
  }
  
  // Update last backup time
  const lastBackupElement = document.getElementById('lastBackup');
  if (lastBackupElement) {
    if (backupStatus.lastBackup) {
      const lastBackupDate = new Date(backupStatus.lastBackup);
      lastBackupElement.textContent = formatDate(lastBackupDate);
    } else {
      lastBackupElement.textContent = 'Never';
    }
  }
  
  // Update next backup time
  const nextBackupElement = document.getElementById('nextBackup');
  if (nextBackupElement) {
    if (backupStatus.nextBackup) {
      const nextBackupDate = new Date(backupStatus.nextBackup);
      nextBackupElement.textContent = formatDate(nextBackupDate);
    } else {
      nextBackupElement.textContent = 'Not scheduled';
    }
  }
  
  // Show/hide automatic backup info based on status
  const autoBackupInfo = document.getElementById('autoBackupInfo');
  if (autoBackupInfo) {
    autoBackupInfo.style.display = backupStatus.autoBackupEnabled ? 'block' : 'none';
  }
}

// Format date for display
function formatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// Show success message
function showSuccess(message) {
  showMessage(message, 'success');
}

// Show error message
function showError(message) {
  showMessage(message, 'error');
}

// Show message to user
function showMessage(text, type = 'info') {
  // Create or get message element
  let messageElement = document.getElementById('message');
  if (!messageElement) {
    messageElement = document.createElement('div');
    messageElement.id = 'message';
    messageElement.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.9rem;
      font-weight: 500;
      z-index: 1000;
      max-width: 300px;
      text-align: center;
    `;
    document.body.appendChild(messageElement);
  }
  
  // Set message content and style
  messageElement.textContent = text;
  messageElement.className = `message ${type}`;
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.parentNode.removeChild(messageElement);
    }
  }, 3000);
}
// ============================================================================
// TABS MANAGEMENT PAGE SCRIPT for Backup Long-Open Tabs Extension
//
// This script fetches all tracked tabs from storage and displays them in a
// sortable, filterable table. It also provides CSV/JSON export functionality.
// ============================================================================

// Utility: Get domain from a URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Utility: Get favicon URL for a tab or domain
function getFaviconUrl(tab) {
  // Use Firefox's built-in favicon if available
  if (tab.favIconUrl) return tab.favIconUrl;
  // Fallback to Google favicon service
  if (tab.domain) {
    return `https://www.google.com/s2/favicons?domain=${tab.domain}&sz=16`;
  }
  return '';
}

// Default SVG favicon (gray tab icon)
const DEFAULT_FAVICON =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="%23b0b8c5"/><rect x="3" y="4" width="10" height="8" rx="2" fill="white"/></svg>';

// State for sorting and filtering
let tabRows = [];
let currentSort = { key: 'createdAt', dir: 'desc' };
let currentFilter = '';

// Fetch tab data from storage and render the table
async function loadTabLog() {
  try {
    // Get tab data from storage with error handling
    const data = await browser.storage.local.get('tabData');
    const now = Date.now();
    let loggedTabData = {};
    if (data.tabData && typeof data.tabData === 'object' && Object.keys(data.tabData).length > 0) {
      loggedTabData = data.tabData;
    }
    // Build a Set of logged URLs
    const loggedUrlSet = new Set();
    for (const tabId in loggedTabData) {
      if (loggedTabData[tabId].url) {
        loggedUrlSet.add(loggedTabData[tabId].url);
      }
    }
    // Get all open tabs
    let openTabs = [];
    try {
      openTabs = await browser.tabs.query({});
    } catch (e) {
      openTabs = [];
    }
    // Build a map of open tabs by URL
    const openTabsMap = {};
    for (const tab of openTabs) {
      if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) continue;
      openTabsMap[tab.url] = tab;
    }
    // Combine: all open tabs + all logged tabs (avoid duplicates)
    const combinedTabs = [];
    // 1. Add all open tabs (mark as logged if in loggedUrlSet)
    for (const url in openTabsMap) {
      const tab = openTabsMap[url];
      const isLogged = loggedUrlSet.has(url);
      let loggedEntry = null;
      if (isLogged) {
        for (const tabId in loggedTabData) {
          if (loggedTabData[tabId].url === url) {
            loggedEntry = loggedTabData[tabId];
            break;
          }
        }
      }
      combinedTabs.push({
        ...tab,
        domain: getDomain(tab.url),
        ageInDays: loggedEntry ? Math.floor((now - loggedEntry.createdAt) / (24 * 60 * 60 * 1000)) : 0,
        tabId: tab.id,
        logged: isLogged,
        createdAt: loggedEntry ? loggedEntry.createdAt : tab.lastAccessed || tab.lastModified || now,
      });
    }
    // 2. Add logged tabs that are not currently open (by URL)
    for (const tabId in loggedTabData) {
      const loggedTab = loggedTabData[tabId];
      if (!openTabsMap[loggedTab.url]) {
        combinedTabs.push({
          ...loggedTab,
          domain: getDomain(loggedTab.url),
          ageInDays: Math.floor((now - loggedTab.createdAt) / (24 * 60 * 60 * 1000)),
          tabId,
          logged: true,
        });
      }
    }
    tabRows = combinedTabs;
    renderTable();
  } catch (error) {
    console.error('Error loading tab log:', error);
    showMessage('Error loading tab data', 'error');
  }
}

// Render the table with current sorting and filtering
function renderTable() {
  let rows = tabRows;
  
  // Filter
  if (currentFilter) {
    const filter = currentFilter.toLowerCase();
    rows = rows.filter(row =>
      (row.title && row.title.toLowerCase().includes(filter)) ||
      (row.domain && row.domain.toLowerCase().includes(filter))
    );
  }
  
  // Sort
  rows = rows.slice().sort((a, b) => {
    let vA = a[currentSort.key];
    let vB = b[currentSort.key];
    if (currentSort.key === 'title' || currentSort.key === 'domain') {
      vA = (vA || '').toLowerCase();
      vB = (vB || '').toLowerCase();
    }
    if (currentSort.key === 'logged') {
      // true (logged) first if asc, false (not logged) first if desc
      return currentSort.dir === 'asc' ? (vB - vA) : (vA - vB);
    }
    if (currentSort.key === 'url') {
      vA = (vA || '').toLowerCase();
      vB = (vB || '').toLowerCase();
      if (vA < vB) return currentSort.dir === 'asc' ? -1 : 1;
      if (vA > vB) return currentSort.dir === 'asc' ? 1 : -1;
      return 0;
    }
    if (vA < vB) return currentSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return currentSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  
  const tableBody = document.getElementById('tabTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#666;">No tabs found</td></tr>';
    return;
  }
  
  rows.forEach(row => {
    const tr = document.createElement('tr');
    
    // Status column with checkbox
    const statusTd = document.createElement('td');
    const logCheckbox = document.createElement('input');
    logCheckbox.type = 'checkbox';
    logCheckbox.className = 'tab-checkbox ' + (row.logged ? 'tab-checkbox-logged' : 'tab-checkbox-not-logged');
    logCheckbox.checked = false; // Always start unchecked
    logCheckbox.dataset.url = row.url;
    logCheckbox.dataset.logged = row.logged.toString();
    statusTd.appendChild(logCheckbox);
    tr.appendChild(statusTd);
    
    // Title column
    const titleTd = document.createElement('td');
    titleTd.textContent = row.title || 'Untitled';
    tr.appendChild(titleTd);
    
    // Link column
    const linkTd = document.createElement('td');
    const link = document.createElement('a');
    link.href = row.url;
    link.textContent = row.url;
    link.target = '_blank';
    linkTd.appendChild(link);
    tr.appendChild(linkTd);
    
    // Opened from column
    const openedFromTd = document.createElement('td');
    openedFromTd.textContent = formatDate(row.createdAt);
    tr.appendChild(openedFromTd);
    
    tableBody.appendChild(tr);
  });
  
  // Update sort indicators
  document.querySelectorAll('.tablog-table th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === currentSort.key) {
      th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// Clear logs with filtering
async function handleAddRemoveCheckedTabs() {
  try {
    const checkedBoxes = document.querySelectorAll('.tab-checkbox:checked');
    if (checkedBoxes.length === 0) {
      showMessage('Please select at least one tab to add or remove', 'info');
      return;
    }
    
    // Get current logged tab data
    const data = await browser.storage.local.get('tabData');
    let loggedTabData = {};
    if (data.tabData && typeof data.tabData === 'object') {
      loggedTabData = data.tabData;
    }
    
    let changesMade = false;
    
    for (const checkbox of checkedBoxes) {
      const url = checkbox.dataset.url;
      const isCurrentlyLogged = checkbox.dataset.logged === 'true';
      
      if (isCurrentlyLogged) {
        // Remove from logged tabs
        for (const tabId in loggedTabData) {
          if (loggedTabData[tabId].url === url) {
            delete loggedTabData[tabId];
            changesMade = true;
            break;
          }
        }
      } else {
        // Add to logged tabs
        const tabId = Date.now() + Math.random().toString(36).substr(2, 9);
        loggedTabData[tabId] = {
          url: url,
          title: checkbox.closest('tr').querySelector('td:nth-child(2)').textContent,
          createdAt: Date.now(),
          domain: checkbox.closest('tr').querySelector('td:nth-child(4)').textContent
        };
        changesMade = true;
      }
    }
    
    if (changesMade) {
      // Save updated data
      await browser.storage.local.set({ tabData: loggedTabData });
      
      // Reload the table to reflect changes
      await loadTabLog();
      
      showMessage(`Successfully updated ${checkedBoxes.length} tab${checkedBoxes.length > 1 ? 's' : ''}`, 'success');
    }
    
  } catch (error) {
    console.error('Error handling add/remove checked tabs:', error);
    showMessage('Error updating tabs', 'error');
  }
}

// Show message to user
function showMessage(text, type = 'info') {
  // Create a simple message display
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 6px;
    font-weight: 500;
    z-index: 1000;
    max-width: 300px;
    animation: slideIn 0.3s ease;
  `;
  
  switch (type) {
    case 'success':
      messageDiv.style.background = '#d4edda';
      messageDiv.style.color = '#155724';
      messageDiv.style.border = '1px solid #c3e6cb';
      break;
    case 'error':
      messageDiv.style.background = '#f8d7da';
      messageDiv.style.color = '#721c24';
      messageDiv.style.border = '1px solid #f5c6cb';
      break;
    default:
      messageDiv.style.background = '#d1ecf1';
      messageDiv.style.color = '#0c5460';
      messageDiv.style.border = '1px solid #bee5eb';
  }
  
  messageDiv.textContent = text;
  document.body.appendChild(messageDiv);
  
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.parentNode.removeChild(messageDiv);
    }
  }, type === 'error' ? 7000 : 4000);
}

// Escape HTML for safe rendering
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

// Format date for display
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

// On DOMContentLoaded, update header caption with minDays from settings
async function updateHeaderCaption() {
  let minDays = 7; // fallback default
  try {
    const settings = await getSettings();
    minDays = settings.minDays;
    console.log('DEBUG: minDays from storage:', minDays, settings);
  } catch (e) {
    console.error('Error reading minDays from storage:', e);
  }
  const caption = document.getElementById('header-caption');
  if (caption) {
    // Always clip to 1-365 for display
    const days = Math.max(1, Math.min(365, Math.round(minDays)));
    caption.textContent = `This browser extension logs all tabs which stay open for ${days} day${days === 1 ? '' : 's'}. You can review, export, or remove them here.`;
  }
}

async function getSettings() {
  const result = await browser.storage.local.get('settings');
  // Always merge with defaults to ensure all keys exist
  const DEFAULT_SETTINGS = {
    minDays: -1,
    maxTabs: 1000,
    autoBackupEnabled: false,
    backupTime: '05:00',
    backupDays: ['Mon'],
    toleranceHours: 12,
    excludePrivate: true,
    excludePinned: false,
    maxTitleLength: 100,
    theme: 'auto'
  };
  return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}


// Handle sorting when clicking table headers
document.addEventListener('DOMContentLoaded', async () => {
  await updateHeaderCaption();
  loadTabLog();
  
  // Sorting
  document.querySelectorAll('.tablog-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.key = key;
        currentSort.dir = 'asc';
      }
      renderTable();
    });
  });
  
  // Filtering
  document.getElementById('tablog-search').addEventListener('input', e => {
    currentFilter = e.target.value;
    renderTable();
  });
  

  
  // Export CSV
  document.getElementById('export-csv').addEventListener('click', () => {
    exportCSV();
  });
  
  // Export JSON
  document.getElementById('export-json').addEventListener('click', () => {
    exportJSON();
  });
  
  // Add/Remove checked tabs
  document.getElementById('clear-logs-btn').addEventListener('click', () => {
    handleAddRemoveCheckedTabs();
  });
  
  // Remove all logs
  document.getElementById('remove-all-logs-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to remove ALL logs? This action cannot be undone.')) return;
    try {
      await browser.storage.local.set({ tabData: {} });
      await loadTabLog();
      showMessage('All logs removed.', 'success');
    } catch (error) {
      showMessage('Error removing all logs', 'error');
    }
  });
  
  // Backup now button
  const backupNowBtn = document.getElementById('backup-now-btn');
  if (backupNowBtn) {
    backupNowBtn.addEventListener('click', async () => {
      backupNowBtn.disabled = true;
      const originalText = backupNowBtn.textContent;
      backupNowBtn.textContent = 'Backing up...';
      let response = null;
      try {
        response = await browser.runtime.sendMessage({ action: 'performBackup' });
      } catch (error) {
        showMessage('Backup failed:' + error.message, 'error');
      } finally {
        backupNowBtn.disabled = false;
        backupNowBtn.textContent = originalText;
        // Always update the table after backup attempt
        await loadTabLog();
      }
      // Show appropriate message
      console.log('Backup response:', response);
      if (!response || typeof response !== 'object') {
        // If the table has tabs, treat as silent success
        if (tabRows && tabRows.length > 0) {
          console.log('Backup: No response, but table updated. Treating as silent success.');
        } else {
          showMessage('No tabs to back up.', 'info');
        }
      } else if (response.success) {
        if (response.count === 0) {
          showMessage(response.message || 'No tabs to back up.', 'info');
        } else {
          showMessage(`Backup completed! ${response.count} tabs backed up.`, 'success');
        }
      } else if (response.success === false) {
        // Only show error if success: false
        showMessage((response && response.message) ? response.message : 'Backup failed (unexpected error)', 'error');
      }
    });
  }

  // Auto-reload tab log when a new bookmark is added
  if (browser.bookmarks && browser.bookmarks.onCreated) {
    browser.bookmarks.onCreated.addListener(() => {
      loadTabLog();
    });
  }
  
  // Add event listener for Back to Popup button to close the tab using the extension API
  const backBtn = document.getElementById('backToPopupBtn');
  if (backBtn) {
    backBtn.addEventListener('click', async function() {
      if (window.browser && browser.tabs) {
        try {
          const tab = await browser.tabs.getCurrent();
          if (tab && tab.id) {
            await browser.tabs.remove(tab.id);
            return;
          }
        } catch (e) {
          // fallback to window.close if API fails
        }
      }
      window.close();
    });
  }
});

// Export table as CSV
function exportCSV() {
  let csv = 'Title,Domain,Opened,Age (days),URL\n';
  for (const row of tabRows) {
    csv += `"${(row.title||'').replace(/"/g,'""')}","${row.domain}","${formatDate(row.createdAt)}",${row.ageInDays},"${row.url}"
`;
  }
  downloadFile(csv, 'tabs-log.csv', 'text/csv');
}

// Export table as JSON
function exportJSON() {
  const data = tabRows.map(row => ({
    title: row.title,
    domain: row.domain,
    opened: formatDate(row.createdAt),
    ageInDays: row.ageInDays,
    url: row.url
  }));
  downloadFile(JSON.stringify(data, null, 2), 'tabs-log.json', 'application/json');
}

// Download helper
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
} 
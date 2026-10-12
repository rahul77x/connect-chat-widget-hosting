/**
 * Main Application Logic & Amazon Connect Widget Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const chatLauncher = document.getElementById('chatLauncher');
  const chatWindow = document.getElementById('chatWindow');
  const iconChat = chatLauncher.querySelector('.icon-chat');
  const iconClose = chatLauncher.querySelector('.icon-close');
  const unreadBadge = document.getElementById('unreadBadge');
  const minimizeChatBtn = document.getElementById('minimizeChatBtn');
  const headerMenuBtn = document.getElementById('headerMenuBtn');
  const headerDropdownMenu = document.getElementById('headerDropdownMenu');
  
  const chatComposer = document.getElementById('chatComposer');
  const messageInput = document.getElementById('messageInput');
  const chatTranscript = document.getElementById('chatTranscript');
  const typingIndicator = document.getElementById('typingIndicator');
  const quickChipsWrapper = document.getElementById('quickChipsWrapper');

  // Customizer Drawer Elements
  const devToolbarToggle = document.getElementById('devToolbarToggle');
  const customizerPanel = document.getElementById('customizerPanel');
  const closePanelBtn = document.getElementById('closePanelBtn');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Styling inputs
  const brandPreset = document.getElementById('brandPreset');
  const primaryColor = document.getElementById('primaryColor');
  const primaryColorHex = document.getElementById('primaryColorHex');
  const launcherBgColor = document.getElementById('launcherBgColor');
  const launcherBgColorHex = document.getElementById('launcherBgColorHex');
  const customerBubbleColor = document.getElementById('customerBubbleColor');
  const customerBubbleColorHex = document.getElementById('customerBubbleColorHex');
  const agentBubbleColor = document.getElementById('agentBubbleColor');
  const agentBubbleColorHex = document.getElementById('agentBubbleColorHex');
  const botDisplayName = document.getElementById('botDisplayName');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const frameWidth = document.getElementById('frameWidth');
  const frameHeight = document.getElementById('frameHeight');
  const applyStylesBtn = document.getElementById('applyStylesBtn');
  const copySnippetConfigBtn = document.getElementById('copySnippetConfigBtn');

  // Display elements
  const displayBotTitle = document.getElementById('displayBotTitle');
  const displayBotSubtitle = document.getElementById('displayBotSubtitle');

  // Auth elements
  const testAuthTokenBtn = document.getElementById('testAuthTokenBtn');
  const testStartChatBtn = document.getElementById('testStartChatBtn');
  const authCustomerName = document.getElementById('authCustomerName');
  const authCustomerId = document.getElementById('authCustomerId');
  const authResultOutput = document.getElementById('authResultOutput');
  const authBanner = document.getElementById('authBanner');
  const authBannerText = document.getElementById('authBannerText');

  // Real Connect Elements
  const useLiveConnectToggle = document.getElementById('useLiveConnectToggle');
  const connectSnippetUrl = document.getElementById('connectSnippetUrl');
  const connectSnippetId = document.getElementById('connectSnippetId');
  const saveConnectConfigBtn = document.getElementById('saveConnectConfigBtn');

  let isChatOpen = false;

  // ==========================================================================
  // Chat Widget Open / Close / Minimize
  // ==========================================================================
  function toggleChat(openState) {
    isChatOpen = typeof openState === 'boolean' ? openState : !isChatOpen;
    
    if (isChatOpen) {
      chatWindow.classList.remove('hidden');
      iconChat.classList.add('hidden');
      iconClose.classList.remove('hidden');
      if (unreadBadge) unreadBadge.style.display = 'none';
      setTimeout(() => messageInput.focus(), 300);
      scrollToBottom();
    } else {
      chatWindow.classList.add('hidden');
      iconChat.classList.remove('hidden');
      iconClose.classList.add('hidden');
      headerDropdownMenu.classList.add('hidden');
    }
  }

  chatLauncher.addEventListener('click', () => toggleChat());
  minimizeChatBtn.addEventListener('click', () => toggleChat(false));

  // Header Dropdown Menu
  headerMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    headerDropdownMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!headerMenuBtn.contains(e.target) && !headerDropdownMenu.contains(e.target)) {
      headerDropdownMenu.classList.add('hidden');
    }
  });

  document.getElementById('menuClearChat').addEventListener('click', () => {
    headerDropdownMenu.classList.add('hidden');
    const messages = chatTranscript.querySelectorAll('.message-row:not(:first-child)');
    messages.forEach(m => m.remove());
    addSystemNotice('Conversation history cleared.');
  });

  document.getElementById('menuEndChat').addEventListener('click', () => {
    headerDropdownMenu.classList.add('hidden');
    addSystemNotice('Chat session ended. Thank you for contacting Bank Support.');
    messageInput.disabled = true;
    document.getElementById('sendBtn').disabled = true;
    setTimeout(() => {
      messageInput.disabled = false;
      document.getElementById('sendBtn').disabled = false;
      addSystemNotice('New session started.');
    }, 2500);
  });

  document.getElementById('menuCopyTranscript').addEventListener('click', () => {
    headerDropdownMenu.classList.add('hidden');
    const textLines = [];
    chatTranscript.querySelectorAll('.message-row').forEach(row => {
      const isAgent = row.classList.contains('agent-message');
      const text = row.querySelector('.message-bubble p')?.innerText || '';
      textLines.push(`[${isAgent ? 'Assistant' : 'Customer'}]: ${text}`);
    });
    navigator.clipboard.writeText(textLines.join('\n')).then(() => {
      alert('Transcript copied to clipboard!');
    }).catch(() => {
      alert('Could not copy transcript.');
    });
  });

  // ==========================================================================
  // Messaging & Mock AI Responses
  // ==========================================================================
  function scrollToBottom() {
    chatTranscript.scrollTop = chatTranscript.scrollHeight;
  }

  function addMessage(text, sender = 'customer') {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = `message-row ${sender === 'customer' ? 'customer-message' : 'agent-message'}`;

    const avatarText = sender === 'customer' ? 'You' : 'AI';
    const bubbleClass = sender === 'customer' ? 'customer-bubble' : 'agent-bubble';

    row.innerHTML = `
      <div class="message-avatar">
        <span>${avatarText}</span>
      </div>
      <div class="message-content-wrapper">
        <div class="message-bubble ${bubbleClass}">
          <p>${escapeHtml(text)}</p>
        </div>
        <span class="message-timestamp">${timeStr}</span>
      </div>
    `;

    // Insert before typing indicator
    chatTranscript.insertBefore(row, typingIndicator);
    scrollToBottom();
  }

  function addSystemNotice(text) {
    const div = document.createElement('div');
    div.className = 'transcript-date-divider';
    div.innerHTML = `<span>${escapeHtml(text)}</span>`;
    chatTranscript.insertBefore(div, typingIndicator);
    scrollToBottom();
  }

  function simulateAgentResponse(userText) {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();

    setTimeout(() => {
      typingIndicator.classList.add('hidden');
      const lower = userText.toLowerCase();
      let reply = "";

      if (lower.includes('balance')) {
        reply = "Your primary savings account (ending in **4210**) currently holds an available balance of ₹1,42,850.50.";
      } else if (lower.includes('fd') || lower.includes('interest') || lower.includes('rate')) {
        reply = "Our current Fixed Deposit (FD) interest rates are 7.25% p.a. for general citizens and 7.75% p.a. for senior citizens for tenures of 400 days.";
      } else if (lower.includes('loan')) {
        reply = "We offer Personal Loans starting at 10.25% p.a. with minimal documentation and instant pre-approval for existing account holders. Would you like to check your eligibility?";
      } else if (lower.includes('human') || lower.includes('agent') || lower.includes('executive')) {
        reply = "Connecting you with an Amazon Connect live customer service representative... Please hold while we route your contact.";
      } else {
        reply = `Thank you for your inquiry: "${userText}". As this is an Amazon Connect chatbot prototype, your request is being handled via Connect Lex / Bedrock integration. How else may I assist you?`;
      }

      addMessage(reply, 'agent');
    }, 1100);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  chatComposer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    
    addMessage(text, 'customer');
    messageInput.value = '';
    simulateAgentResponse(text);
  });

  // Quick Action Chips
  quickChipsWrapper.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip-btn')) {
      const query = e.target.getAttribute('data-query');
      addMessage(query, 'customer');
      simulateAgentResponse(query);
    }
  });

  // ==========================================================================
  // Dev Toolbar & Customizer Drawer
  // ==========================================================================
  devToolbarToggle.addEventListener('click', () => {
    customizerPanel.classList.toggle('hidden');
  });

  closePanelBtn.addEventListener('click', () => {
    customizerPanel.classList.add('hidden');
  });

  // Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  // Color picker sync with hex labels
  function syncColorPickers() {
    primaryColorHex.innerText = primaryColor.value;
    launcherBgColorHex.innerText = launcherBgColor.value;
    customerBubbleColorHex.innerText = customerBubbleColor.value;
    agentBubbleColorHex.innerText = agentBubbleColor.value;
  }

  [primaryColor, launcherBgColor, customerBubbleColor, agentBubbleColor].forEach(input => {
    input.addEventListener('input', () => {
      syncColorPickers();
      applyCurrentStyles();
    });
  });

  // Brand Presets
  const PRESETS = {
    'boi-blue': {
      primary: '#004085',
      launcher: '#004085',
      customerBubble: '#0056b3',
      agentBubble: '#f0f4f8'
    },
    'aws-squid': {
      primary: '#0073bb',
      launcher: '#07b62a',
      customerBubble: '#0073bb',
      agentBubble: '#e9ecef'
    },
    'emerald': {
      primary: '#0f766e',
      launcher: '#0f766e',
      customerBubble: '#0d9488',
      agentBubble: '#f0fdf4'
    },
    'indigo': {
      primary: '#4338ca',
      launcher: '#4f46e5',
      customerBubble: '#4338ca',
      agentBubble: '#eef2ff'
    },
    'dark-slate': {
      primary: '#1e293b',
      launcher: '#0f172a',
      customerBubble: '#334155',
      agentBubble: '#f1f5f9'
    }
  };

  brandPreset.addEventListener('change', (e) => {
    const selected = PRESETS[e.target.value];
    if (selected) {
      primaryColor.value = selected.primary;
      launcherBgColor.value = selected.launcher;
      customerBubbleColor.value = selected.customerBubble;
      agentBubbleColor.value = selected.agentBubble;
      syncColorPickers();
      applyCurrentStyles();
    }
  });

  function applyCurrentStyles() {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', primaryColor.value);
    root.style.setProperty('--launcher-bg', launcherBgColor.value);
    root.style.setProperty('--customer-bubble-bg', customerBubbleColor.value);
    root.style.setProperty('--agent-bubble-bg', agentBubbleColor.value);
    root.style.setProperty('--widget-width', `${frameWidth.value}px`);
    root.style.setProperty('--widget-height', `${frameHeight.value}px`);

    displayBotTitle.innerText = botDisplayName.value || 'Bank AI Virtual Assistant';
    displayBotSubtitle.innerHTML = `<span class="status-indicator"></span> ${headerSubtitle.value || 'Online'}`;

    // Update CONNECT_CONFIG object in memory
    if (window.CONNECT_CONFIG) {
      window.CONNECT_CONFIG.styles.openChat.backgroundColor = launcherBgColor.value;
      window.CONNECT_CONFIG.styles.closeChat.backgroundColor = launcherBgColor.value;
      window.CONNECT_CONFIG.customStyles.header.headerBackgroundColor = primaryColor.value;
      window.CONNECT_CONFIG.customStyles.transcript.customerChatBubbleColor = customerBubbleColor.value;
      window.CONNECT_CONFIG.customStyles.transcript.agentChatBubbleColor = agentBubbleColor.value;
      window.CONNECT_CONFIG.customStyles.global.frameWidth = `${frameWidth.value}px`;
      window.CONNECT_CONFIG.customStyles.global.frameHeight = `${frameHeight.value}px`;
      window.CONNECT_CONFIG.customStyles.footer.buttonBackgroundColor = primaryColor.value;
    }
  }

  applyStylesBtn.addEventListener('click', () => {
    applyCurrentStyles();
    alert('Custom styles applied to chat widget!');
  });

  copySnippetConfigBtn.addEventListener('click', () => {
    applyCurrentStyles();
    const code = generateConnectSnippetCode(window.CONNECT_CONFIG);
    navigator.clipboard.writeText(code).then(() => {
      alert('Amazon Connect embedding snippet copied to clipboard! You can paste it into your production HTML.');
    }).catch(err => {
      console.error(err);
      alert('Could not auto-copy. See browser console for snippet code.');
      console.log('--- AMAZON CONNECT EMBED CODE ---\n', code);
    });
  });

  // ==========================================================================
  // Local Authentication Handlers
  // ==========================================================================
  testAuthTokenBtn.addEventListener('click', async () => {
    authResultOutput.innerText = 'Calling local endpoint: POST /api/chat-auth ...';
    
    try {
      const payload = {
        customerName: authCustomerName.value || 'Rahul Sharma',
        customerId: authCustomerId.value || 'BOI-CUST-984210',
        accountType: 'Premium Savings'
      };

      const res = await fetch('/api/chat-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      authResultOutput.innerText = JSON.stringify(data, null, 2);

      if (data.success && data.jwtToken) {
        authBanner.classList.remove('hidden');
        authBannerText.innerHTML = `Authenticated: <strong>${escapeHtml(payload.customerName)}</strong> (${escapeHtml(payload.customerId)})`;
        addSystemNotice(`Authentication verified for ${payload.customerName}. Session JWT Token generated.`);
      }
    } catch (err) {
      authResultOutput.innerText = `Error contacting local auth server:\n${err.message}\n\nMake sure your local server is running (node server.js or python server.py)!`;
    }
  });

  testStartChatBtn.addEventListener('click', async () => {
    authResultOutput.innerText = 'Calling local proxy endpoint: POST /api/start-chat ...';

    try {
      const payload = {
        participantName: authCustomerName.value || 'Rahul Sharma',
        customerId: authCustomerId.value || 'BOI-CUST-984210'
      };

      const res = await fetch('/api/start-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      authResultOutput.innerText = JSON.stringify(data, null, 2);
    } catch (err) {
      authResultOutput.innerText = `Error calling /api/start-chat:\n${err.message}\n\nMake sure your local server is running (node server.js or python server.py)!`;
    }
  });

  // ==========================================================================
  // Live Amazon Connect Widget Initialization
  // ==========================================================================
  saveConnectConfigBtn.addEventListener('click', () => {
    const isLive = useLiveConnectToggle.checked;
    const snippetUrl = connectSnippetUrl.value.trim();
    const snippetId = connectSnippetId.value.trim();

    if (isLive && (!snippetUrl || !snippetId)) {
      alert('Please provide both the Amazon Connect Script CDN URL and Snippet ID to mount the live widget.');
      return;
    }

    window.CONNECT_CONFIG.useLiveWidget = isLive;
    window.CONNECT_CONFIG.snippetUrl = snippetUrl;
    window.CONNECT_CONFIG.snippetId = snippetId;

    if (isLive) {
      mountLiveAmazonConnectWidget();
    } else {
      alert('Saved! Interactive Prototype mode is currently active.');
    }
  });

  function mountLiveAmazonConnectWidget() {
    alert('Mounting live Amazon Connect script...\nPlease ensure http://localhost:3000 is whitelisted in your AWS Connect Approved Origins.');
    
    // Hide prototype widget
    document.getElementById('customChatWidget').style.display = 'none';

    // Inject official script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.text = generateConnectSnippetCode(window.CONNECT_CONFIG);
    document.getElementById('amazon-connect-container').appendChild(script);
  }

  // Check if real Amazon Connect script was enabled in index.html
  if (typeof ENABLE_LIVE_CONNECT_WIDGET !== 'undefined' && ENABLE_LIVE_CONNECT_WIDGET) {
    const customWidget = document.getElementById('customChatWidget');
    if (customWidget) customWidget.style.display = 'none';
    if (useLiveConnectToggle) useLiveConnectToggle.checked = true;
  }

  // Initial sync
  syncColorPickers();
  applyCurrentStyles();
});


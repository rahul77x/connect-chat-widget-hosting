/**
 * Amazon Connect Chat Widget Configuration
 * 
 * This file specifies the official styling and operational parameters passed
 * to the Amazon Connect Communications Widget (amazon-connect-chat-interface-client.js).
 */

window.CONNECT_CONFIG = {
  // =========================================================================
  // 🔹 CLIENT REPLACEMENT SETTINGS (UPDATE WHEN IN CLIENT WORKSPACE)
  // =========================================================================
  // Set useLiveWidget to true when ready to load the real AWS script:
  useLiveWidget: false,

  // Replace with the values provided in client's AWS Connect Console:
  // (AWS Console -> Amazon Connect -> Channels -> Chat widgets -> View Embed Code)
  snippetUrl: 'https://YOUR_CONNECT_INSTANCE.my.connect.aws/connectwidget/static/amazon-connect-chat-interface-client.js',
  snippetId: '12345678-1234-1234-1234-1234567890ab',

  // Supported Rich Messaging types (interactive messages, markdown, text)
  supportedMessagingContentTypes: [
    'text/plain',
    'text/markdown',
    'application/vnd.amazonaws.connect.message.interactive',
    'application/vnd.amazonaws.connect.message.interactive.response'
  ],

  // 1. Launcher Button Styles (passed via amazon_connect('styles', ...))
  styles: {
    iconType: 'CHAT', // 'CHAT' or 'MESSAGE'
    openChat: {
      color: '#ffffff',
      backgroundColor: '#004085' // Bank Blue
    },
    closeChat: {
      color: '#ffffff',
      backgroundColor: '#004085'
    }
  },

  // 2. Deep UI Theme Customizations (passed via amazon_connect('customStyles', ...))
  customStyles: {
    global: {
      frameWidth: '380px',
      frameHeight: '620px',
      textColor: '#172b4d',
      fontSize: '14px',
      typeface: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      headerHeight: '64px',
      footerHeight: '70px'
    },
    header: {
      headerTextColor: '#ffffff',
      headerBackgroundColor: '#004085'
    },
    transcript: {
      messageFontSize: '13.5px',
      messageTextColor: '#172b4d',
      widgetBackgroundColor: '#f8fafc',
      agentMessageTextColor: '#172b4d',
      systemMessageTextColor: '#6b778c',
      customerMessageTextColor: '#ffffff',
      agentChatBubbleColor: '#f0f4f8',
      systemChatBubbleColor: '#f1f3f5',
      customerChatBubbleColor: '#0056b3'
    },
    footer: {
      buttonFontSize: '14px',
      buttonTextColor: '#ffffff',
      buttonBackgroundColor: '#004085',
      footerBackgroundColor: '#ffffff'
    },
    composer: {
      fontSize: '13.5px'
    }
  },

  // 3. Functional / Feature Customization (passed via amazon_connect('customizationObject', ...))
  customizationObject: {
    header: {
      dropdown: true,       // Enables header dropdown (End Chat, Clear, etc.)
      dynamicHeader: true   // Updates header title based on agent name/status
    },
    transcript: {
      hideDisplayNames: false,
      eventNames: {
        customer: 'You',
        agent: 'Bank Support Assistant'
      }
    }
  },

  // 4. Local Authentication Configuration
  auth: {
    // Mode options:
    // - 'unauthenticated': Direct public chat without identity verification
    // - 'jwt': Authenticated customer session using signed JWT token
    // - 'proxy': Custom initiation via local /api/start-chat backend proxy
    mode: 'jwt',
    authEndpoint: '/api/chat-auth',
    startChatEndpoint: '/api/start-chat',
    customerDetails: {
      name: 'Rahul Sharma',
      customerId: 'BOI-CUST-984210',
      accountType: 'Premium Savings'
    }
  }
};

/**
 * Generates the complete Amazon Connect embedding snippet with all configured styles.
 * Useful for copying directly into production websites or CMS.
 */
function generateConnectSnippetCode(config) {
  const cfg = config || window.CONNECT_CONFIG;
  return `<!-- Amazon Connect Hosted Chat Widget -->
<script type="text/javascript">
(function(w, d, x, id){
  var s = d.createElement('script');
  s.src = '${cfg.snippetUrl}';
  s.async = 1;
  s.id = id;
  d.getElementsByTagName('head')[0].appendChild(s);
  w[x] = w[x] || function() { (w[x].ac = w[x].ac || []).push(arguments); };
})(window, document, 'amazon_connect', '${cfg.snippetId}');

// 1. Core Config
amazon_connect('snippetId', '${cfg.snippetId}');
amazon_connect('supportedMessagingContentTypes', ${JSON.stringify(cfg.supportedMessagingContentTypes, null, 2)});

// 2. Launcher Button Styles
amazon_connect('styles', ${JSON.stringify(cfg.styles, null, 2)});

// 3. Deep Theme Overrides
amazon_connect('customStyles', ${JSON.stringify(cfg.customStyles, null, 2)});

// 4. Feature Behavior
amazon_connect('customizationObject', ${JSON.stringify(cfg.customizationObject, null, 2)});

${cfg.auth.mode === 'jwt' ? `// 5. Authenticated Customer JWT Callback
amazon_connect('authenticate', function(callback) {
  fetch('${cfg.auth.authEndpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: '${cfg.auth.customerDetails.customerId}',
      customerName: '${cfg.auth.customerDetails.name}'
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.jwtToken) {
      callback(data.jwtToken);
    } else {
      console.error('No JWT token received', data);
    }
  })
  .catch(function(err) {
    console.error('Failed to authenticate chat session:', err);
  });
});` : '// 5. Unauthenticated Mode: No custom JWT callback needed'}
<\/script>`;
}


# Amazon Connect Chat Widget Prototype & Local Hosting Guide

This project is a static website and local authentication setup built to prototype, customize, and test the **Amazon Connect Chat Widget** embedded over a website interface mockup (`website-screenshot.png`).

---

## 🌟 Key Features

1. **Realistic Website Mockup Background**: Hosts `website-screenshot.png` as the background, allowing stakeholders to evaluate the chat widget in a real banking website context.
2. **Top-Right Environment Tag**: Displays the required blue box badge: `AI-Chatbot-Prototype-dev`.
3. **Interactive Front-End Customizer**:
   - Live color pickers for launcher button, header, customer chat bubble, and agent chat bubble.
   - Presets for Bank Blue, AWS Classic, Emerald, Indigo, and Dark Slate.
   - Configurable widget dimensions (`frameWidth`, `frameHeight`).
   - 1-click **"Copy Connect Config"** button to generate production-ready Amazon Connect snippet code.
4. **Local Workspace Authentication Server**:
   - Zero-dependency local Python server (`python server.py`).
   - Implements `/api/chat-auth` to issue signed JWT tokens for Amazon Connect Authenticated Chat.
   - Implements `/api/start-chat` proxy for AWS SDK `StartChatContactCommand`.
5. **Dual Modes**:
   - **Interactive Prototype Mode**: Fully testable chat window with banking responses, quick action chips, and typing indicator.
   - **Live Amazon Connect Mode**: Injects the official AWS Connect script (`amazon-connect-chat-interface-client.js`) on demand.

---

## 🚀 How to Run Locally

Run the zero-dependency Python server (standard library only, no `pip install` needed):

```bash
python server.py
```

Open your browser and visit:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📋 How to Connect in the Client Workspace (3 Steps)

When you take this project into the client workspace to test with their real Amazon Connect instance:

1. **Whitelist Localhost in Client AWS Connect**:
   * In AWS Console > Amazon Connect > Instance > **Approved origins** (or inside Chat Widget settings > **Approved domains**).
   * Add: `http://localhost:3000`
2. **Replace the Dummy Values**:
   * Open [`index.html`](./index.html#L363) (or [`amazon-connect-config.js`](./amazon-connect-config.js)):
   * Set `ENABLE_LIVE_CONNECT_WIDGET = true`.
   * Replace `DUMMY_CONNECT_CDN_URL` and `DUMMY_CONNECT_SNIPPET_ID` with the client's values.
   * *(Alternatively: you can also simply paste them in the browser UI under the "Live AWS Connect" tab in the slide-out panel).*
3. **Open the Website**:
   * The client's live Amazon Connect chat widget will mount immediately and begin the real chat contact flow!

---

## 🎨 Front-End Chat Widget Customization

The Amazon Connect Hosted Communications Widget is customized on the front end through three core API parameters configured in [`amazon-connect-config.js`](./amazon-connect-config.js):

### 1. Launcher Button Styles (`styles`)
Controls the floating open/close button on your website:
```javascript
amazon_connect('styles', {
  iconType: 'CHAT', // 'CHAT' or 'MESSAGE'
  openChat: {
    color: '#ffffff',
    backgroundColor: '#004085' // Bank Brand Blue
  },
  closeChat: {
    color: '#ffffff',
    backgroundColor: '#004085'
  }
});
```

### 2. Deep UI Theme Customization (`customStyles`)
Controls dimensions, headers, bubble colors, and typography inside the chat iframe:
```javascript
amazon_connect('customStyles', {
  global: {
    frameWidth: '380px',
    frameHeight: '620px',
    textColor: '#172b4d',
    fontSize: '14px',
    typeface: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
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
    customerMessageTextColor: '#ffffff',
    agentChatBubbleColor: '#f0f4f8',
    customerChatBubbleColor: '#0056b3'
  },
  footer: {
    buttonFontSize: '14px',
    buttonTextColor: '#ffffff',
    buttonBackgroundColor: '#004085',
    footerBackgroundColor: '#ffffff'
  }
});
```

### 3. Functional Features (`customizationObject`)
```javascript
amazon_connect('customizationObject', {
  header: {
    dropdown: true,       // Enables 3-dot dropdown (End Chat, Clear Chat)
    dynamicHeader: true   // Auto-updates header with agent name
  },
  transcript: {
    hideDisplayNames: false,
    eventNames: {
      customer: 'You',
      agent: 'Bank Support Assistant'
    }
  }
});
```

---

## 🔐 How Local Workspace Authentication Works

To initiate conversations from your local website (`http://localhost:3000`), there are three essential steps:

### Step 1: Whitelist `localhost` in AWS Connect (Mandatory Prerequisite)
Amazon Connect strictly blocks chat widget requests from non-approved origins.
1. Log in to the **AWS Management Console**.
2. Navigate to **Amazon Connect** > Click your Connect Instance.
3. In the left navigation menu, select **Approved origins** (or under *Channels > Chat widgets > Approved domains*).
4. Click **Add domain / origin** and enter:
   ```
   http://localhost:3000
   ```
5. Click **Add**.

---

### Step 2: Unauthenticated vs. Authenticated Chat

| Mode | Use Case | Auth Required? |
| :--- | :--- | :--- |
| **Unauthenticated** | Public bank inquiries, branch locator, general FAQs, loan rates | None. The widget connects directly via Connect's public widget API. |
| **Authenticated (JWT)** | Logged-in internet banking users, checking account balance, fund transfers | **Yes.** Requires an HS256/RS256 signed JWT with customer attributes. |

---

### Step 3: Authenticated Chat with JWT (`amazon_connect('authenticate')`)

When authentication is enabled in your Amazon Connect Chat Widget, the widget client script requests a valid JSON Web Token (JWT) before initiating the chat session.

#### 1. How the Front-End Calls the Local Server:
```javascript
amazon_connect('authenticate', function(callback) {
  // Call your local endpoint to obtain the signed JWT token
  fetch('/api/chat-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'BOI-CUST-984210',
      customerName: 'Rahul Sharma'
    })
  })
  .then(res => res.json())
  .then(data => {
    // Deliver the signed JWT to Amazon Connect
    callback(data.jwtToken);
  })
  .catch(err => {
    console.error('Failed to authenticate chat session:', err);
  });
});
```

#### 2. What the Local Server Generates:
The local server (`server.py`) generates a signed JWT payload:
```json
{
  "sub": "BOI-CUST-984210",
  "iat": 1718000000,
  "exp": 1718003600,
  "attributes": {
    "customerName": "Rahul Sharma",
    "customerId": "BOI-CUST-984210",
    "accountType": "Premium Savings",
    "authenticated": "true"
  }
}
```
When this JWT is passed to Amazon Connect:
- Amazon Connect verifies the signature using the **Customer Verification Key** configured in your instance.
- The `attributes` map automatically populates Contact Attributes in your **Amazon Connect Contact Flow** (e.g. `$.Attributes.customerId`, `$.Attributes.customerName`), enabling personalized bot routing and AWS Lex / Bedrock interactions!

---

### Step 4: Custom Initiation via Local AWS SDK Proxy (`StartChatContact`)

If building a custom chat client using **`amazon-connect-chatjs`** instead of the pre-built widget iframe:
- The browser should never store AWS IAM Access Keys.
- Your local Python server invokes `start_chat_contact` from AWS SDK (`boto3`):
```python
import boto3

client = boto3.client('connect', region_name='us-east-1')

response = client.start_chat_contact(
    InstanceId='YOUR-CONNECT-INSTANCE-ID',
    ContactFlowId='YOUR-CONTACT-FLOW-ID',
    ParticipantDetails={'DisplayName': 'Rahul Sharma'},
    Attributes={
        'customerId': 'BOI-CUST-984210',
        'authenticated': 'true'
    }
)
# Returns ContactId, ParticipantId, ParticipantToken to the frontend
```
- The local server returns `ParticipantToken` to the browser, which initializes `connect.ChatSession.create(...)`.

---

## 📁 Project Structure

```
├── index.html                  # Main static HTML page hosting the chat widget
├── styles.css                  # Custom styling: background, blue badge, chat widget overrides
├── app.js                      # Application logic, widget controller, prototype AI responses
├── amazon-connect-config.js    # Dedicated configuration for Amazon Connect (styles, customStyles)
├── server.py                   # Local development server with auth endpoints (Python)
├── README.md                   # Detailed setup, styling, and authentication guide
└── website-screenshot.png      # Bank website background mockup
```


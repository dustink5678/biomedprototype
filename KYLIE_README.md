# 🎯 BMed Prototype UI Architecture Guide

## Welcome to Kylie! 👋

This comprehensive guide will walk you through the BMed Prototype web application structure, focusing on the user interface components, interactions, and how everything connects. As a new team member working primarily with UI, this guide will help you understand the codebase architecture and how to navigate through the project files.

---

## 📁 Project Structure Overview

```
BMed Prototype/
├── client/                 # React Frontend Application
│   ├── public/            # Static assets
│   ├── src/              # Source code
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/       # Page components (routes)
│   │   ├── context/     # React context providers
│   │   ├── hooks/       # Custom React hooks
│   │   ├── services/    # API and Firebase services
│   │   ├── utils/       # Utility functions
│   │   └── config/      # Configuration files
│   └── package.json     # Client dependencies
├── server/               # Express.js Backend (minimal)
├── functions/           # Firebase Cloud Functions
└── firebase.json        # Firebase configuration
```

---

## 🎨 UI Architecture Overview

The BMed Prototype is a **Single Page Application (SPA)** built with React that provides a professional interface for recording and analyzing medical interviews. The UI follows a **component-based architecture** with clear separation of concerns.

### Core UI Principles:
- **Responsive Design**: Works on desktop and mobile devices
- **Professional Medical Theme**: Clean, accessible interface
- **Real-time Updates**: Live status indicators and progress bars
- **Intuitive Navigation**: Clear user flows and breadcrumbs

---

## 🔧 Key UI Components & Files

### 1. **Root Application** (`client/src/App.js`)
**Location**: `client/src/App.js`

This is the **entry point** of your React application. It defines:
- **Routing structure** using React Router
- **Authentication guards** (ProtectedRoute component)
- **Context providers** (Auth, Firebase, Socket)
- **Global layout** with navigation

```jsx
// Key components you should know:
<BrowserRouter>          // Enables routing
  <FirebaseProvider>     // Firebase services
    <AuthProvider>       // User authentication
      <SocketProvider>   // Real-time communication
        <Routes>         // Page routing
```

### 2. **Navigation Component** (`client/src/components/Navbar.js`)
**Location**: `client/src/components/Navbar.js`

The **top navigation bar** that appears on all pages:
- **Brand logo**: Links to dashboard
- **Navigation menu**: Dashboard, Recording, Sessions, Upload
- **User menu**: Shows user info and logout
- **Mobile responsive**: Hamburger menu on small screens

**Key Features:**
- Active page highlighting with underlines
- User profile dropdown
- Mobile-responsive burger menu

### 3. **Page Components** (`client/src/pages/`)
**Location**: `client/src/pages/`

These are the main **route destinations**:

#### **Login** (`Login.js`)
- **Purpose**: User authentication entry point
- **Features**: Google OAuth, simple login, anonymous access
- **Environment badges**: Shows dev/prod mode
- **Dynamic forms**: Changes based on auth mode

#### **Dashboard** (`Dashboard.js`)
- **Purpose**: Main landing page with overview
- **Features**:
  - Quick action cards (Recording, Sessions, Upload)
  - Recent sessions table
  - Session statistics
  - User profile section

#### **Recording** (`Recording.js`) ⭐ *Most Complex Page*
- **Purpose**: Live recording interface
- **Features**:
  - Session setup modal
  - Audio/video device selection
  - Real-time recording controls
  - Live transcription display
  - Progress indicators

#### **Sessions** (`Sessions.js`)
- **Purpose**: Session management and history
- **Features**:
  - Filterable sessions table
  - Sort options (date, title, status)
  - Search functionality
  - Session actions (view, record, delete)

#### **Upload** (`Upload.js`)
- **Purpose**: File upload interface
- **Features**:
  - Multi-file selection (video, audio, transcription)
  - Progress tracking
  - Session creation from uploads
  - Automatic NLP analysis

#### **Replay** (`Replay.js`)
- **Purpose**: Session playback and analysis
- **Features**:
  - Video/audio playback
  - Transcription display
  - Timeline controls
  - NLP results modal

### 4. **Reusable Components** (`client/src/components/`)

#### **LoadingSpinner** (`LoadingSpinner.js`)
- **Purpose**: Loading states throughout the app
- **Usage**: `import LoadingSpinner from '../components/LoadingSpinner'`
- **Props**: `text` (loading message)

#### **NLPResults** (`NLPResults.js`)
- **Purpose**: Display NLP analysis results
- **Features**: Modal popup with sentiment, topics, entities, etc.
- **Usage**: Only shown when NLP analysis is completed

#### **UserProfile** (`UserProfile.js`)
- **Purpose**: User information display
- **Features**: Shows user name, role, and department

### 5. **Context Providers** (`client/src/context/`)

#### **AuthContext** (`AuthContext.js`)
- **Purpose**: User authentication state management
- **Provides**:
  - `user` object (name, email, role, etc.)
  - `login()`, `logout()` functions
  - `loading` state for auth checks

#### **FirebaseContext** (`FirebaseContext.js`)
- **Purpose**: Firebase services access
- **Provides**:
  - Authentication methods (Google, simple, anonymous)
  - Firebase app instance
  - Error handling for auth

#### **SocketContext** (`SocketContext.js`)
- **Purpose**: Real-time communication (currently disabled)
- **Provides**: Socket.IO connection for live updates

### 6. **Custom Hooks** (`client/src/hooks/`)

#### **useAuthMode** (`useAuthMode.js`)
- **Purpose**: Development mode authentication switching
- **Returns**:
  - `authMode`: Current auth method (google/simple/anonymous)
  - `setAuthMode()`: Change auth method
  - `canChangeMode`: Whether switching is allowed

### 7. **Services** (`client/src/services/`)

#### **firebaseSessions.js**
- **Purpose**: Firebase Firestore operations for sessions
- **Key Functions**:
  - `createSession()`: Create new session
  - `listSessions()`: Get user's sessions
  - `startSession()`, `stopSession()`: Recording controls
  - `uploadSessionFile()`: File uploads
  - `uploadTranscriptionText()`: Store transcription content

### 8. **Utilities** (`client/src/utils/`)

#### **nlpAnalysis.js**
- **Purpose**: Client-side NLP processing
- **Functions**:
  - `analyzeText()`: Perform sentiment, topic, entity analysis
  - Returns structured analysis results

### 9. **Configuration** (`client/src/config/`)

#### **auth.js**
- **Purpose**: Authentication configuration
- **Defines**:
  - `AUTH_MODES`: Available auth methods
  - `getAuthMode()`: Current auth mode based on environment
  - `getAuthMethodConfig()`: UI config for each auth method

---

## 🎯 UI Interaction Flows

### **1. Application Startup Flow**
```
User visits site
    ↓
App.js loads
    ↓
Firebase initializes
    ↓
AuthContext checks authentication
    ↓
If not authenticated → Login page
If authenticated → Dashboard page
```

### **2. Recording Session Flow**
```
Dashboard → Click "Start New Recording"
    ↓
Recording page loads
    ↓
Session Setup Modal opens
    ↓
User fills session details
    ↓
Device selection appears
    ↓
Click "Start Recording"
    ↓
Recording begins with live transcription
    ↓
Click "Stop Recording"
    ↓
NLP analysis runs automatically
    ↓
Session appears in Dashboard and Sessions
```

### **3. Upload Session Flow**
```
Dashboard → Click "Upload Files"
    ↓
Upload page loads
    ↓
User selects files (video/audio/transcription)
    ↓
Session details form
    ↓
Upload begins with progress tracking
    ↓
NLP analysis runs automatically
    ↓
Success message with session link
```

### **4. Session Management Flow**
```
Dashboard/Sessions → Click session row
    ↓
View session details
    ↓
Click "View" → Replay page
    ↓
Or Click "Record" → Continue recording
    ↓
Or Click "Delete" → Remove session
```

---

## 🎨 UI Styling & Theming

### **CSS Architecture**
- **Location**: `client/src/index.css` (global styles)
- **Location**: `client/src/App.css` (component styles)
- **Variables**: CSS custom properties for consistent theming
- **Responsive**: Mobile-first responsive design

### **Key CSS Classes**

#### **Layout Classes**
```css
.container        /* Main content wrapper */
.page-header      /* Page title sections */
.card             /* Content containers */
.dashboard-grid   /* Grid layouts */
```

#### **Component Classes**
```css
.btn              /* Button base styles */
.btn-primary      /* Primary action buttons */
.btn-success      /* Success state buttons */
.btn-danger       /* Delete/destructive buttons */
.form-control     /* Input fields */
```

#### **Status Classes**
```css
.badge           /* Status indicators */
.badge-success   /* Green badges */
.badge-warning   /* Yellow badges */
.badge-danger    /* Red badges */
```

### **Color Scheme**
- **Primary**: Blue (#007bff)
- **Success**: Green (#28a745)
- **Danger**: Red (#dc3545)
- **Warning**: Yellow/Orange (#ffc107)
- **Secondary**: Gray (#6c757d)

---

## 🔄 State Management & Data Flow

### **1. Authentication State**
```jsx
// Provided by AuthContext
const { user, loading, login, logout } = useAuth();

// User object contains:
// - uid: Firebase user ID
// - email: User email
// - displayName: Full name
// - role: User role (admin, agent, etc.)
// - department: User department
```

### **2. Session Data Structure**
```javascript
// Session object structure
{
  id: "session-uuid",
  title: "Interview Title",
  agentName: "Agent Name",
  intervieweeName: "Interviewee Name",
  status: "completed", // created, recording, completed, paused
  createdAt: "2024-01-01T00:00:00Z",
  startTime: "2024-01-01T00:01:00Z",
  endTime: "2024-01-01T00:30:00Z",
  duration: 1800000, // milliseconds
  transcription: "Full transcription text...",
  nlpStatus: "completed", // processing, completed, failed
  nlpAnalysis: { /* NLP results */ },
  files: {
    videoUrl: "firebase-url",
    audioUrl: "firebase-url",
    transcriptionUrl: "firebase-url"
  }
}
```

### **3. Component Communication**

#### **Props Flow**
```jsx
// Parent to Child
<Dashboard user={user} sessions={recentSessions} />

// Child to Parent (callbacks)
<SessionTable sessions={sessions} onDelete={handleDelete} />
```

#### **Context Flow**
```jsx
// Consuming context
const { user } = useAuth();
const { signInWithGoogle } = useFirebase();
```

---

## 📱 Responsive Design

### **Breakpoint Strategy**
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

### **Responsive Classes**
```css
/* Mobile-first approach */
@media (max-width: 768px) {
  .navbar-menu { display: none; }
  .dashboard-grid { grid-template-columns: 1fr; }
}
```

### **Mobile Navigation**
- Hamburger menu for navigation
- Stacked layouts on small screens
- Touch-friendly button sizes
- Optimized forms for mobile input

---

## 🔍 How to Navigate the Codebase

### **Starting Points for Exploration**

1. **Begin with App.js**: Understand the overall structure
2. **Explore pages/**: Each page represents a major feature
3. **Check components/**: Reusable UI elements
4. **Review context/**: State management patterns
5. **Examine services/**: Data layer interactions

### **Key Files to Study**

#### **For Authentication Flow:**
- `src/pages/Login.js` - Login interface
- `src/context/AuthContext.js` - Auth state
- `src/context/FirebaseContext.js` - Firebase auth methods

#### **For Session Management:**
- `src/pages/Dashboard.js` - Main overview
- `src/pages/Sessions.js` - Session listing
- `src/services/firebaseSessions.js` - Data operations

#### **For Recording Features:**
- `src/pages/Recording.js` - Live recording (most complex)
- `src/utils/nlpAnalysis.js` - NLP processing
- `src/components/NLPResults.js` - Results display

### **Development Workflow**

1. **Start the app**: `npm run dev`
2. **Make changes**: Edit components in `src/`
3. **See updates**: Hot reload shows changes immediately
4. **Test features**: Navigate through the UI flows
5. **Check console**: Debug information in browser dev tools

---

## 🎯 Common UI Patterns

### **1. Loading States**
```jsx
if (loading) {
  return <LoadingSpinner text="Loading sessions..." />;
}
```

### **2. Error Handling**
```jsx
if (error) {
  return (
    <div className="error-container">
      <div className="error-message">{error}</div>
      <button onClick={retryFunction}>Retry</button>
    </div>
  );
}
```

### **3. Conditional Rendering**
```jsx
{user?.role === 'admin' && (
  <AdminButton />
)}
```

### **4. Form Handling**
```jsx
const [formData, setFormData] = useState({
  title: '',
  description: ''
});

const handleSubmit = async (e) => {
  e.preventDefault();
  // Submit logic
};
```

---

## 🚀 Getting Started as a New Developer

### **1. Environment Setup**
```bash
# Clone the repository
git clone <repository-url>
cd bmed-prototype

# Install dependencies
npm install
cd client && npm install
cd ../server && npm install
cd ../functions && npm install

# Start development
npm run dev
```

### **2. Understanding the Flow**
1. **Login page**: Authentication entry point
2. **Dashboard**: Main navigation hub
3. **Recording**: Core functionality
4. **Sessions**: Data management
5. **Upload**: File processing

### **3. Key Concepts to Learn**
- **React Hooks**: useState, useEffect, useContext
- **Firebase**: Authentication, Firestore, Storage
- **React Router**: Navigation between pages
- **Context API**: State management across components

### **4. Development Best Practices**
- **Component naming**: PascalCase (e.g., `UserProfile.js`)
- **File organization**: Group related files in folders
- **State management**: Use context for global state
- **Error handling**: Always handle loading and error states

---

## 📞 Questions & Support

As you explore the codebase, here are some helpful tips:

1. **Start with the Dashboard**: It's the simplest page to understand
2. **Follow the data flow**: See how props and context move through components
3. **Check the browser console**: Lots of debug information during development
4. **Look at existing patterns**: The codebase follows consistent React patterns
5. **Ask questions**: Don't hesitate to ask about confusing parts!

This guide should give you a solid foundation to understand and contribute to the BMed Prototype UI. Happy coding! 🎨✨

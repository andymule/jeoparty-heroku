import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';

// Enable more verbose debugging only if specifically requested
const ENABLE_DEBUG = process.env.REACT_APP_DEBUG_SOCKETS === 'true';

// Helper for conditional logging
const debugLog = (message, ...args) => {
  if (ENABLE_DEBUG) {
    console.log(message, ...args);
  }
};

// Determine the server URL based on environment
const SERVER_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin  // In production, use same origin
  : 'http://localhost:5005'; // In development, use localhost

// Only log this during development for debugging
if (process.env.NODE_ENV !== 'production') {
  debugLog('Socket context initializing with server URL:', SERVER_URL);
}

// Initialize Socket.io connection with improved options
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 30000, // Increased timeout for slower connections
  transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
  upgrade: true,
  rememberUpgrade: true,
  path: '/socket.io',
  forceNew: false,
  pingInterval: 10000, // Send a ping every 10s
  pingTimeout: 8000,   // Consider connection closed if no pong within 8s
});

// Custom manager to handle socket disconnect issues
let disconnectTimeoutId = null;
let autoReconnectTimeoutId = null;

// Filter common transport close issues
const isTransportError = (reason) => {
  return reason === 'transport close' || 
         reason === 'transport error' || 
         reason === 'ping timeout';
};

// Add detailed error handling - only in debug mode
socket.io.on("error", (error) => {
  if (ENABLE_DEBUG) {
    console.error("Socket.io manager error:", error);
  }
});

socket.io.on("reconnect_attempt", (attempt) => {
  if (ENABLE_DEBUG) {
    debugLog(`Socket.io reconnect attempt ${attempt}`);
  }
});

// Add default listeners for debugging
socket.on('connect', () => {
  if (ENABLE_DEBUG) {
    debugLog('Socket connected with ID:', socket.id);
  }
  
  // Clear any pending reconnection timeouts
  if (disconnectTimeoutId) {
    clearTimeout(disconnectTimeoutId);
    disconnectTimeoutId = null;
  }
  
  if (autoReconnectTimeoutId) {
    clearTimeout(autoReconnectTimeoutId);
    autoReconnectTimeoutId = null;
  }
});

socket.on('connect_error', (error) => {
  if (ENABLE_DEBUG) {
    console.error('Socket connection error:', error);
  }
  // Try to reconnect using polling if websocket fails
  if (socket.io.opts.transports[0] === 'websocket') {
    if (ENABLE_DEBUG) {
      debugLog('Connection failed with websocket, trying polling...');
    }
    socket.io.opts.transports = ['polling', 'websocket'];
  }
});

socket.on('reconnect', (attemptNumber) => {
  if (ENABLE_DEBUG) {
    debugLog('Socket reconnected after', attemptNumber, 'attempts');
  }
});

socket.on('reconnect_error', (error) => {
  if (ENABLE_DEBUG) {
    console.error('Socket reconnection error:', error);
  }
});

socket.on('disconnect', (reason) => {
  // Only show disconnection messages for permanent issues in debug mode
  if (!isTransportError(reason) && ENABLE_DEBUG) {
    debugLog('Socket disconnected:', reason);
  }
  
  // Attempt to reconnect for transport issues
  if (isTransportError(reason) && !autoReconnectTimeoutId) {
    autoReconnectTimeoutId = setTimeout(() => {
      if (ENABLE_DEBUG) {
        debugLog('Attempting automatic reconnection after transport issue...');
      }
      if (!socket.connected) {
        socket.connect();
      }
      autoReconnectTimeoutId = null;
    }, 1500);
  }
});

// Expose connection status
export const SocketStatus = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

// Create contexts
export const SocketContext = createContext(null);
export const SocketStatusContext = createContext(null);

// Socket Provider Component
export const SocketProvider = ({ children, value }) => {
  const [status, setStatus] = useState(
    socket.connected ? SocketStatus.CONNECTED : SocketStatus.CONNECTING
  );
  const [error, setError] = useState(null);
  const [hasConnectedBefore, setHasConnectedBefore] = useState(false);
  
  // Reconnect function for manual reconnection
  const reconnect = useCallback(() => {
    if (!socket.connected) {
      if (ENABLE_DEBUG) debugLog('Manually reconnecting to server...');
      socket.connect();
    }
  }, []);

  useEffect(() => {
    let statusTimeoutId = null;
    
    const onConnect = () => {
      if (ENABLE_DEBUG) debugLog('SocketProvider: Connected to server');
      setStatus(SocketStatus.CONNECTED);
      setError(null);
      setHasConnectedBefore(true);
    };

    const onDisconnect = (reason) => {
      // Only update UI status for non-transport issues or if disconnected for too long
      if (!isTransportError(reason)) {
        if (ENABLE_DEBUG) debugLog('SocketProvider: Disconnected from server:', reason);
        setStatus(SocketStatus.DISCONNECTED);
      } else {
        // For transport issues, only show disconnected if it persists
        if (disconnectTimeoutId) {
          clearTimeout(disconnectTimeoutId);
        }
        
        disconnectTimeoutId = setTimeout(() => {
          if (ENABLE_DEBUG) debugLog('SocketProvider: Disconnect persisted, updating status');
          setStatus(SocketStatus.DISCONNECTED);
          disconnectTimeoutId = null;
        }, 3000); // Wait 3 seconds before showing disconnected status
      }
    };

    const onConnectError = (err) => {
      if (ENABLE_DEBUG) console.error('SocketProvider: Connection error:', err);
      setStatus(SocketStatus.ERROR);
      setError(err.message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // Cleanup on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      
      if (disconnectTimeoutId) {
        clearTimeout(disconnectTimeoutId);
      }
      
      if (statusTimeoutId) {
        clearTimeout(statusTimeoutId);
      }
      
      if (autoReconnectTimeoutId) {
        clearTimeout(autoReconnectTimeoutId);
      }
    };
  }, []);

  return (
    <SocketStatusContext.Provider value={{ status, error, hasConnectedBefore, reconnect }}>
      <SocketContext.Provider value={value}>
        {children}
      </SocketContext.Provider>
    </SocketStatusContext.Provider>
  );
};

// Custom hook to use the socket
export const useSocket = () => {
  const socket = useContext(SocketContext);
  if (!socket) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return socket;
};

// Custom hook to use the socket status
export const useSocketStatus = () => {
  const socketStatus = useContext(SocketStatusContext);
  if (!socketStatus) {
    throw new Error('useSocketStatus must be used within a SocketProvider');
  }
  return socketStatus;
}; 
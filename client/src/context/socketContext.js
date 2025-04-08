import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

// Determine the server URL based on environment
const SERVER_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin  // In production, use same origin
  : 'http://localhost:5001'; // In development, use localhost

console.log('Socket context initializing with server URL:', SERVER_URL);

// Initialize Socket.io connection
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 20000, // Increased timeout for slower connections
  transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
});

// Add detailed error handling
socket.io.on("error", (error) => {
  console.error("Socket.io manager error:", error);
});

socket.io.on("reconnect_attempt", (attempt) => {
  console.log(`Socket.io reconnect attempt ${attempt}`);
});

// Add default listeners for debugging
socket.on('connect', () => {
  console.log('Socket connected with ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Socket reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_error', (error) => {
  console.error('Socket reconnection error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);
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

  useEffect(() => {
    const onConnect = () => {
      console.log('SocketProvider: Connected to server');
      setStatus(SocketStatus.CONNECTED);
      setError(null);
    };

    const onDisconnect = (reason) => {
      console.log('SocketProvider: Disconnected from server:', reason);
      setStatus(SocketStatus.DISCONNECTED);
    };

    const onConnectError = (err) => {
      console.error('SocketProvider: Connection error:', err);
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
    };
  }, []);

  return (
    <SocketStatusContext.Provider value={{ status, error }}>
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
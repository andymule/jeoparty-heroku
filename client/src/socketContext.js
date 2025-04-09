import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

// Create a socket context
const SocketContext = createContext();

// Export a custom hook to use the socket
export const useSocket = () => {
  return useContext(SocketContext);
};

// Socket provider component
export const SocketProvider = ({ children, value }) => {
  const [socket, setSocket] = useState(value);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    if (!socket) {
      console.log('Socket context initializing with default configuration');
      
      // Initialize socket connection if not provided
      const socketUrl = process.env.REACT_APP_SOCKET_URL || window.location.origin;
      console.log('Socket context initializing with server URL:', socketUrl);
      
      const newSocket = io(socketUrl, {
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000, // Increased timeout
        transports: ['websocket', 'polling'],
        forceNew: true,
        autoConnect: true
      });
      
      setSocket(newSocket);
    }

    // Handle socket connection events
    const onConnect = () => {
      console.log('SocketProvider: Connected to server');
      setIsConnected(true);
      setLastError(null);
    };

    const onDisconnect = (reason) => {
      console.log('SocketProvider: Disconnected from server:', reason);
      setIsConnected(false);
      setLastError(`Disconnected: ${reason}`);
      
      // Handle transport close more gracefully
      if (reason === 'transport close' || reason === 'transport error') {
        console.log('Transport issue detected, manually reconnecting in 2 seconds...');
        setTimeout(() => {
          if (socket && !socket.connected) {
            console.log('Attempting manual reconnection...');
            socket.connect();
          }
        }, 2000);
      }
    };

    const onError = (error) => {
      console.error('SocketProvider: Socket error:', error);
      setLastError(error);
    };

    const onConnectError = (error) => {
      console.error('SocketProvider: Connect error:', error.message);
      setConnectionAttempts(prev => prev + 1);
      setLastError(`Connection error: ${error.message}`);
    };

    const onReconnect = (attemptNumber) => {
      console.log(`SocketProvider: Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
    };

    const onReconnectAttempt = (attemptNumber) => {
      console.log(`SocketProvider: Reconnect attempt ${attemptNumber}`);
      setConnectionAttempts(attemptNumber);
    };

    const onReconnectError = (error) => {
      console.error('SocketProvider: Reconnect error:', error);
      setLastError(`Reconnection error: ${error.message}`);
    };

    const onReconnectFailed = () => {
      console.error('SocketProvider: Reconnect failed after all attempts');
      setLastError('Reconnection failed after multiple attempts');
      
      // Try one more manual reconnection after a delay
      setTimeout(() => {
        if (socket && !socket.connected) {
          console.log('Attempting final manual reconnection after failure...');
          socket.connect();
        }
      }, 5000);
    };

    if (socket) {
      // Set up socket event listeners
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('error', onError);
      socket.on('connect_error', onConnectError);
      socket.io.on('reconnect', onReconnect);
      socket.io.on('reconnect_attempt', onReconnectAttempt);
      socket.io.on('reconnect_error', onReconnectError);
      socket.io.on('reconnect_failed', onReconnectFailed);
    }

    // Clean up event listeners
    return () => {
      if (socket) {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('error', onError);
        socket.off('connect_error', onConnectError);
        socket.io.off('reconnect', onReconnect);
        socket.io.off('reconnect_attempt', onReconnectAttempt);
        socket.io.off('reconnect_error', onReconnectError);
        socket.io.off('reconnect_failed', onReconnectFailed);
      }
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}; 
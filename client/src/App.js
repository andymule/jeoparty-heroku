import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { isMobile } from './utils/deviceDetection';
import { socket, SocketProvider, SocketStatus, useSocketStatus } from './context/socketContext';

// Components
import Home from './pages/Home';
import GameHost from './pages/GameHost';
import GamePlayer from './pages/GamePlayer';
import NotFound from './pages/NotFound';

const AppContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const ConnectionStatus = styled.div`
  position: fixed;
  bottom: 10px;
  right: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: white;
  background-color: ${({ $status }) => 
    $status === SocketStatus.CONNECTED ? 'green' : 
    $status === SocketStatus.CONNECTING ? 'orange' : 
    $status === SocketStatus.DISCONNECTED ? 'red' : 
    'darkred'};
  opacity: 0.8;
  z-index: 1000;
`;

const ConnectionMessage = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px;
  background-color: ${({ $isError }) => $isError ? '#f44336' : '#ff9800'};
  color: white;
  text-align: center;
  font-weight: bold;
  z-index: 1000;
  animation: slideDown 0.3s ease-in-out;
  
  @keyframes slideDown {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
  }
`;

// Socket status monitor component
const SocketMonitor = () => {
  const { status, error, hasConnectedBefore, reconnect } = useSocketStatus();
  const [showMessage, setShowMessage] = useState(false);
  
  // Only show full error message temporarily after we've connected at least once
  useEffect(() => {
    // Only show disconnection messages if we had previously connected
    if ((status === SocketStatus.DISCONNECTED || status === SocketStatus.ERROR) && hasConnectedBefore) {
      setShowMessage(true);
      // Hide the message after 5 seconds to be less intrusive
      const timer = setTimeout(() => {
        setShowMessage(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, hasConnectedBefore]);
  
  // Always show the status indicator if we've connected at least once
  const statusIndicator = hasConnectedBefore ? (
    <ConnectionStatus $status={status}>
      {status === SocketStatus.CONNECTED ? 'Connected' : 
       status === SocketStatus.CONNECTING ? 'Connecting...' : 
       status === SocketStatus.DISCONNECTED ? 'Disconnected' : 'Error'}
    </ConnectionStatus>
  ) : null;
  
  // Only show the error message banner if showMessage is true
  if (showMessage) {
    if (status === SocketStatus.DISCONNECTED) {
      return (
        <>
          <ConnectionMessage $isError={false}>
            Disconnected from server. Attempting to reconnect...
            <button 
              onClick={reconnect} 
              style={{marginLeft: '10px', padding: '2px 8px', cursor: 'pointer'}}
            >
              Reconnect Now
            </button>
          </ConnectionMessage>
          {statusIndicator}
        </>
      );
    }
    
    if (status === SocketStatus.ERROR) {
      return (
        <>
          <ConnectionMessage $isError={true}>
            Connection error: {error || 'Failed to connect to server'}
            <button 
              onClick={reconnect} 
              style={{marginLeft: '10px', padding: '2px 8px', cursor: 'pointer'}}
            >
              Retry
            </button>
          </ConnectionMessage>
          {statusIndicator}
        </>
      );
    }
  }
  
  return statusIndicator;
};

const App = () => {
  const [deviceType, setDeviceType] = useState(null);
  
  useEffect(() => {
    // Detect device type
    setDeviceType(isMobile() ? 'mobile' : 'desktop');
    
    // Log socket.io connection status - but only when needed
    const connectHandler = () => {
      // Only log connection messages during development if specifically requested
      if (process.env.NODE_ENV !== 'production' && process.env.REACT_APP_DEBUG_SOCKETS === 'true') {
        console.log('Connected to server with ID:', socket.id);
      }
    };
    
    const disconnectHandler = () => {
      // Completely suppress disconnect messages to avoid console noise
      // These are already handled by the SocketMonitor component
    };
    
    socket.on('connect', connectHandler);
    socket.on('disconnect', disconnectHandler);
    
    return () => {
      socket.off('connect', connectHandler);
      socket.off('disconnect', disconnectHandler);
    };
  }, []);
  
  if (deviceType === null) {
    // Loading state while detecting device
    return <div>Loading...</div>;
  }
  
  return (
    <SocketProvider value={socket}>
      <Router>
        <AppContainer>
          <SocketMonitor />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route 
              path="/game/host/:roomCode" 
              element={<GameHost />} 
            />
            <Route 
              path="/game/player/:roomCode" 
              element={<GamePlayer />} 
            />
            {/* Legacy routes for backward compatibility */}
            <Route 
              path="/host/:roomCode" 
              element={<Navigate to={window.location.pathname.replace('/host/', '/game/host/')} />} 
            />
            <Route 
              path="/play/:roomCode" 
              element={<Navigate to={window.location.pathname.replace('/play/', '/game/player/')} />} 
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppContainer>
      </Router>
    </SocketProvider>
  );
};

export default App; 
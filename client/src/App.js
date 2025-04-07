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
  background-color: #f44336;
  color: white;
  text-align: center;
  font-weight: bold;
  z-index: 1000;
`;

// Socket status monitor component
const SocketMonitor = () => {
  const { status, error } = useSocketStatus();
  
  if (status === SocketStatus.CONNECTED) {
    return <ConnectionStatus $status={status}>Connected</ConnectionStatus>;
  }
  
  if (status === SocketStatus.CONNECTING) {
    return <ConnectionStatus $status={status}>Connecting...</ConnectionStatus>;
  }
  
  if (status === SocketStatus.DISCONNECTED) {
    return (
      <>
        <ConnectionMessage>
          Disconnected from server. Attempting to reconnect...
        </ConnectionMessage>
        <ConnectionStatus $status={status}>Disconnected</ConnectionStatus>
      </>
    );
  }
  
  if (status === SocketStatus.ERROR) {
    return (
      <>
        <ConnectionMessage>
          Connection error: {error || 'Failed to connect to server'}
        </ConnectionMessage>
        <ConnectionStatus $status={status}>Error</ConnectionStatus>
      </>
    );
  }
  
  return null;
};

const App = () => {
  const [deviceType, setDeviceType] = useState(null);
  
  useEffect(() => {
    // Detect device type
    setDeviceType(isMobile() ? 'mobile' : 'desktop');
    
    // Log socket.io connection status
    socket.on('connect', () => {
      console.log('Connected to server with ID:', socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
    
    return () => {
      socket.off('connect');
      socket.off('disconnect');
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
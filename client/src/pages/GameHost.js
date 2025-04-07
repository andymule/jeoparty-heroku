import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import io from 'socket.io-client';
import JeopardyBoard from '../components/JeopardyBoard';
import PlayerList from '../components/PlayerList';

const slideDown = keyframes`
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const GameHostContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background-color: var(--background);
  color: var(--text);
  padding: 10px;
  overflow: hidden;
`;

const GameHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  margin-bottom: 10px;
`;

const RoomCode = styled.div`
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-value);
  padding: 5px 10px;
  border-radius: 4px;
  font-weight: bold;
  display: flex;
  align-items: center;
  font-size: 1.2rem;
`;

const MainContent = styled.div`
  display: flex;
  flex: 1;
  gap: 15px;
`;

const BoardWrapper = styled.div`
  flex: 3;
  height: 100%;
  position: relative;
`;

const SidePanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 10px;
  max-width: 300px;
`;

const QuestionDisplay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-value);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  text-align: center;
  font-size: 2.5rem;
  animation: ${slideDown} 0.3s ease;
  z-index: 10;
  border: ${props => props.$canBuzzIn ? '2px dashed var(--jeopardy-selected)' : 'none'};
`;

const AnswerDisplay = styled.div`
  margin-top: 20px;
  font-size: 1.8rem;
  color: #fff;
  opacity: ${props => props.$revealed ? 1 : 0};
  transition: opacity 0.3s ease;
`;

const PlayerAnswer = styled.div`
  position: absolute;
  bottom: 20px;
  left: 0;
  width: 100%;
  text-align: center;
  font-size: 1.8rem;
  color: ${props => props.$correct === true ? '#4caf50' : props.$correct === false ? '#f44336' : '#fff'};
  background-color: rgba(0, 0, 0, 0.7);
  padding: 10px;
`;

const Button = styled.button`
  background-color: var(--jeopardy-value);
  color: var(--jeopardy-board);
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 20px;
  
  &:hover {
    background-color: var(--jeopardy-selected);
  }
  
  &:disabled {
    background-color: #555;
    cursor: default;
  }
`;

const HostControls = styled.div`
  margin-top: 20px;
  display: flex;
  gap: 10px;
  flex-direction: column;
  align-items: center;
`;

const SelectingPlayerInfo = styled.div`
  background-color: var(--jeopardy-selected);
  color: var(--jeopardy-board);
  padding: 10px;
  border-radius: 4px;
  font-weight: bold;
  margin-top: 10px;
  text-align: center;
  animation: ${pulse} 2s infinite ease-in-out;
`;

const StatusMessage = styled.div`
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px;
  border-radius: 4px;
  text-align: center;
  margin-bottom: 15px;
`;

const TimerBar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 10px;
  background-color: var(--jeopardy-value);
  width: ${props => props.$progress}%;
  transition: width ${props => props.$running ? '0.1s' : '0s'} linear;
`;

const GameHost = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [board, setBoard] = useState({});
  const [gameState, setGameState] = useState('waiting');
  const [showQuestion, setShowQuestion] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [buzzedPlayer, setBuzzedPlayer] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState(null);
  const [selectingPlayer, setSelectingPlayer] = useState(null);
  const [error, setError] = useState(null);
  const [timerProgress, setTimerProgress] = useState(100);
  const [timerRunning, setTimerRunning] = useState(false);
  const socketRef = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const buzzerSound = useRef(null);
  const [canBuzzIn, setCanBuzzIn] = useState(false);
  const timerRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Initialize the buzzer sound
  useEffect(() => {
    buzzerSound.current = new Audio('/sounds/ba-ding.mp3');
    return () => {
      if (buzzerSound.current) {
        buzzerSound.current.pause();
        buzzerSound.current.src = '';
      }
    };
  }, []);

  // Read the question aloud and play the sound after a delay
  useEffect(() => {
    if (currentQuestion && showQuestion) {
      // Cancel any ongoing speech
      speechSynthesis.current.cancel();
      
      // Create a new speech utterance for the question
      const utterance = new SpeechSynthesisUtterance(currentQuestion.text);
      utterance.rate = 0.9; // Slightly slower
      utterance.pitch = 1;
      
      // When speech ends, enable buzzing
      utterance.onend = () => {
        console.log('Speech ended, enabling buzzing');
        setCanBuzzIn(true);
        // Play the buzzer sound
        if (buzzerSound.current) {
          buzzerSound.current.play().catch(e => console.log('Error playing sound:', e));
        }
        
        // Notify server that reading is complete and players can buzz in
        if (socket && socket.connected) {
          socket.emit('hostFinishedReading', roomCode);
        }
      };
      
      // Start speaking after a short delay
      setTimeout(() => {
        speechSynthesis.current.speak(utterance);
      }, 1000);
      
      // Clean up
      return () => {
        speechSynthesis.current.cancel();
        setCanBuzzIn(false);
      };
    }
  }, [currentQuestion, showQuestion, roomCode, socket]);
  
  // Reset buzzing state when a player buzzes in
  useEffect(() => {
    if (buzzedPlayer) {
      setCanBuzzIn(false);
    }
  }, [buzzedPlayer]);

  // Timer effect to handle 5-second timeout
  useEffect(() => {
    if (canBuzzIn && showQuestion && !buzzedPlayer && !answerRevealed) {
      // Start the 5 second timer
      setTimerRunning(true);
      setTimerProgress(100);
      
      // Clear any existing timers
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      
      // Set up interval to update the progress bar
      timerIntervalRef.current = setInterval(() => {
        setTimerProgress(prev => {
          const newProgress = prev - 2; // Decrease by 2% every 100ms
          return Math.max(0, newProgress);
        });
      }, 100);
      
      // Set up timeout for the 5 second limit
      timerRef.current = setTimeout(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setTimerRunning(false);
        
        // Only handle timeout if no one has buzzed in
        if (!buzzedPlayer && socket && socket.connected) {
          console.log('Time expired - no one buzzed in');
          socket.emit('timeExpired', roomCode);
          
          // Reveal the answer since no one got it
          setAnswerRevealed(true);
          
          // After 3 seconds, return to the board
          setTimeout(() => {
            handleTimeoutReturn();
          }, 3000);
        }
      }, 5000);
      
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    } else {
      // Stop the timer if conditions aren't met
      setTimerRunning(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }, [canBuzzIn, showQuestion, buzzedPlayer, answerRevealed, roomCode, socket]);

  // Reset the timer when a player buzzes in
  useEffect(() => {
    if (buzzedPlayer) {
      setTimerRunning(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }, [buzzedPlayer]);

  useEffect(() => {
    console.log(`GameHost initializing for room: ${roomCode}`);
    
    // Clear any previous socket connection
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    // Create socket connection
    const socketUrl = process.env.REACT_APP_SOCKET_URL || window.location.origin;
    console.log('Connecting to socket server at:', socketUrl);
    const newSocket = io(socketUrl);
    socketRef.current = newSocket;
    setSocket(newSocket);
    
    // Basic socket listeners for connection status
    newSocket.on('connect', () => {
      console.log('Connected to server with socket ID:', newSocket.id);
      
      // After connecting, create/join the game
      newSocket.emit('createGame', {
        playerName: 'Host',
        roomCode: roomCode
      });
    });
    
    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError(`Connection error: ${err.message}`);
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        newSocket.connect();
      }
    });
    
    // Game event listeners
    newSocket.on('error', (data) => {
      console.error('Game error:', data);
      setError(data.message || 'An unknown error occurred');
    });
    
    newSocket.on('gameCreated', (data) => {
      console.log('Game created successfully:', data);
      if (!data || !data.roomCode) {
        setError('Invalid response from server');
        return;
      }
      
      // Update game state with received data
      setGameState('waiting');
      setPlayers(data.game?.players || []);
    });
    
    newSocket.on('playerJoined', (data) => {
      console.log('Player joined:', data);
      if (data.players) {
        setPlayers(data.players);
      } else if (data.player) {
        setPlayers(prev => [...prev.filter(p => p.id !== data.player.id), data.player]);
      }
    });
    
    newSocket.on('gameStarted', (data) => {
      console.log('Game started:', data);
      setGameState('inProgress');
      setCategories(data.categories || []);
      setBoard(data.board || {});
      
      if (data.selectingPlayerId) {
        const player = data.game?.players.find(p => p.id === data.selectingPlayerId) ||
                       players.find(p => p.id === data.selectingPlayerId);
        if (player) {
          setSelectingPlayer(player);
        }
      }
    });
    
    newSocket.on('questionSelected', (data) => {
      console.log('Question selected:', data);
      setCurrentQuestion(data.question);
      setShowQuestion(true);
      setAnswerRevealed(false);
      setBuzzedPlayer(null);
      setPlayerAnswer(null);
    });
    
    newSocket.on('playerBuzzed', (data) => {
      console.log('Player buzzed in:', data);
      setBuzzedPlayer(data.player);
    });
    
    newSocket.on('playerAnswered', (data) => {
      console.log('Player answered:', data);
      setPlayerAnswer({
        text: data.answer,
        correct: data.correct, // This now comes from auto-judging
        autoJudged: data.autoJudged
      });
    });
    
    newSocket.on('answerJudged', (data) => {
      console.log('Answer judged:', data);
      setPlayerAnswer({
        text: data.answer,
        correct: data.correct
      });
      
      // Update the player scores
      setPlayers(prev => prev.map(p => 
        p.id === data.playerId ? { ...p, score: data.score } : p
      ));
    });
    
    newSocket.on('returnToBoard', (data) => {
      console.log('Returning to board');
      setShowQuestion(false);
      setCurrentQuestion(null);
      setAnswerRevealed(false);
      setBuzzedPlayer(null);
      setPlayerAnswer(null);
      
      // Update selecting player if provided
      if (data.selectingPlayerId) {
        const player = players.find(p => p.id === data.selectingPlayerId);
        setSelectingPlayer(player);
      }
    });
    
    return () => {
      // Clean up socket connection
      if (socketRef.current) {
        console.log('Disconnecting socket on component unmount');
        socketRef.current.disconnect();
      }
    };
  }, [roomCode]);

  const handleStartGame = () => {
    if (socket && socket.connected) {
      console.log('Starting game');
      socket.emit('startGame', roomCode);
    } else {
      setError('Not connected to server');
    }
  };

  const handleRevealAnswer = () => {
    setAnswerRevealed(true);
  };

  const handleJudgeAnswer = (correct) => {
    if (socket && buzzedPlayer) {
      console.log(`Judging answer as ${correct ? 'correct' : 'incorrect'}`);
      socket.emit('submitAnswer', roomCode, buzzedPlayer.id, buzzedPlayer.answer || playerAnswer?.text, correct);
    }
  };

  const handleEndGame = () => {
    if (socket) {
      console.log('Ending game');
      socket.emit('endGame', { roomCode });
      navigate('/');
    }
  };

  const handleSelectQuestion = (categoryIndex, valueIndex) => {
    if (socket) {
      console.log(`Selecting question: category ${categoryIndex}, value ${valueIndex}`);
      socket.emit('selectQuestion', roomCode, categoryIndex, valueIndex);
    }
  };

  // Handle returning to the board when timer expires
  const handleTimeoutReturn = () => {
    if (socket && socket.connected) {
      // Mark the question as revealed in the board data
      if (currentQuestion) {
        const updatedBoard = { ...board };
        if (updatedBoard[currentQuestion.category] && 
            updatedBoard[currentQuestion.category][currentQuestion.valueIndex]) {
          updatedBoard[currentQuestion.category][currentQuestion.valueIndex].revealed = true;
        }
        setBoard(updatedBoard);
      }
      
      // Return to board view
      setShowQuestion(false);
      setCurrentQuestion(null);
      setAnswerRevealed(false);
      setBuzzedPlayer(null);
      setPlayerAnswer(null);
      
      // Keep the same selecting player (last active player selects next)
      if (selectingPlayer) {
        socket.emit('returnToBoard', {
          roomCode,
          selectingPlayerId: selectingPlayer.id
        });
      }
    }
  };

  return (
    <GameHostContainer>
      <GameHeader>
        <h1>Jeoparty! Host</h1>
        <RoomCode>Room Code: {roomCode}</RoomCode>
      </GameHeader>
      
      {error && <StatusMessage>{error}</StatusMessage>}
      
      <MainContent>
        <BoardWrapper>
          {!showQuestion ? (
            <>
              <JeopardyBoard 
                categories={categories} 
                board={board} 
                onSelectQuestion={handleSelectQuestion}
                disabled={gameState !== 'inProgress' || !!selectingPlayer}
                compact={true}
              />
              {selectingPlayer && (
                <SelectingPlayerInfo>
                  {selectingPlayer.name} is selecting the next question...
                </SelectingPlayerInfo>
              )}
            </>
          ) : (
            <QuestionDisplay $canBuzzIn={canBuzzIn}>
              {currentQuestion?.text}
              <AnswerDisplay $revealed={answerRevealed}>
                {currentQuestion?.answer}
              </AnswerDisplay>
              
              {buzzedPlayer && !playerAnswer && (
                <PlayerAnswer>
                  {buzzedPlayer.name} buzzed in
                  <HostControls>
                    <Button onClick={() => handleJudgeAnswer(true)}>
                      Correct
                    </Button>
                    <Button onClick={() => handleJudgeAnswer(false)}>
                      Incorrect
                    </Button>
                  </HostControls>
                </PlayerAnswer>
              )}
              
              {playerAnswer && (
                <PlayerAnswer $correct={playerAnswer.correct}>
                  {buzzedPlayer?.name}: {playerAnswer.text}
                  {playerAnswer.correct === null && !playerAnswer.autoJudged && (
                    <HostControls>
                      <Button onClick={() => handleJudgeAnswer(true)}>
                        Correct
                      </Button>
                      <Button onClick={() => handleJudgeAnswer(false)}>
                        Incorrect
                      </Button>
                    </HostControls>
                  )}
                  {playerAnswer.correct !== null && (
                    <p>{playerAnswer.correct ? 'Correct!' : 'Incorrect!'}</p>
                  )}
                </PlayerAnswer>
              )}
              
              {!buzzedPlayer && !playerAnswer && !answerRevealed && (
                <Button onClick={handleRevealAnswer} disabled={answerRevealed}>
                  Reveal Answer
                </Button>
              )}
              
              {/* Timer bar at the bottom of the question display */}
              {canBuzzIn && !buzzedPlayer && !answerRevealed && (
                <TimerBar 
                  $progress={timerProgress}
                  $running={timerRunning}
                />
              )}
            </QuestionDisplay>
          )}
        </BoardWrapper>
        
        <SidePanel>
          <h2>Players ({players.length})</h2>
          <PlayerList players={players} />
          
          {gameState === 'waiting' && (
            <Button onClick={handleStartGame} disabled={players.length === 0}>
              Start Game
            </Button>
          )}
          
          <Button onClick={handleEndGame} style={{ marginTop: 'auto' }}>
            End Game
          </Button>
        </SidePanel>
      </MainContent>
    </GameHostContainer>
  );
};

export default GameHost; 
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes, css } from 'styled-components';
import io from 'socket.io-client';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7); }
  70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(255, 215, 0, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
`;

const GamePlayerContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--background);
  color: var(--text);
  padding: 20px;
  position: relative;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
`;

const PlayerInfo = styled.div`
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-value);
  padding: 5px 10px;
  border-radius: 4px;
  font-weight: bold;
`;

const Question = styled.div`
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-value);
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  font-size: 1.5rem;
  margin-bottom: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  animation: ${fadeIn} 0.3s ease;
  border: ${props => props.$canBuzzIn ? '5px solid var(--jeopardy-value)' : 'none'};
  box-shadow: ${props => props.$canBuzzIn ? '0 0 20px rgba(255, 215, 0, 0.7)' : 'none'};
`;

const Category = styled.div`
  font-size: 1rem;
  color: #ccc;
  margin-bottom: 15px;
  text-transform: uppercase;
`;

const Value = styled.div`
  font-size: 1.2rem;
  color: var(--jeopardy-value);
  margin-bottom: 20px;
  font-weight: bold;
`;

const BuzzerBtn = styled.button`
  background-color: ${props => props.$active ? '#f44336' : 'var(--jeopardy-value)'};
  color: ${props => props.$active ? 'white' : 'var(--jeopardy-board)'};
  border: none;
  border-radius: 50%;
  width: 150px;
  height: 150px;
  font-size: 1.5rem;
  font-weight: bold;
  margin: 20px auto;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$disabled ? 0.7 : 1};
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  animation: ${props => props.$active ? css`${pulse} 1.5s infinite` : 'none'};

  &:active {
    transform: ${props => props.$disabled ? 'none' : 'scale(0.95)'};
  }
`;

const AnswerInput = styled.input`
  padding: 15px;
  border-radius: 4px;
  border: 2px solid var(--jeopardy-board);
  font-size: 1.2rem;
  width: 100%;
  margin-bottom: 15px;
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
`;

const SubmitBtn = styled.button`
  background-color: var(--jeopardy-value);
  color: var(--jeopardy-board);
  border: none;
  padding: 15px;
  border-radius: 4px;
  font-size: 1.2rem;
  font-weight: bold;
  width: 100%;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const Status = styled.div`
  margin-top: 20px;
  text-align: center;
  font-size: 1.2rem;
  font-weight: bold;
  color: ${props => props.$correct === true ? '#4caf50' : props.$correct === false ? '#f44336' : '#ccc'};
`;

const WaitingMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  animation: ${fadeIn} 0.5s ease;
`;

const MiniBoard = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--jeopardy-board);
  border: 3px solid #000;
  width: 100%;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 20px;
  animation: ${fadeIn} 0.3s ease;
`;

const MiniCategoryRow = styled.div`
  display: flex;
  height: 40px;
`;

const MiniCategory = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-category);
  font-size: 0.7rem;
  font-weight: bold;
  text-transform: uppercase;
  padding: 2px;
  border: 1px solid #000;
  overflow: hidden;
`;

const MiniGridRow = styled.div`
  display: flex;
  height: 40px;
`;

const MiniCell = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props => 
    props.$revealed ? 'transparent' : 'var(--jeopardy-board)'
  };
  color: ${props => props.$revealed ? 'transparent' : 'var(--jeopardy-value)'};
  font-size: 0.9rem;
  font-weight: bold;
  border: 1px solid #000;
  cursor: ${props => props.$revealed ? 'default' : 'pointer'};
  transition: all 0.2s ease;
  
  &:hover {
    background-color: ${props => 
      props.$revealed ? 'transparent' : 'var(--jeopardy-selected)'
    };
  }
`;

const SelectingMessage = styled.div`
  color: var(--jeopardy-value);
  font-weight: bold;
  font-size: 1.2rem;
  text-align: center;
  margin-bottom: 15px;
  animation: ${pulse} 2s infinite ease-in-out;
`;

const PlayerList = styled.div`
  margin: 20px 0;
`;

const PlayerItem = styled.div`
  background-color: rgba(0, 0, 0, 0.2);
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const GamePlayer = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState('connecting');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [canBuzz, setCanBuzz] = useState(false);
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [judged, setJudged] = useState(null);
  const [score, setScore] = useState(0);
  const [canSelectQuestion, setCanSelectQuestion] = useState(false);
  const [categories, setCategories] = useState([]);
  const [board, setBoard] = useState({});
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const buzzerSound = useRef(null);

  useEffect(() => {
    console.log(`GamePlayer initializing for room: ${roomCode}`);
    
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
    
    buzzerSound.current = new Audio('/sounds/ba-ding.mp3');
    
    const newSocket = io(process.env.REACT_APP_SOCKET_URL || window.location.origin);
    socketRef.current = newSocket;
    setSocket(newSocket);
    
    const setupSocketListeners = () => {
      const events = [
        'gameJoined', 'gameStarted', 'hostDisconnected', 'gameEnded',
        'questionSelected', 'playerBuzzed', 'answerJudged', 'gameOver',
        'returnToBoard', 'error', 'player-buzzed', 'gameNotFound'
      ];
      
      events.forEach(event => {
        newSocket.off(event);
      });
      
      newSocket.on('connect', () => {
        console.log(`Socket connected with ID: ${newSocket.id}`);
        if (savedName) {
          console.log(`Attempting to join room ${roomCode} as ${savedName}`);
          newSocket.emit('joinGame', {
            roomCode: roomCode.toUpperCase(),
            playerName: savedName
          });
        } else {
          setGameState('notJoined');
        }
      });
      
      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError(`Connection error: ${err.message}`);
        setGameState('error');
      });
      
      newSocket.on('error', (data) => {
        console.error('Socket error:', data);
        setError(data.message || 'An error occurred');
        setGameState('error');
      });
      
      newSocket.on('gameNotFound', () => {
        console.error(`Game with code ${roomCode} not found`);
        setError(`Game with code ${roomCode} not found. Please check the room code.`);
        setGameState('error');
      });
      
      newSocket.on('gameJoined', (data) => {
        console.log('Game joined successfully:', data);
        setGameState(data.gameState || 'waiting');
        setPlayers(data.players || []);
        
        if (data.categories && data.board) {
          setCategories(data.categories);
          setBoard(data.board);
        }
        
        if (data.score !== undefined) {
          setScore(data.score);
        }
      });
      
      newSocket.on('playerJoined', (data) => {
        console.log('Player joined:', data);
        if (data.players) {
          setPlayers(data.players);
        } else if (data.player) {
          setPlayers(prev => {
            if (prev.find(p => p.id === data.player.id)) {
              return prev;
            }
            return [...prev, data.player];
          });
        }
      });
      
      newSocket.on('gameStarted', (data) => {
        console.log('Game started:', data);
        setGameState('inProgress');
        if (data.categories) setCategories(data.categories);
        if (data.board) setBoard(data.board);
        
        // Check if it's this player's turn to select a question
        if (data.selectingPlayerId === newSocket.id) {
          setCanSelectQuestion(true);
        }
      });
      
      newSocket.on('hostDisconnected', () => {
        console.log('Host disconnected');
        setError('The host has disconnected. Please try again later.');
        setGameState('error');
      });
      
      newSocket.on('gameEnded', () => {
        console.log('Game ended');
        setError('The game has ended. Thanks for playing!');
        setGameState('error');
      });
      
      newSocket.on('questionSelected', (data) => {
        console.log('Question selected:', data);
        setCurrentQuestion(data.question);
        setCanBuzz(false); // Initially can't buzz, wait for server signal
        setHasBuzzed(false);
        setJudged(null);
        setAnswer('');
        
        // Listen for text-to-speech completion from the host
        // The server will emit a buzzerEnabled event after the host finishes reading the question
        setTimeout(() => {
          // Set canBuzz to true after a delay (typical time for host to read the question)
          // This is a fallback in case we don't get the signal from the host
          setCanBuzz(true);
        }, 5000); // 5 seconds delay as a fallback
      });
      
      const handlePlayerBuzzed = (data) => {
        console.log('Player buzzed:', data);
        if (data.player && data.player.id === newSocket.id) {
          setHasBuzzed(true);
        } else {
          setCanBuzz(false);
        }
      };
      
      newSocket.on('playerBuzzed', handlePlayerBuzzed);
      newSocket.on('player-buzzed', handlePlayerBuzzed);
      
      newSocket.on('answerJudged', (data) => {
        console.log('Answer judged:', data);
        
        // Update this player's score if it's their answer
        if (data.playerId === newSocket.id) {
          setJudged(data.correct);
          setScore(data.score);
          
          // If correct, this player will select next question
          if (data.correct && data.selectingPlayerId === newSocket.id) {
            setCanSelectQuestion(true);
          }
        }
      });
      
      newSocket.on('returnToBoard', (data) => {
        console.log('Returning to board:', data);
        setGameState('inProgress');
        setCurrentQuestion(null);
        setHasBuzzed(false);
        setCanBuzz(false);
        setJudged(null);
        setAnswer('');
        
        if (data.selectingPlayerId === newSocket.id) {
          setCanSelectQuestion(true);
        } else {
          setCanSelectQuestion(false);
        }
      });
    };
    
    setupSocketListeners();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (buzzerSound.current) {
        buzzerSound.current.pause();
        buzzerSound.current.src = '';
      }
    };
  }, [roomCode, navigate]);
  
  const handleJoinGame = (e) => {
    e.preventDefault();
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    setError('');
    localStorage.setItem('playerName', playerName.trim());
    
    if (socket && socket.connected) {
      socket.emit('joinGame', {
        roomCode: roomCode.toUpperCase(),
        playerName: playerName.trim()
      });
    } else {
      setError('Not connected to server. Please try again.');
    }
  };
  
  const handleBuzz = () => {
    if (socket && canBuzz && !hasBuzzed) {
      if (buzzerSound.current) {
        buzzerSound.current.play().catch(e => console.log('Error playing sound:', e));
      }
      
      socket.emit('buzz', roomCode);
      setHasBuzzed(true);
    }
  };
  
  const handleSubmitAnswer = (e) => {
    e.preventDefault();
    if (socket && hasBuzzed && answer.trim()) {
      console.log(`Submitting answer: ${answer.trim()}`);
      socket.emit('submitAnswer', roomCode, answer.trim());
      
      // Disable form after submission
      const form = e.target;
      if (form) {
        form.querySelector('button').disabled = true;
      }
    }
  };
  
  const handleSelectQuestion = (categoryIndex, valueIndex) => {
    if (socket && canSelectQuestion) {
      console.log(`Selecting question: category ${categoryIndex}, value ${valueIndex}`);
      socket.emit('selectQuestion', roomCode, categoryIndex, valueIndex);
      setCanSelectQuestion(false);
    }
  };
  
  if (gameState === 'connecting' || gameState === 'error') {
    return (
      <GamePlayerContainer>
        <Header>
          <Title>Jeoparty!</Title>
        </Header>
        
        <WaitingMessage>
          {gameState === 'connecting' ? (
            <h2>Connecting to game...</h2>
          ) : (
            <>
              <h2>Error</h2>
              <p>{error || 'An error occurred connecting to the game'}</p>
              <SubmitBtn onClick={() => navigate('/')}>
                Back to Home
              </SubmitBtn>
            </>
          )}
        </WaitingMessage>
      </GamePlayerContainer>
    );
  }
  
  if (gameState === 'notJoined') {
    return (
      <GamePlayerContainer>
        <Header>
          <Title>Join Game</Title>
        </Header>
        
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          <h2>Room Code: {roomCode}</h2>
          {error && <div style={{ color: '#f44336', margin: '10px 0' }}>{error}</div>}
          
          <form onSubmit={handleJoinGame}>
            <AnswerInput
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
            <SubmitBtn 
              type="submit" 
              disabled={!playerName.trim()}
            >
              Join Game
            </SubmitBtn>
          </form>
        </div>
      </GamePlayerContainer>
    );
  }
  
  if (gameState === 'waiting') {
    return (
      <GamePlayerContainer>
        <Header>
          <Title>Jeoparty!</Title>
          <PlayerInfo>Score: ${score}</PlayerInfo>
        </Header>
        
        <WaitingMessage>
          <h2>Waiting for game to start...</h2>
          <p>Room Code: {roomCode}</p>
          <p>You're in as: {playerName}</p>
          
          <h3>Players in Game:</h3>
          <PlayerList>
            {players.length === 0 ? (
              <p>No players have joined yet</p>
            ) : (
              players.map(player => (
                <PlayerItem key={player.id}>
                  <span>{player.name}</span>
                  {player.isHost && <small>(Host)</small>}
                </PlayerItem>
              ))
            )}
          </PlayerList>
        </WaitingMessage>
      </GamePlayerContainer>
    );
  }
  
  if (gameState === 'inProgress') {
    return (
      <GamePlayerContainer>
        <Header>
          <Title>Jeoparty!</Title>
          <PlayerInfo>Score: ${score}</PlayerInfo>
        </Header>
        
        {canSelectQuestion && (
          <>
            <SelectingMessage>Your turn to select a question!</SelectingMessage>
            <MiniBoard>
              <MiniCategoryRow>
                {categories.map((category, index) => (
                  <MiniCategory key={index}>{category}</MiniCategory>
                ))}
              </MiniCategoryRow>
              
              {[0, 1, 2, 3, 4].map(valueIndex => (
                <MiniGridRow key={valueIndex}>
                  {categories.map((category, categoryIndex) => {
                    const revealed = board[category]?.[valueIndex]?.revealed;
                    const value = board[category]?.[valueIndex]?.value;
                    
                    return (
                      <MiniCell 
                        key={`${categoryIndex}-${valueIndex}`}
                        $revealed={revealed}
                        onClick={() => !revealed && handleSelectQuestion(categoryIndex, valueIndex)}
                      >
                        {revealed ? '' : `$${value}`}
                      </MiniCell>
                    );
                  })}
                </MiniGridRow>
              ))}
            </MiniBoard>
          </>
        )}
        
        {!canSelectQuestion && (
          <WaitingMessage>
            <h2>Waiting for next question...</h2>
          </WaitingMessage>
        )}
      </GamePlayerContainer>
    );
  }
  
  return (
    <GamePlayerContainer>
      <Header>
        <Title>Jeoparty!</Title>
        <PlayerInfo>Score: ${score}</PlayerInfo>
      </Header>
      
      {currentQuestion && (
        <Question $canBuzzIn={canBuzz && !hasBuzzed}>
          <Category>{currentQuestion.category}</Category>
          <Value>${currentQuestion.value}</Value>
          {currentQuestion.text}
        </Question>
      )}
      
      {!hasBuzzed && (
        <BuzzerBtn 
          onClick={handleBuzz}
          $disabled={!canBuzz}
          $active={canBuzz}
        >
          {canBuzz ? 'BUZZ IN!' : 'Wait...'}
        </BuzzerBtn>
      )}
      
      {hasBuzzed && (
        <form onSubmit={handleSubmitAnswer}>
          <AnswerInput
            type="text"
            placeholder="Your Answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoFocus
          />
          <SubmitBtn type="submit" disabled={!answer.trim()}>
            Submit Answer
          </SubmitBtn>
        </form>
      )}
      
      {judged !== null && (
        <Status $correct={judged}>
          {judged ? 'Correct!' : 'Incorrect!'}
        </Status>
      )}
    </GamePlayerContainer>
  );
};

export default GamePlayer; 
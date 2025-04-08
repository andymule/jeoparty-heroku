import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import io from 'socket.io-client';
import JeopardyBoard from '../components/JeopardyBoard';
import PlayerList from '../components/PlayerList';
import { loadSound, playSound, cleanupSounds, SOUNDS } from '../utils/soundUtils';

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

const TimerLabel = styled.div`
  position: absolute;
  bottom: 10px;
  left: 0;
  width: 100%;
  text-align: center;
  font-size: 1rem;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 5px;
`;

// Add a styled component for round transitions
const RoundTransition = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--jeopardy-board);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 20;
  animation: ${slideDown} 0.5s ease;
`;

const RoundTitle = styled.h1`
  font-size: 4rem;
  color: var(--jeopardy-value);
  margin: 0;
  text-align: center;
`;

const RoundSubtitle = styled.h2`
  font-size: 2rem;
  color: white;
  margin: 10px 0 30px;
  text-align: center;
`;

const RoundMessage = styled.p`
  font-size: 1.5rem;
  color: white;
  margin: 0 20px;
  text-align: center;
  max-width: 80%;
`;

const FinalJeopardyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-value);
  padding: 20px;
  text-align: center;
`;

const FinalCategory = styled.div`
  font-size: 2.5rem;
  margin-bottom: 20px;
  text-transform: uppercase;
  animation: ${pulse} 2s infinite ease-in-out;
`;

const FinalQuestion = styled.div`
  font-size: 2.5rem;
  margin: 40px 0;
  animation: ${slideDown} 0.5s ease;
`;

const FinalAnswer = styled.div`
  font-size: 2.5rem;
  margin: 20px 0;
  color: white;
  animation: ${slideDown} 0.5s ease;
`;

const PlayerResponses = styled.div`
  width: 100%;
  max-width: 800px;
  margin-top: 30px;
`;

const PlayerResponse = styled.div`
  background-color: rgba(0, 0, 0, 0.3);
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const PlayerInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const PlayerName = styled.div`
  font-size: 1.2rem;
  font-weight: bold;
`;

const PlayerWager = styled.div`
  font-size: 1rem;
  color: ${props => props.$judged ? (props.$correct ? '#4caf50' : '#f44336') : 'white'};
`;

const PlayerResponseText = styled.div`
  font-size: 1.2rem;
  color: ${props => props.$judged ? (props.$correct ? '#4caf50' : '#f44336') : 'white'};
`;

const JudgmentButtons = styled.div`
  display: flex;
  gap: 10px;
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
  const [currentRound, setCurrentRound] = useState(null);
  const [showRoundTransition, setShowRoundTransition] = useState(false);
  const [roundTransitionMessage, setRoundTransitionMessage] = useState('');
  const [roundTransitionTitle, setRoundTransitionTitle] = useState('');
  const [finalJeopardyState, setFinalJeopardyState] = useState({
    category: '',
    question: '',
    answer: '',
    playerWagers: {},
    playerAnswers: {},
    playerJudgments: {},
    showQuestion: false,
    showAnswer: false
  });
  
  const socketRef = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const buzzerSound = useRef(null);
  const [canBuzzIn, setCanBuzzIn] = useState(false);
  const timerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const [questionCycle, setQuestionCycle] = useState(0);
  const correctSound = useRef(null);
  const incorrectSound = useRef(null);
  const roundTransitionTimeoutRef = useRef(null);

  // Initialize the buzzer sound
  useEffect(() => {
    // Preload all sounds
    buzzerSound.current = loadSound('BUZZER');
    correctSound.current = loadSound('CORRECT');
    incorrectSound.current = loadSound('INCORRECT');
    
    return () => {
      // Clean up all sounds
      cleanupSounds();
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
        playSound('BUZZER').catch(e => console.log('Error playing buzzer sound:', e));
        
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
      
      const startTime = Date.now();
      const duration = 5000; // 5 seconds in milliseconds
      
      // Set up interval to update the progress bar every 33ms (roughly 30fps)
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const progress = Math.floor((remaining / duration) * 100);
        
        setTimerProgress(progress);
        
        if (progress <= 0) {
          clearInterval(timerIntervalRef.current);
        }
      }, 33);
      
      // Set up timeout for the 5 second limit - EXACT 5000ms
      timerRef.current = setTimeout(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setTimerRunning(false);
        setTimerProgress(0); // Ensure it shows 0 at timeout
        
        // Only handle timeout if no one has buzzed in
        if (!buzzedPlayer && socket && socket.connected) {
          console.log('Time expired - no one buzzed in');
          socket.emit('timeExpired', roomCode);
          
          // Reveal the answer since no one got it
          setAnswerRevealed(true);
          
          // Play the incorrect sound
          playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
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
      setCurrentRound('singleJeopardy');
      
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
      setBuzzedPlayer(null);
      setPlayerAnswer(null);
      setAnswerRevealed(false);
      setShowQuestion(true);
      setCanBuzzIn(false);
      
      // Reset timers
      setTimerProgress(100);
      setTimerRunning(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    });
    
    newSocket.on('playerBuzzed', (data) => {
      console.log('Player buzzed in:', data);
      setBuzzedPlayer(data.player);
      
      // Start a 5-second answer timer
      setTimerRunning(true);
      setTimerProgress(100);
      
      // Clear any existing timers
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      
      const startTime = Date.now();
      const duration = 5000; // 5 seconds in milliseconds
      
      // Set up interval to update the progress bar every 33ms (roughly 30fps)
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const progress = Math.floor((remaining / duration) * 100);
        
        setTimerProgress(progress);
        
        if (progress <= 0) {
          clearInterval(timerIntervalRef.current);
        }
      }, 33);
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
      
      // Play sound effect for correct/incorrect answer
      if (data.correct) {
        playSound('CORRECT').catch(e => console.log('Error playing correct sound:', e));
      } else {
        playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
      }
      
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
      
      // Update the board state if provided
      if (data.board) {
        setBoard(data.board);
        console.log('Updated board with revealed questions:', data.board);
      }
      
      // Update selecting player if provided
      if (data.selectingPlayerId) {
        const player = players.find(p => p.id === data.selectingPlayerId);
        setSelectingPlayer(player);
      }
    });
    
    newSocket.on('allPlayersAttempted', (data) => {
      console.log('All players have attempted the question:', data);
      setAnswerRevealed(true); // Automatically reveal the answer
      
      // Stop the timer if it's running
      setTimerRunning(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    });
    
    newSocket.on('buzzerReEnabled', (data) => {
      console.log('Buzzer re-enabled after incorrect answer:', data);
      setCanBuzzIn(true);
      setBuzzedPlayer(null);
      setPlayerAnswer(null);
      
      // Increment the question cycle counter
      setQuestionCycle(prev => prev + 1);
      
      // Restart the timer
      setTimerRunning(true);
      setTimerProgress(100);
      
      // Clear any existing timers
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      
      const startTime = Date.now();
      const duration = 5000; // 5 seconds in milliseconds
      
      // Set up interval to update the progress bar every 33ms (roughly 30fps)
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const progress = Math.floor((remaining / duration) * 100);
        
        setTimerProgress(progress);
        
        if (progress <= 0) {
          clearInterval(timerIntervalRef.current);
        }
      }, 33);
      
      // Set up timeout for the 5 second limit - EXACT 5000ms
      timerRef.current = setTimeout(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setTimerRunning(false);
        setTimerProgress(0); // Ensure it shows 0 at timeout
        
        // Only handle timeout if no one has buzzed in
        if (!buzzedPlayer && socket && socket.connected) {
          console.log('Time expired - no one buzzed in');
          socket.emit('timeExpired', roomCode);
          
          // Reveal the answer since no one got it
          setAnswerRevealed(true);
          
          // Play the incorrect sound
          playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
        }
      }, 5000);
    });
    
    newSocket.on('timeExpired', (data) => {
      console.log('Time expired event received:', data);
      // Automatically reveal the answer
      setAnswerRevealed(true);
      
      // Play the incorrect sound
      playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
      
      // Stop the timer
      setTimerRunning(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    });
    
    // Add handlers for round transitions
    newSocket.on('roundChanged', (data) => {
      console.log('Round changed:', data);
      
      // Show round transition screen
      setRoundTransitionTitle(data.round === 'doubleJeopardy' ? 'DOUBLE JEOPARDY!' : 'NEXT ROUND');
      setRoundTransitionMessage(data.message || '');
      setShowRoundTransition(true);
      
      // Update game state
      setCurrentRound(data.round);
      setCategories(data.categories || []);
      setBoard(data.board || {});
      
      if (data.selectingPlayerId) {
        const player = players.find(p => p.id === data.selectingPlayerId);
        setSelectingPlayer(player);
      }
      
      // Hide round transition after 5 seconds
      if (roundTransitionTimeoutRef.current) {
        clearTimeout(roundTransitionTimeoutRef.current);
      }
      
      roundTransitionTimeoutRef.current = setTimeout(() => {
        setShowRoundTransition(false);
      }, 5000);
    });
    
    // Add handlers for Final Jeopardy
    newSocket.on('finalJeopardy', (data) => {
      console.log('Final Jeopardy:', data);
      
      // Show round transition screen
      setRoundTransitionTitle('FINAL JEOPARDY!');
      setRoundTransitionMessage(data.message || '');
      setShowRoundTransition(true);
      
      // Update game state
      setCurrentRound('finalJeopardy');
      setGameState('finalJeopardy');
      
      // Set up final jeopardy state
      setFinalJeopardyState(prev => ({
        ...prev,
        category: data.category,
        playerWagers: {},
        playerAnswers: {},
        playerJudgments: {},
        showQuestion: false,
        showAnswer: false,
        eligiblePlayers: data.eligiblePlayers || []
      }));
      
      // Hide round transition after 5 seconds
      if (roundTransitionTimeoutRef.current) {
        clearTimeout(roundTransitionTimeoutRef.current);
      }
      
      roundTransitionTimeoutRef.current = setTimeout(() => {
        setShowRoundTransition(false);
      }, 5000);
    });
    
    newSocket.on('playerWagered', (data) => {
      console.log('Player wagered:', data);
      
      // Update final jeopardy state with player wager
      setFinalJeopardyState(prev => ({
        ...prev,
        playerWagers: {
          ...prev.playerWagers,
          [data.playerId]: { name: data.playerName, amount: 'hidden' }
        }
      }));
    });
    
    newSocket.on('finalJeopardyQuestion', (data) => {
      console.log('Final Jeopardy question:', data);
      
      // Update final jeopardy state
      setFinalJeopardyState(prev => ({
        ...prev,
        question: data.question,
        showQuestion: true
      }));
      
      // Read the question aloud
      if (speechSynthesis.current) {
        const utterance = new SpeechSynthesisUtterance(data.question);
        utterance.rate = 0.9;
        speechSynthesis.current.speak(utterance);
      }
    });
    
    newSocket.on('playerAnswered', (data) => {
      console.log('Player answered Final Jeopardy:', data);
      
      // Update final jeopardy state with player answer
      setFinalJeopardyState(prev => ({
        ...prev,
        playerAnswers: {
          ...prev.playerAnswers,
          [data.playerId]: { name: data.playerName, answer: 'hidden' }
        }
      }));
    });
    
    newSocket.on('allFinalAnswersReceived', () => {
      console.log('All Final Jeopardy answers received');
      
      // Update wagers to show actual amounts
      socket.emit('revealFinalWagers', { roomCode });
    });
    
    newSocket.on('finalWagersRevealed', (data) => {
      console.log('Final Jeopardy wagers revealed:', data);
      
      // Update final jeopardy state with actual wager amounts
      setFinalJeopardyState(prev => ({
        ...prev,
        playerWagers: data.wagers,
        playerAnswers: data.answers
      }));
    });
    
    newSocket.on('finalAnswerJudged', (data) => {
      console.log('Final answer judged:', data);
      
      // Play appropriate sound
      if (data.correct) {
        playSound('CORRECT').catch(e => console.log('Error playing correct sound:', e));
      } else {
        playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
      }
      
      // Update final jeopardy state with judgment
      setFinalJeopardyState(prev => ({
        ...prev,
        playerJudgments: {
          ...prev.playerJudgments,
          [data.playerId]: { 
            correct: data.correct, 
            wager: data.wager,
            answer: data.answer
          }
        }
      }));
      
      // Update player scores
      setPlayers(prev => prev.map(p => 
        p.id === data.playerId ? { ...p, score: data.score } : p
      ));
    });
    
    newSocket.on('finalAnswerRevealed', (data) => {
      console.log('Final answer revealed:', data);
      
      // Update final jeopardy state
      setFinalJeopardyState(prev => ({
        ...prev,
        answer: data.answer,
        showAnswer: true
      }));
    });
    
    newSocket.on('gameOver', (data) => {
      console.log('Game over:', data);
      
      // Show game over screen
      setRoundTransitionTitle('GAME OVER!');
      setRoundTransitionMessage(`Winner: ${data.winner ? `${data.winner.name} with $${data.winner.score}` : 'No winner'}`);
      setShowRoundTransition(true);
      
      // Update game state
      setGameState('gameOver');
      setCurrentRound('gameOver');
      
      // Update player list with final scores
      if (data.players) {
        setPlayers(data.players);
      }
    });
    
    return () => {
      // Clean up socket connection
      if (socketRef.current) {
        console.log('Disconnecting socket on component unmount');
        socketRef.current.disconnect();
      }
      
      // Clear any timeouts
      if (roundTransitionTimeoutRef.current) {
        clearTimeout(roundTransitionTimeoutRef.current);
      }
    };
  }, [roomCode]);

  // Replace the Reveal Answer button with a timer to automatically reveal the answer when needed
  useEffect(() => {
    // When a player's answer is judged incorrect and no one has buzzed in for 3 seconds, reveal the answer
    let revealTimer = null;
    if (!buzzedPlayer && playerAnswer && !playerAnswer.correct && !answerRevealed) {
      revealTimer = setTimeout(() => {
        setAnswerRevealed(true);
      }, 3000);
    }
    
    return () => {
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, [buzzedPlayer, playerAnswer, answerRevealed]);

  const handleStartGame = () => {
    if (socket && socket.connected) {
      console.log('Starting game');
      socket.emit('startGame', roomCode);
    } else {
      setError('Not connected to server');
    }
  };

  const handleJudgeAnswer = (correct) => {
    if (socket && buzzedPlayer) {
      console.log(`Judging answer as ${correct ? 'correct' : 'incorrect'}`);
      socket.emit('submitJudgment', roomCode, buzzedPlayer.id, correct);
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

  const handleJudgeFinalAnswer = (playerId, correct) => {
    if (socket && socket.connected) {
      console.log(`Judging final answer for ${playerId} as ${correct ? 'correct' : 'incorrect'}`);
      socket.emit('judgeFinalAnswer', {
        roomCode,
        playerId,
        correct
      });
    }
  };

  // Render Final Jeopardy
  const renderFinalJeopardy = () => {
    return (
      <FinalJeopardyContainer>
        <FinalCategory>{finalJeopardyState.category}</FinalCategory>
        
        {finalJeopardyState.showQuestion ? (
          <>
            <FinalQuestion>{finalJeopardyState.question}</FinalQuestion>
            
            {finalJeopardyState.showAnswer && (
              <FinalAnswer>{finalJeopardyState.answer}</FinalAnswer>
            )}
            
            <PlayerResponses>
              {Object.entries(finalJeopardyState.playerWagers).map(([playerId, wager]) => {
                const playerName = wager.name;
                const answer = finalJeopardyState.playerAnswers[playerId]?.answer || "Waiting...";
                const judgment = finalJeopardyState.playerJudgments[playerId];
                const wagerAmount = wager.amount !== 'hidden' ? wager.amount : 'Hidden';
                const player = players.find(p => p.id === playerId);
                
                return (
                  <PlayerResponse key={playerId}>
                    <PlayerInfo>
                      <PlayerName>{playerName} (${player?.score || 0})</PlayerName>
                      <PlayerWager $judged={judgment !== undefined} $correct={judgment?.correct}>
                        Wager: ${wagerAmount}
                      </PlayerWager>
                      <PlayerResponseText $judged={judgment !== undefined} $correct={judgment?.correct}>
                        {answer === 'hidden' ? "Answer submitted" : answer}
                      </PlayerResponseText>
                    </PlayerInfo>
                    
                    {!judgment && answer !== 'hidden' && answer !== 'Waiting...' && (
                      <JudgmentButtons>
                        <Button onClick={() => handleJudgeFinalAnswer(playerId, true)}>
                          Correct
                        </Button>
                        <Button onClick={() => handleJudgeFinalAnswer(playerId, false)}>
                          Incorrect
                        </Button>
                      </JudgmentButtons>
                    )}
                  </PlayerResponse>
                );
              })}
            </PlayerResponses>
          </>
        ) : (
          <div>Waiting for players to submit their wagers...</div>
        )}
      </FinalJeopardyContainer>
    );
  };

  // Add the round display to the header
  const renderRoundInfo = () => {
    if (!currentRound) return null;
    
    let roundDisplay = "";
    switch (currentRound) {
      case 'singleJeopardy':
        roundDisplay = "Single Jeopardy";
        break;
      case 'doubleJeopardy':
        roundDisplay = "Double Jeopardy";
        break;
      case 'finalJeopardy':
        roundDisplay = "Final Jeopardy";
        break;
      case 'gameOver':
        roundDisplay = "Game Over";
        break;
      default:
        roundDisplay = currentRound;
    }
    
    return (
      <div style={{ color: 'var(--jeopardy-value)', fontSize: '1.2rem', fontWeight: 'bold' }}>
        {roundDisplay}
      </div>
    );
  };

  return (
    <GameHostContainer>
      <GameHeader>
        <h1>Jeoparty! Host</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {renderRoundInfo()}
          <RoomCode>Room Code: {roomCode}</RoomCode>
        </div>
      </GameHeader>
      
      {error && <StatusMessage>{error}</StatusMessage>}
      
      <MainContent>
        <BoardWrapper>
          {currentRound === 'finalJeopardy' ? (
            renderFinalJeopardy()
          ) : !showQuestion ? (
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
              
              {/* Timer bar at the bottom of the question display */}
              {timerRunning && (
                <>
                  <TimerBar 
                    $progress={timerProgress}
                    $running={timerRunning}
                  />
                  <TimerLabel>
                    {buzzedPlayer ? `${buzzedPlayer.name} has ${Math.ceil(timerProgress/20)} seconds to answer` : `${Math.ceil(timerProgress/20)} seconds to buzz in`}
                  </TimerLabel>
                </>
              )}
            </QuestionDisplay>
          )}
          
          {/* Round transition overlay */}
          {showRoundTransition && (
            <RoundTransition>
              <RoundTitle>{roundTransitionTitle}</RoundTitle>
              <RoundSubtitle>
                {currentRound === 'gameOver' ? 'Final Scores' : 'Get Ready!'}
              </RoundSubtitle>
              <RoundMessage>{roundTransitionMessage}</RoundMessage>
            </RoundTransition>
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
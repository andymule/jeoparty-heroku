import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes, css } from 'styled-components';
import io from 'socket.io-client';
import { loadSound, playSound, cleanupSounds, SOUNDS } from '../utils/soundUtils';

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
  border: ${props => props.$canBuzzIn ? '10px solid white' : 'none'};
  transition: border 0.3s ease;
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
  position: relative;
  overflow: hidden;
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: ${props => props.$canBuzzIn ? 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)' : 'none'};
    pointer-events: none;
    z-index: 1;
  }
  
  ${props => props.$canBuzzIn && css`
    animation: ${pulse} 1.5s infinite;
  `}
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
  box-shadow: ${props => props.$active ? '0 0 20px rgba(255, 215, 0, 0.8)' : '0 5px 15px rgba(0, 0, 0, 0.3)'};
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

const AnswerTimerBar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 8px;
  background-color: ${props => props.$time < 2 ? '#f44336' : '#4CAF50'};
  width: ${props => (props.$time / 5) * 100}%;
  transition: width 0.1s linear, background-color 0.3s ease;
`;

const AnswerReveal = styled.div`
  margin-top: 20px;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  text-align: center;
`;

const AnswerLabel = styled.div`
  font-size: 1rem;
  margin-bottom: 5px;
  color: #f5cc5d;
`;

const AnswerText = styled.div`
  font-size: 1.4rem;
  font-weight: bold;
  color: #ffffff;
`;

// Add styled components for round transitions
const RoundTransition = styled.div`
  position: fixed;
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
  animation: ${fadeIn} 0.5s ease;
`;

const RoundTitle = styled.h1`
  font-size: 3rem;
  color: var(--jeopardy-value);
  margin: 0;
  text-align: center;
`;

const RoundSubtitle = styled.h2`
  font-size: 1.5rem;
  color: white;
  margin: 10px 0 30px;
  text-align: center;
`;

const RoundMessage = styled.p`
  font-size: 1.2rem;
  color: white;
  margin: 0 20px;
  text-align: center;
  max-width: 80%;
`;

// Add components for Final Jeopardy
const FinalJeopardyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  text-align: center;
`;

const FinalCategory = styled.div`
  font-size: 1.8rem;
  margin-bottom: 20px;
  text-transform: uppercase;
  color: var(--jeopardy-value);
`;

const FinalQuestion = styled.div`
  font-size: 1.5rem;
  margin: 40px 0;
  animation: ${fadeIn} 0.5s ease;
`;

const WagerInput = styled.input`
  padding: 15px;
  border-radius: 4px;
  border: 2px solid var(--jeopardy-value);
  font-size: 1.2rem;
  width: 100%;
  margin-bottom: 15px;
  text-align: center;
`;

const WagerInfo = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 15px;
`;

const WagerValue = styled.div`
  font-size: 1.2rem;
  color: ${props => props.$error ? '#f44336' : 'white'};
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
  const [showBuzzer, setShowBuzzer] = useState(false);
  const [earlyBuzzPenalty, setEarlyBuzzPenalty] = useState(false);
  const socketRef = useRef(null);
  const buzzerSound = useRef(null);
  const penaltyTimeoutRef = useRef(null);
  const [questionTimer, setQuestionTimer] = useState(5);
  const [answerTimer, setAnswerTimer] = useState(5);
  const [showTimer, setShowTimer] = useState(false);
  const questionTimerRef = useRef(null);
  const answerTimerRef = useRef(null);
  const correctSound = useRef(null);
  const incorrectSound = useRef(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [currentRound, setCurrentRound] = useState(null);
  const [showRoundTransition, setShowRoundTransition] = useState(false);
  const [roundTransitionMessage, setRoundTransitionMessage] = useState('');
  const [roundTransitionTitle, setRoundTransitionTitle] = useState('');
  const roundTransitionTimeoutRef = useRef(null);
  const [finalJeopardyState, setFinalJeopardyState] = useState({
    category: '',
    question: '',
    wager: 0,
    answer: '',
    showQuestion: false,
    showAnswer: false,
    wagerSubmitted: false,
    answerSubmitted: false,
    canParticipate: false,
    errorMessage: ''
  });

  useEffect(() => {
    console.log(`GamePlayer initializing for room: ${roomCode}`);
    
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
    
    // Preload all sounds
    buzzerSound.current = loadSound('BUZZER');
    correctSound.current = loadSound('CORRECT');
    incorrectSound.current = loadSound('INCORRECT');
    
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
        
        // If this is a "Question already revealed" error, display a more helpful message
        if (data.message && data.message.includes('Question already revealed')) {
          setError('That question has already been played. Please select another one.');
          
          // Clear the error after 3 seconds
          setTimeout(() => {
            setError('');
          }, 3000);
        } else {
          setError(data.message || 'An error occurred');
          setGameState('error');
        }
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
        setShowAnswer(false);
        setAnswerText('');
        setHasBuzzed(false);
        setJudged(null);
        setAnswer('');
        setEarlyBuzzPenalty(false);
        setShowBuzzer(true);
        setCanBuzz(false);
        
        // Reset timers completely when new question is selected
        setQuestionTimer(5);
        setAnswerTimer(5);
        setShowTimer(false);
        
        // Clear any existing timers
        if (questionTimerRef.current) {
          clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
        }
        if (answerTimerRef.current) {
          clearInterval(answerTimerRef.current);
          answerTimerRef.current = null;
        }
      });
      
      newSocket.on('buzzerReEnabled', (data) => {
        console.log('Buzzer re-enabled after incorrect answer:', data);
        if (!hasBuzzed) {
          setCanBuzz(true);
          
          // Play the buzz-in sound
          playSound('BUZZER').catch(e => console.log('Error playing buzzer sound:', e));
          
          // Start the timer
          startQuestionTimer();
        }
      });
      
      newSocket.on('buzzerEnabled', (data) => {
        console.log('Buzzer enabled:', data);
        setCanBuzz(true);
        
        // Play the buzz-in sound
        playSound('BUZZER').catch(e => console.log('Error playing buzzer sound:', e));
        
        // Start the timer with exact synchronization
        const serverTimestamp = data.timeStamp || Date.now();
        const currentTime = Date.now();
        const timeElapsed = currentTime - serverTimestamp;
        const remainingTime = Math.max(0, 5000 - timeElapsed) / 1000; // Convert to seconds
        
        // Start the timer with the correct remaining time
        startQuestionTimer(remainingTime);
      });
      
      newSocket.on('allPlayersAttempted', (data) => {
        console.log('All players have attempted the question:', data);
        setCanBuzz(false);
        setAnswerTimer(5);
        setShowTimer(false);
        
        // Clear any existing timers
        if (questionTimerRef.current) {
          clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
        }
        
        if (answerTimerRef.current) {
          clearInterval(answerTimerRef.current);
          answerTimerRef.current = null;
        }
        
        // Show the answer for all clients
        if (data.answer) {
          setShowAnswer(true);
          setAnswerText(data.answer);
        }
      });
      
      newSocket.on('earlyBuzz', (data) => {
        console.log('Early buzz penalty:', data);
        setEarlyBuzzPenalty(true);
        
        // Clear any existing timeout
        if (penaltyTimeoutRef.current) {
          clearTimeout(penaltyTimeoutRef.current);
        }
        
        // Set timeout to clear penalty after 0.2 seconds
        penaltyTimeoutRef.current = setTimeout(() => {
          setEarlyBuzzPenalty(false);
        }, 200);
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
        
        // Clear the answer timer
        if (answerTimerRef.current) {
          clearInterval(answerTimerRef.current);
          answerTimerRef.current = null;
        }
        
        setShowTimer(false);
        
        // Update this player's score if it's their answer
        if (data.playerId === newSocket.id) {
          setJudged(data.correct);
          setScore(data.score);
          
          // Play appropriate sound effect
          if (data.correct) {
            playSound('CORRECT').catch(e => console.log('Error playing correct sound:', e));
          } else {
            playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
          }
          
          // If correct, this player will select next question
          if (data.correct && data.selectingPlayerId === newSocket.id) {
            setCanSelectQuestion(true);
          }
        } else {
          // Still play sounds for other players' answers
          if (data.correct) {
            playSound('CORRECT').catch(e => console.log('Error playing correct sound:', e));
          } else {
            playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
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
        
        // Update the board state if it's provided
        if (data.board) {
          setBoard(data.board);
          console.log('Updated board state with revealed questions:', data.board);
        }
        
        if (data.selectingPlayerId === newSocket.id) {
          setCanSelectQuestion(true);
        } else {
          setCanSelectQuestion(false);
        }
      });

      // Add event for when time expires on a question
      newSocket.on('timeExpired', (data) => {
        console.log('Time expired for question:', data);
        setCanBuzz(false);
        
        // Play the incorrect sound
        playSound('INCORRECT').catch(e => console.log('Error playing incorrect sound:', e));
        
        // Display a message that time expired and show the answer
        setShowBuzzer(false);
        setJudged(false); // Show incorrect status with custom message
        
        // Show the answer for all clients, including mobile
        if (data.answer) {
          setShowAnswer(true);
          setAnswerText(data.answer);
        }
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
        setGameState('inProgress');
        
        // Update board and categories
        if (data.categories) setCategories(data.categories);
        if (data.board) setBoard(data.board);
        
        // Check if it's this player's turn to select a question
        if (data.selectingPlayerId === newSocket.id) {
          setCanSelectQuestion(true);
        } else {
          setCanSelectQuestion(false);
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
        
        // Check if this player is eligible to participate
        const canParticipate = data.eligiblePlayers?.includes(newSocket.id) || false;
        
        // Set up final jeopardy state
        setFinalJeopardyState(prev => ({
          ...prev,
          category: data.category,
          canParticipate,
          errorMessage: canParticipate ? '' : 'You are not eligible for Final Jeopardy (requires a positive score)'
        }));
        
        // Hide round transition after 5 seconds
        if (roundTransitionTimeoutRef.current) {
          clearTimeout(roundTransitionTimeoutRef.current);
        }
        
        roundTransitionTimeoutRef.current = setTimeout(() => {
          setShowRoundTransition(false);
        }, 5000);
      });
      
      newSocket.on('finalJeopardyQuestion', (data) => {
        console.log('Final Jeopardy question:', data);
        
        // Update final jeopardy state
        setFinalJeopardyState(prev => ({
          ...prev,
          question: data.question,
          showQuestion: true
        }));
      });
      
      newSocket.on('wagerReceived', (data) => {
        console.log('Wager received confirmation:', data);
        
        // Update final jeopardy state
        setFinalJeopardyState(prev => ({
          ...prev,
          wagerSubmitted: true
        }));
      });
      
      newSocket.on('answerReceived', (data) => {
        console.log('Final answer received confirmation:', data);
        
        // Update final jeopardy state
        setFinalJeopardyState(prev => ({
          ...prev,
          answerSubmitted: true
        }));
      });
      
      newSocket.on('finalAnswerRevealed', (data) => {
        console.log('Final answer revealed:', data);
        
        // Update final jeopardy state
        setFinalJeopardyState(prev => ({
          ...prev,
          showAnswer: true,
          answer: data.answer
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
        
        // Update score if it's this player
        if (data.playerId === newSocket.id) {
          setScore(data.score);
        }
        
        // Update players list with new scores
        setPlayers(prev => prev.map(p => 
          p.id === data.playerId ? { ...p, score: data.score } : p
        ));
      });
      
      newSocket.on('gameOver', (data) => {
        console.log('Game over:', data);
        
        // Show game over screen
        setRoundTransitionTitle('GAME OVER!');
        const winnerMessage = data.winner 
          ? `Winner: ${data.winner.name} with $${data.winner.score}` 
          : 'No winner';
        setRoundTransitionMessage(winnerMessage);
        setShowRoundTransition(true);
        
        // Update game state
        setGameState('gameOver');
        setCurrentRound('gameOver');
        
        // Update player list with final scores
        if (data.players) {
          setPlayers(data.players);
        }
        
        // Navigate to home after 8 seconds
        setTimeout(() => {
          navigate('/');
        }, 8000);
      });
    };
    
    setupSocketListeners();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Clean up all sounds
      cleanupSounds();
      
      if (penaltyTimeoutRef.current) {
        clearTimeout(penaltyTimeoutRef.current);
      }
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
      }
      if (answerTimerRef.current) {
        clearInterval(answerTimerRef.current);
      }
      if (roundTransitionTimeoutRef.current) {
        clearTimeout(roundTransitionTimeoutRef.current);
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
      playSound('BUZZER').catch(e => console.log('Error playing buzzer sound:', e));
      
      socket.emit('buzz', roomCode);
      setHasBuzzed(true);
      
      // Clear question timer
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
      
      // Start answer timer
      startAnswerTimer();
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
    if (!socket || !canSelectQuestion) return;
    
    // Double check if the question is already revealed
    const category = categories[categoryIndex];
    const isRevealed = board[category]?.[valueIndex]?.revealed === true;
    
    if (isRevealed) {
      setError('That question has already been played. Please select another one.');
      setTimeout(() => {
        setError('');
      }, 3000);
      return;
    }
    
    console.log(`Selecting question: category ${categoryIndex}, value ${valueIndex}`);
    socket.emit('selectQuestion', roomCode, categoryIndex, valueIndex);
    setCanSelectQuestion(false);
  };
  
  // Customize status message for timeouts
  const getStatusMessage = () => {
    if (judged === null) return '';
    if (judged === true) return 'Correct! You will select the next question.';
    if (hasBuzzed) return 'Sorry, that is incorrect.';
    return 'Time expired! No one answered correctly.';
  };
  
  // Add functions to handle the timers
  const startQuestionTimer = (startTime = 5) => {
    setQuestionTimer(startTime);
    setShowTimer(true);
    
    // Clear any existing timer
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
    }
    
    const startTimeMs = Date.now();
    const duration = startTime * 1000; // Convert to milliseconds
    
    // Set up interval to update timer every 33ms for smoother animation (roughly 30fps)
    questionTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeMs;
      const remaining = Math.max(0, duration - elapsed) / 1000; // Convert back to seconds
      
      setQuestionTimer(remaining);
      
      if (remaining <= 0) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
    }, 33);
  };

  const startAnswerTimer = () => {
    setAnswerTimer(5);
    setShowTimer(true);
    
    // Clear any existing timer
    if (answerTimerRef.current) {
      clearInterval(answerTimerRef.current);
    }
    
    const startTimeMs = Date.now();
    const duration = 5000; // 5 seconds in milliseconds
    
    // Set up interval to update timer every 33ms for smoother animation
    answerTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeMs;
      const remaining = Math.max(0, duration - elapsed) / 1000; // Convert back to seconds
      
      setAnswerTimer(remaining);
      
      if (remaining <= 0) {
        clearInterval(answerTimerRef.current);
        answerTimerRef.current = null;
      }
    }, 33);
  };
  
  // Add functions for Final Jeopardy
  const handleWagerSubmit = (e) => {
    e.preventDefault();
    
    // Validate wager amount
    const wagerAmount = parseInt(finalJeopardyState.wager);
    if (isNaN(wagerAmount) || wagerAmount < 0 || wagerAmount > score) {
      setFinalJeopardyState(prev => ({
        ...prev,
        errorMessage: `Wager must be between 0 and ${score}`
      }));
      return;
    }
    
    if (socket && socket.connected) {
      console.log(`Submitting wager: $${wagerAmount}`);
      socket.emit('finalJeopardyWager', {
        roomCode,
        wager: wagerAmount
      });
    }
  };
  
  const handleFinalAnswerSubmit = (e) => {
    e.preventDefault();
    
    if (!finalJeopardyState.answer.trim()) {
      setFinalJeopardyState(prev => ({
        ...prev,
        errorMessage: 'Please enter an answer'
      }));
      return;
    }
    
    if (socket && socket.connected) {
      console.log(`Submitting final answer: ${finalJeopardyState.answer}`);
      socket.emit('finalJeopardyAnswer', {
        roomCode,
        answer: finalJeopardyState.answer.trim()
      });
    }
  };
  
  // Add helper function to render Current Round info
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
    
    return roundDisplay;
  };
  
  // Add Final Jeopardy rendering
  const renderFinalJeopardy = () => {
    if (!finalJeopardyState.canParticipate) {
      return (
        <WaitingMessage>
          <h2>Final Jeopardy</h2>
          <p>{finalJeopardyState.errorMessage || "You are not eligible to play Final Jeopardy"}</p>
          <p>Watch the host screen for the final results!</p>
        </WaitingMessage>
      );
    }
    
    return (
      <FinalJeopardyContainer>
        <FinalCategory>{finalJeopardyState.category}</FinalCategory>
        
        {!finalJeopardyState.wagerSubmitted && !finalJeopardyState.showQuestion && (
          <form onSubmit={handleWagerSubmit} style={{ width: '100%', maxWidth: '300px' }}>
            <h3>Enter Your Wager</h3>
            <WagerInfo>
              <WagerValue>Your Score: ${score}</WagerValue>
              <WagerValue>Max Wager: ${score}</WagerValue>
            </WagerInfo>
            <WagerInput 
              type="number" 
              min="0" 
              max={score} 
              value={finalJeopardyState.wager}
              onChange={(e) => setFinalJeopardyState(prev => ({
                ...prev,
                wager: e.target.value,
                errorMessage: ''
              }))}
              placeholder="Enter your wager"
            />
            {finalJeopardyState.errorMessage && (
              <WagerValue $error={true}>{finalJeopardyState.errorMessage}</WagerValue>
            )}
            <SubmitBtn type="submit">Submit Wager</SubmitBtn>
          </form>
        )}
        
        {finalJeopardyState.wagerSubmitted && !finalJeopardyState.showQuestion && (
          <WaitingMessage>
            <h3>Wager Submitted</h3>
            <p>Waiting for all players to submit their wagers...</p>
          </WaitingMessage>
        )}
        
        {finalJeopardyState.showQuestion && !finalJeopardyState.answerSubmitted && (
          <>
            <FinalQuestion>{finalJeopardyState.question}</FinalQuestion>
            <form onSubmit={handleFinalAnswerSubmit} style={{ width: '100%', maxWidth: '300px' }}>
              <AnswerInput 
                type="text" 
                value={finalJeopardyState.answer}
                onChange={(e) => setFinalJeopardyState(prev => ({
                  ...prev,
                  answer: e.target.value,
                  errorMessage: ''
                }))}
                placeholder="Your answer..."
              />
              {finalJeopardyState.errorMessage && (
                <WagerValue $error={true}>{finalJeopardyState.errorMessage}</WagerValue>
              )}
              <SubmitBtn type="submit">Submit Answer</SubmitBtn>
            </form>
          </>
        )}
        
        {finalJeopardyState.answerSubmitted && !finalJeopardyState.showAnswer && (
          <WaitingMessage>
            <h3>Answer Submitted</h3>
            <p>Waiting for all players to submit their answers...</p>
          </WaitingMessage>
        )}
        
        {finalJeopardyState.showAnswer && (
          <WaitingMessage>
            <h3>The Correct Answer:</h3>
            <p style={{ fontSize: '1.5rem', color: 'var(--jeopardy-value)' }}>
              {finalJeopardyState.answer}
            </p>
            <p>The host is now judging all answers...</p>
          </WaitingMessage>
        )}
      </FinalJeopardyContainer>
    );
  };
  
  if (currentQuestion) {
    return (
      <GamePlayerContainer $canBuzzIn={canBuzz && !hasBuzzed}>
        <Header>
          <Title>Jeoparty! Player - {renderRoundInfo()}</Title>
          <PlayerInfo>
            {playerName || 'Guest'} - ${score}
          </PlayerInfo>
        </Header>
        
        <Question $canBuzzIn={canBuzz && !hasBuzzed}>
          <Category>{currentQuestion.category}</Category>
          <Value>${currentQuestion.value}</Value>
          {currentQuestion.text}
          {showTimer && (
            hasBuzzed 
              ? <AnswerTimerBar $time={answerTimer} /> 
              : <AnswerTimerBar $time={questionTimer} />
          )}
          {showAnswer && (
            <AnswerReveal>
              <AnswerLabel>The correct answer was:</AnswerLabel>
              <AnswerText>{answerText}</AnswerText>
            </AnswerReveal>
          )}
        </Question>
        
        {showBuzzer && !hasBuzzed ? (
          <BuzzerBtn 
            onClick={handleBuzz} 
            $active={canBuzz && !earlyBuzzPenalty}
            $disabled={!canBuzz || earlyBuzzPenalty}
            disabled={!canBuzz || earlyBuzzPenalty}
          >
            {earlyBuzzPenalty ? 'PENALTY' : 'BUZZ'}
          </BuzzerBtn>
        ) : (
          hasBuzzed && (
            judged === null ? (
              <form onSubmit={handleSubmitAnswer}>
                <AnswerInput 
                  type="text" 
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your answer..."
                  autoFocus
                />
                <SubmitBtn type="submit" disabled={!answer.trim()}>
                  Submit Answer
                </SubmitBtn>
              </form>
            ) : (
              <Status $correct={judged}>
                {getStatusMessage()}
              </Status>
            )
          )
        )}
        
        {judged === false && !hasBuzzed && (
          <Status $correct={false}>
            {getStatusMessage()}
          </Status>
        )}
        
        {/* Add round transition overlay */}
        {showRoundTransition && (
          <RoundTransition>
            <RoundTitle>{roundTransitionTitle}</RoundTitle>
            <RoundSubtitle>
              {currentRound === 'gameOver' ? 'Final Scores' : 'Get Ready!'}
            </RoundSubtitle>
            <RoundMessage>{roundTransitionMessage}</RoundMessage>
          </RoundTransition>
        )}
      </GamePlayerContainer>
    );
  }
  
  if (gameState === 'finalJeopardy') {
    return (
      <GamePlayerContainer>
        <Header>
          <Title>Jeoparty! Player - Final Jeopardy</Title>
          <PlayerInfo>
            {playerName || 'Guest'} - ${score}
          </PlayerInfo>
        </Header>
        
        {renderFinalJeopardy()}
        
        {/* Add round transition overlay */}
        {showRoundTransition && (
          <RoundTransition>
            <RoundTitle>{roundTransitionTitle}</RoundTitle>
            <RoundSubtitle>Get Ready!</RoundSubtitle>
            <RoundMessage>{roundTransitionMessage}</RoundMessage>
          </RoundTransition>
        )}
      </GamePlayerContainer>
    );
  }
  
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
        
        {/* Add round transition overlay */}
        {showRoundTransition && (
          <RoundTransition>
            <RoundTitle>{roundTransitionTitle}</RoundTitle>
            <RoundSubtitle>
              {currentRound === 'gameOver' ? 'Final Scores' : 'Get Ready!'}
            </RoundSubtitle>
            <RoundMessage>{roundTransitionMessage}</RoundMessage>
          </RoundTransition>
        )}
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
        
        {/* Add round transition overlay */}
        {showRoundTransition && (
          <RoundTransition>
            <RoundTitle>{roundTransitionTitle}</RoundTitle>
            <RoundSubtitle>Get Ready!</RoundSubtitle>
            <RoundMessage>{roundTransitionMessage}</RoundMessage>
          </RoundTransition>
        )}
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
        
        {/* Add round transition overlay */}
        {showRoundTransition && (
          <RoundTransition>
            <RoundTitle>{roundTransitionTitle}</RoundTitle>
            <RoundSubtitle>Get Ready!</RoundSubtitle>
            <RoundMessage>{roundTransitionMessage}</RoundMessage>
          </RoundTransition>
        )}
      </GamePlayerContainer>
    );
  }
  
  if (gameState === 'inProgress' || gameState === 'questionActive') {
    return (
      <GamePlayerContainer>
        <Header>
          <Title>Jeoparty! Player - {renderRoundInfo()}</Title>
          <PlayerInfo>
            {playerName || 'Guest'} - ${score}
          </PlayerInfo>
        </Header>
        
        {canSelectQuestion ? (
          <>
            <SelectingMessage>Your turn to select a question!</SelectingMessage>
            {error && (
              <Status $correct={false} style={{ marginBottom: '10px' }}>
                {error}
              </Status>
            )}
            <MiniBoard>
              <MiniCategoryRow>
                {categories.map((category, index) => (
                  <MiniCategory key={index}>{category}</MiniCategory>
                ))}
              </MiniCategoryRow>
              
              {[0, 1, 2, 3, 4].map(valueIndex => (
                <MiniGridRow key={valueIndex}>
                  {categories.map((category, categoryIndex) => {
                    // Check if the question has been revealed
                    const isRevealed = board[category]?.[valueIndex]?.revealed === true;
                    return (
                      <MiniCell 
                        key={`${categoryIndex}-${valueIndex}`}
                        onClick={() => !isRevealed && handleSelectQuestion(categoryIndex, valueIndex)}
                        $revealed={isRevealed}
                        disabled={isRevealed}
                        style={isRevealed ? { backgroundColor: 'rgba(0,0,0,0.5)', color: 'transparent' } : {}}
                      >
                        {isRevealed ? '' : `$${board[category]?.[valueIndex]?.value || (valueIndex + 1) * 200}`}
                      </MiniCell>
                    );
                  })}
                </MiniGridRow>
              ))}
            </MiniBoard>
          </>
        ) : (
          <WaitingMessage>
            <h2>Waiting for next question...</h2>
          </WaitingMessage>
        )}
        
        {/* Add round transition overlay */}
        {showRoundTransition && (
          <RoundTransition>
            <RoundTitle>{roundTransitionTitle}</RoundTitle>
            <RoundSubtitle>Get Ready!</RoundSubtitle>
            <RoundMessage>{roundTransitionMessage}</RoundMessage>
          </RoundTransition>
        )}
      </GamePlayerContainer>
    );
  }
  
  return (
    <GamePlayerContainer>
      <Header>
        <Title>Jeoparty! Player - {renderRoundInfo()}</Title>
        <PlayerInfo>
          {playerName || 'Guest'} - ${score}
        </PlayerInfo>
      </Header>
      <WaitingMessage>
        <h2>Waiting for game action...</h2>
      </WaitingMessage>
      
      {/* Add round transition overlay */}
      {showRoundTransition && (
        <RoundTransition>
          <RoundTitle>{roundTransitionTitle}</RoundTitle>
          <RoundSubtitle>Get Ready!</RoundSubtitle>
          <RoundMessage>{roundTransitionMessage}</RoundMessage>
        </RoundTransition>
      )}
    </GamePlayerContainer>
  );
};

export default GamePlayer; 
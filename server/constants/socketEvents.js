// Socket event names used throughout the application
const SOCKET_EVENTS = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',

  // Game creation and joining
  CREATE_GAME: 'create-game',
  JOIN_GAME: 'join-game',
  GAME_CREATED: 'gameCreated',
  GAME_JOINED: 'gameJoined',
  GAME_NOT_FOUND: 'gameNotFound',
  
  // Player events
  PLAYER_JOINED: 'playerJoined',
  PLAYER_DISCONNECTED: 'playerDisconnected',
  PLAYER_REJOINED: 'playerRejoined',
  PLAYER_BUZZED: 'playerBuzzed',
  PLAYER_ANSWERED: 'playerAnswered',
  
  // Game state events
  GAME_STARTED: 'gameStarted',
  GAME_ENDED: 'gameEnded',
  GAME_OVER: 'gameOver',
  
  // Question events
  QUESTION_SELECTED: 'questionSelected',
  BUZZ: 'buzz',
  BUZZER_REENABLED: 'buzzerReEnabled',
  ANSWER_JUDGED: 'answerJudged',
  RETURN_TO_BOARD: 'returnToBoard',

  // Host events
  HOST_DISCONNECTED: 'hostDisconnected',
  
  // Error events
  ERROR: 'error'
};

module.exports = SOCKET_EVENTS; 
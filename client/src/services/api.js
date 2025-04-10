import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5005',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 30000, // 30 second timeout
  withCredentials: true // Important for CORS
});

// Add request interceptor for debugging
api.interceptors.request.use(
  config => {
    console.log(`[API] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`, config.data || '');
    return config;
  },
  error => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  response => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] Response:`, response.data);
    }
    return response;
  },
  error => {
    if (error.code === 'ECONNABORTED') {
      console.error('[API] Request timed out');
      return Promise.reject(new Error('Request timed out. Please try again.'));
    }
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('[API] Response error:', {
        data: error.response.data,
        status: error.response.status,
        headers: error.response.headers
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('[API] No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('[API] Error setting up request:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export const createGame = async (data) => {
  const response = await api.post('/api/games/create', data);
  return response.data;
};

export const joinGame = async (roomCode) => {
  const response = await api.get(`/api/games/${roomCode}`);
  return response.data;
};

export const getGameDates = async (startYear, endYear) => {
  const response = await api.get('/api/jeopardy/dates', {
    params: { startYear, endYear }
  });
  return response.data;
};

export default api; 
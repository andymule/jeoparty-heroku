/**
 * Utility for generating unique room codes for game sessions
 */

// Letters that are visually distinct and easy to type/read
const ALLOWED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a random room code for game sessions
 * Uses characters that are easy to distinguish visually and read aloud
 * @param {number} length Length of the code to generate
 * @returns {string} Random room code
 */
function generateRoomCode(length = 4) {
  let result = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * ALLOWED_CHARS.length);
    result += ALLOWED_CHARS.charAt(randomIndex);
  }
  
  return result;
}

module.exports = {
  generateRoomCode
}; 
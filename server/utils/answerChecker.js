const stringSimilarity = require('string-similarity');
const natural = require('natural');
const { WordTokenizer, PorterStemmer } = natural;
const tokenizer = new WordTokenizer();

/**
 * Sanitizes clue text before displaying
 * 
 * @param {string} clueText - The clue text to sanitize
 * @returns {string} Sanitized clue text
 */
function sanitizeClue(clueText) {
  if (!clueText) return clueText;
  
  // Remove content inside parentheses (often show commentary)
  let sanitized = clueText.replace(/\([^)]*\)/g, '').trim();
  
  // Remove forward and backslashes
  sanitized = sanitized.replace(/[/\\]/g, ' ').trim();
  
  // Clean up multiple spaces that might result from removals
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

/**
 * Normalize an answer for comparison
 * 
 * @param {string} answer - The answer to normalize
 * @returns {string} Normalized answer
 */
function normalizeAnswer(answer) {
  return answer.toString()
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove ALL punctuation including \ / " ' etc.
    .replace(/\s+/g, ' ')    // Replace multiple spaces with a single space
    .trim();
}

/**
 * Check if user's answer is correct using permissive matching
 * 
 * @param {string} userAnswer - The answer provided by the user
 * @param {string} correctAnswer - The correct answer from the database
 * @returns {boolean} Whether the answer is considered correct
 */
function checkAnswerCorrectness(userAnswer, correctAnswer) {
  if (!userAnswer || !correctAnswer) return false;
  
  const normalizedUserAnswer = normalizeAnswer(userAnswer);
  const normalizedCorrectAnswer = normalizeAnswer(correctAnswer);
  
  // Log for debugging
  console.log(`Comparing: "${normalizedUserAnswer}" with "${normalizedCorrectAnswer}"`);
  
  // Exact match after normalization
  if (normalizedUserAnswer === normalizedCorrectAnswer) {
    console.log('Exact match after normalization');
    return true;
  }
  
  // Check if correct answer contains the user's answer (useful for partial answers)
  if (normalizedCorrectAnswer.includes(normalizedUserAnswer) && 
      normalizedUserAnswer.length > normalizedCorrectAnswer.length * 0.5) {
    console.log('User answer is substantial part of correct answer');
    return true;
  }
  
  // Check if user answer contains the correct answer (with minimum length)
  if (normalizedUserAnswer.includes(normalizedCorrectAnswer) && 
      normalizedCorrectAnswer.length > 3) {
    console.log('User answer contains the correct answer');
    return true;
  }
  
  // Tokenize and stem both answers for more robust comparison
  const stemWord = (word) => PorterStemmer.stem(word);
  const userTokens = tokenizer.tokenize(normalizedUserAnswer).map(stemWord);
  const correctTokens = tokenizer.tokenize(normalizedCorrectAnswer).map(stemWord);
  
  // Check for matching stems
  const userStemSet = new Set(userTokens);
  const correctStemSet = new Set(correctTokens);
  
  // Calculate the percentage of matching stems
  const intersection = [...correctStemSet].filter(stem => userStemSet.has(stem));
  const matchPercentage = correctStemSet.size > 0 ? 
    intersection.length / correctStemSet.size : 0;
  
  // If many stems match, it's probably correct
  if (matchPercentage >= 0.7 && correctStemSet.size >= 2) {
    console.log(`High stem match percentage: ${matchPercentage.toFixed(2)}`);
    return true;
  }
  
  // Check if answer contains important keywords
  const correctWords = normalizedCorrectAnswer.split(' ');
  const userWords = normalizedUserAnswer.split(' ');
  
  // For short answers (1-2 words), check if user got the main word
  if (correctWords.length <= 2) {
    // If it's a very short answer, be more permissive
    if (correctWords.some(word => userWords.includes(word) && word.length > 3)) {
      console.log('User got main word in a short answer');
      return true;
    }
  }
  
  // For longer answers, count how many significant words match
  if (correctWords.length > 2) {
    const significantWords = correctWords.filter(word => word.length > 3);
    const matchedWords = significantWords.filter(word => userWords.includes(word));
    if (matchedWords.length >= Math.ceil(significantWords.length * 0.6)) {
      console.log('User matched significant keywords');
      return true;
    }
  }
  
  // Use string similarity for fuzzy matching
  const similarity = stringSimilarity.compareTwoStrings(normalizedUserAnswer, normalizedCorrectAnswer);
  console.log(`String similarity score: ${similarity}`);
  
  // More permissive threshold - 0.65 means answers are 65% similar
  if (similarity >= 0.65) {
    console.log('Answer is very similar');
    return true;
  }
  
  // Special case: names may have different formats (e.g., "John Doe" vs "Doe, John")
  if (correctWords.length === 2 && userWords.length === 2) {
    // Check if the words are the same but in different order
    if (correctWords[0] === userWords[1] && correctWords[1] === userWords[0]) {
      console.log('Name in different format');
      return true;
    }
  }
  
  // Special case: "What is" and "Who is" can be interchanged
  const stripPrefix = (text) => {
    return text.replace(/^(what|who)\s+is\s+/i, '').trim();
  };
  
  const userStripped = stripPrefix(normalizedUserAnswer);
  const correctStripped = stripPrefix(normalizedCorrectAnswer);
  
  if (userStripped === correctStripped || 
      stringSimilarity.compareTwoStrings(userStripped, correctStripped) >= 0.8) {
    console.log('Answers match after removing what/who prefix');
    return true;
  }
  
  return false;
}

module.exports = {
  sanitizeClue,
  normalizeAnswer,
  checkAnswerCorrectness
}; 
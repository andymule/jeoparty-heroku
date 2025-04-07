import React from 'react';
import styled from 'styled-components';

const QuestionContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 600px;
  background-color: var(--jeopardy-blue);
  border: 5px solid #000;
  padding: 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
`;

const Category = styled.div`
  color: var(--jeopardy-category);
  font-size: 1.5rem;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 20px;
  text-align: center;
`;

const Value = styled.div`
  color: var(--jeopardy-value);
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 40px;
`;

const QuestionText = styled.div`
  color: white;
  font-size: 2.5rem;
  text-align: center;
  margin-bottom: 40px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const BuzzStatus = styled.div`
  margin-top: 40px;
  font-size: 1.5rem;
  color: white;
  text-align: center;
`;

const PlayerInfo = styled.div`
  font-size: 1.2rem;
  color: ${props => props.$highlighted ? 'var(--jeopardy-yellow)' : 'white'};
  font-weight: ${props => props.$highlighted ? 'bold' : 'normal'};
`;

const Answer = styled.div`
  font-size: 1.2rem;
  color: white;
  margin-top: 10px;
  font-style: italic;
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 20px;
  margin-top: 30px;
`;

const Button = styled.button`
  padding: 12px 24px;
  background-color: ${props => props.$correct ? 'var(--jeopardy-correct)' : 
                              props.$incorrect ? 'var(--jeopardy-incorrect)' : 'white'};
  color: ${props => (props.$correct || props.$incorrect) ? 'white' : '#333'};
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    opacity: 0.9;
  }
`;

const QuestionDisplay = ({ question, buzzedPlayer, playerAnswer, onJudgeAnswer }) => {
  return (
    <QuestionContainer>
      <Category>{question.category}</Category>
      <Value>${question.value}</Value>
      
      <QuestionText>{question.text}</QuestionText>
      
      {buzzedPlayer ? (
        <>
          <BuzzStatus>
            <PlayerInfo $highlighted>{buzzedPlayer.name} buzzed in!</PlayerInfo>
            {playerAnswer && (
              <Answer>Answer: "{playerAnswer}"</Answer>
            )}
          </BuzzStatus>
          
          {playerAnswer && (
            <ControlsContainer>
              <Button $correct onClick={() => onJudgeAnswer(true)}>
                Correct
              </Button>
              <Button $incorrect onClick={() => onJudgeAnswer(false)}>
                Incorrect
              </Button>
            </ControlsContainer>
          )}
        </>
      ) : (
        <BuzzStatus>Waiting for players to buzz in...</BuzzStatus>
      )}
    </QuestionContainer>
  );
};

export default QuestionDisplay; 
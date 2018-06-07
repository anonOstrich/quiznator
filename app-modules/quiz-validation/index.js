const  _ = require('lodash')
const quizTypes = require('app-modules/constants/quiz-types');
const { precise_round } = require('app-modules/utils/math-utils')

const IGNORE_LIST = [
  '5aec479606ee0000047c5967', // ex 3
  '5aec60b006ee0000047c599a', // 20
  '5aec5e7c06ee0000047c5995', // 8
  '5aec626406ee0000047c599e' // 17
]

function validateAnswer(data, ignoreList = []) {
  // TODO: some checking
  const { quiz, answer, peerReviews } = data
  // TODO: check for rejected answer
  const answerData = answer[0].data
  const { regex, multi, rightAnswer } = quiz.data.meta
  const { items, choices } = quiz.data 

  let points = 0
  let normalizedPoints = 0

  const maxPoints = Math.max(items ? items.length : 0, 1)

  switch (quiz.type) {
    case quizTypes.ESSAY:
      points = answer[0].confirmed ? 1 : 0
      normalizedPoints = points
      break
    case quizTypes.RADIO_MATRIX:
      points = multi
        ? (items.map(item => {
            const userAnswer = typeof answerData[item.id] === 'string' ? [answerData[item.id]] : answerData[item.id]

            if (!answerData[item.id] || (!!answerData[item.id] && answerData[item.id].length === 0)) {
              return false
            } 
            return userAnswer
              .map(k => (rightAnswer[item.id] || []).indexOf(k) >= 0)
              .every(v => !!v)
            && (rightAnswer[item.id] || [])
              .map(k => userAnswer.indexOf(k) >= 0)
              .every(v => !!v)
          }).filter(v => v).length)
        : (items.map(item => {
          if (!answerData[item.id] || (!!answerData[item.id] && answerData[item.id].length === 0)) {
            return false
          } 
          return (rightAnswer[item.id] || []).indexOf(answerData[item.id]) >= 0
        }).filter(v => v).length)
      normalizedPoints = points / maxPoints
      break
    case quizTypes.MULTIPLE_CHOICE:
      points = rightAnswer.some(o => o === answerData) ? 1 : 0
      normalizedPoints = points
      break
    case quizTypes.OPEN:
      if (regex) {
        try {
          let re = new RegExp(rightAnswer)
          points = !!re.exec(answerData.trim().toLowerCase()) ? 1 : 0
        } catch(err) {
          // points 0
        }
      } else {
        points = answerData.trim().toLowerCase() === rightAnswer.trim().toLowerCase() ? 1 : 0
      }
      normalizedPoints = points
      break
    case quizTypes.MULTIPLE_OPEN:
      if (regex) {
        points = items.map(item => {
          try {
            let re = new RegExp(rightAnswer[item.id])
            return !!re.exec(answerData[item.id].trim().toLowerCase())
          } catch(err) {
            return false
          }
        }).filter(v => v).length              
      } else {
        points = items.map(item => 
          answerData[item.id].trim().toLowerCase() === rightAnswer[item.id].trim().toLowerCase()
        ).filter(v => v).length
      }
      normalizedPoints = points / maxPoints
      break
    default:
      break
  }

  if (_.includes(ignoreList, quiz._id.toString())) {
    points = maxPoints
    normalizedPoints = 1
  }

  const returnObject = {
    quiz,
    answer,
    peerReviews,
    validation: {
      points,
      maxPoints,
      normalizedPoints: precise_round(normalizedPoints, 2)
    }
  }  

  return returnObject
}

function validateProgress(progress, ignoreList = []) {
  let totalPoints = 0
  let totalMaxPoints = 0
  let totalCompletedMaxPoints = 0
  let totalNormalizedPoints = 0

  let answered = []
  let notAnswered = []

  progress.answered && progress.answered.forEach(entry => {
    const validatedAnswer = validateAnswer(entry, ignoreList)

    totalPoints += validatedAnswer.validation.points
    totalMaxPoints += validatedAnswer.validation.maxPoints
    totalCompletedMaxPoints += validatedAnswer.validation.maxPoints
    totalNormalizedPoints += validatedAnswer.validation.normalizedPoints

    answered.push(validatedAnswer)
  })
  
  progress.notAnswered && progress.notAnswered.map(entry => {
    const { quiz, peerReviews } = entry
    const { items } = quiz.data

    const maxPoints = Math.max(items ? items.length : 0, 1)
        
    totalMaxPoints += maxPoints

    notAnswered.push({
      quiz,
      peerReviews,
      validation: {
        maxPoints
      }
    })
  })

  const maxNormalizedPoints = (progress.answered || []).length + (progress.notAnswered || []).length 
  const maxCompletedNormalizedPoints = (progress.answered || []).length
  const confirmedAmount = (progress.answered || []).filter(entry => entry.answer[0].confirmed).length

  const progressWithValidation = {
    answered,
    notAnswered,
    validation: {
      points: totalPoints,
      maxPoints: totalMaxPoints,
      maxCompletedPoints: totalCompletedMaxPoints,
      confirmedAmount,
      normalizedPoints: precise_round(totalNormalizedPoints, 2),
      maxNormalizedPoints,
      maxCompletedNormalizedPoints,
      progress: precise_round(confirmedAmount / maxNormalizedPoints * 100, 2),
    }
  }

  return progressWithValidation
}

module.exports = { validateAnswer, validateProgress }
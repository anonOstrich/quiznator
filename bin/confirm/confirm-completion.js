#!/usr/bin/env node

const resolve = require('path').resolve
require('app-module-path').addPath(__dirname + '/../../');

require('dotenv').config({ path: resolve('../..', '.env'), silent: true })

const { config } = require('./constants/config')
const { selectConfig } = require('app-modules/constants/course-config')
const Promise = require('bluebird');
const _ = require('lodash');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird').Promise
const async = require('async')

const quizTypes = require('app-modules/constants/quiz-types')
const { validateAnswer, validateProgress } = require('app-modules/quiz-validation')

const Quiz = require('app-modules/models/quiz')
const QuizAnswer = require('app-modules/models/quiz-answer')
const PeerReview = require('app-modules/models/peer-review')
const CourseState = require('app-modules/models/course-state')

const { connect, fetchQuizIds } = require('./utils/quiznator-tools')
const { median, calculatePercentage, printProgress } = require('./utils/mathutils')
const { precise_round } = require('app-modules/utils/math-utils')
const sleep = require('sleep')

sleep.sleep(5)

connect()

var args = process.argv.slice(2)

const courseConfig = selectConfig(args[args.length - 1])

/*
  - course completion status
  - peer reviews pending? not updated here
  -
*/
function getProgressWithValidation(data) {
  const { answererId, answers, quizzes } = data

  const quizIds = quizzes.map(quiz => quiz._id)

  let essaysAwaitingPeerReviewsGiven = []
  let latestAnswerDate = 0

  const answerQuizIds = Array.from(answers.keys()) // map(answer => answer.quizId.toString());

  const isAnswered = (entry) => ~answerQuizIds.indexOf(entry.quiz._id.toString())
  const isDeprecated = (entry) => _.get(entry, 'answer[0].deprecated', false)
  const isRejected = (entry) => _.get(entry, 'answer[0].rejected', false)

  const progress = _.groupBy(quizzes.map(quiz => {
    let answersForQuiz = answers.get(quiz._id.toString()) || []
    let answer = answersForQuiz //answers[quiz._id] || []

    if (answersForQuiz.length > 0) {
      let newestDate = 0

      newestDate = answer[0].createdAt

      // answers now come sorted by date from backend

      /*       answersForQuiz.forEach(answerForQuiz => {
        if (answerForQuiz.updatedAt > newestDate) {
          answer = [answerForQuiz] // expecting [0]...
          newestDate = answerForQuiz.updatedAt
        }
      }) */
      latestAnswerDate = Math.max(newestDate, latestAnswerDate)
    }

    let returnObject = {
      quiz,
      answer: answers && answer.length > 0 ? answer : [],
    }

    return returnObject
  }), entry => {
    if (isRejected(entry) && !isDeprecated(entry)) { return 'rejected' }
    if (isAnswered(entry) && !isDeprecated(entry)) { return 'answered' }

    return 'notAnswered'
  })

  if (isNaN(latestAnswerDate)) { // hmm
    latestAnswerDate = 0
  }

  let returnObject = {
    answererId,
    essaysAwaitingPeerReviewsGiven,
    latestAnswerDate
  }

  returnObject = Object.assign(
    {},
    returnObject,
    validateProgress(progress))

  return returnObject
}

function updateCompletion(data) {
  return new Promise((resolve, reject) => {
    const { answererId, scoreObject, completionAnswersDate, partialCompleted } = data

    const completed =
      scoreObject.progress >= courseConfig.MINIMUM_PROGRESS_TO_PASS &&
      scoreObject.score >= courseConfig.MINIMUM_SCORE_TO_PASS

    if (partialCompleted !== completed) {
      console.log('Answerer', answererId, 'has differing states for completion')
    }

    CourseState.findOne( // andupdate
      { answererId,
        courseId: courseConfig.COURSE_ID
      }
    ).then(courseState => {
      let completionDate

      if (!_.get(courseState, 'completion.completed') && completed) {
        // either new coursestate or hadn't previously completed but has now
        completionDate = Date.now()
      } else {
        completionDate = _.get(courseState, 'completion.completionDate', null)
      }

      let completionData = {
        data: scoreObject,
        completed,
        completionDate,
        completionAnswersDate,
        confirmationSent: false
      }


      if (!courseState) {
        const newCourseState = CourseState({
          answererId,
          courseId: courseConfig.COURSE_ID,
          completion: completionData
        })

        return newCourseState.save()
      }

      if (!_.get(courseState, 'completion.completed')) {
        // don't change data if confirmation already sent
        courseState.completion = completionData

        return courseState.save()
      }

      // let's update the completion answer date at least
      courseState.completion.completionAnswersDate = completionAnswersDate

      return courseState.save()
    })
      .then(state => resolve(state))
      .catch(err => reject(err))
  })
}

const mapAnswers = (answers) => {
  const answersForAnswerer = new Map()

  answers.forEach(answer => {
    if (!answersForAnswerer.has(answer.answererId)) {
      answersForAnswerer.set(answer.answererId, new Map())
    }
    if (!answersForAnswerer.get(answer.answererId).has(answer.quizId.toString())) {
      answersForAnswerer.get(answer.answererId).set(answer.quizId.toString(), [])
    }
    let value = answersForAnswerer.get(answer.answererId).get(answer.quizId.toString())
    value.push(answer)
    answersForAnswerer.get(answer.answererId).set(answer.quizId.toString(), value)
  })

  return answersForAnswerer
}

const mapEntry = (entry) => ({
  quizId: entry.quiz._id,
  answerId: entry.answer[0]._id,
  points: entry.validation.points,
  maxPoints: entry.validation.maxPoints,
  normalizedPoints: entry.validation.normalizedPoints,
  confirmed: entry.answer[0].confirmed,
  rejected: entry.answer[0].rejected,
  deprecated: entry.answer[0].deprecated,
  peerReviewCount: entry.answer[0].peerReviewCount,
  spamFlags: entry.answer[0].spamFlags,
  type: entry.quiz.type,
  createdAt: entry.answer[0].createdAt,
  updatedAt: entry.answer[0].updatedAt,
  earliestCreatedAt: entry.answer[entry.answer.length - 1].createdAt
})

const getCompleted = async () => {
  const quizIds = await fetchQuizIds(courseConfig.COURSE_ID)

  console.log('initing...')

  const quizIdsMap = quizIds.map(quizId => mongoose.Types.ObjectId(quizId))

  const answers = await QuizAnswer
    .find({ quizId: { $in: quizIdsMap }, createdAt: { $gte: new Date(new Date() - 2592000000 * 12)}})
    .sort({ createdAt: -1 })
    .exec()

  const quizzes = await Quiz.findAnswerable({ _id: { $in: quizIdsMap }}).exec()
  const countableQuizIds = quizzes.filter(quiz => !_.includes(quiz.tags, 'ignore')).map(quiz => quiz._id.toString())

  const maxCountableNormalizedPoints = countableQuizIds.length

  const answererIds = _.uniq(answers.map(answer => answer.answererId))
  //const quizIds = _.uniq(answers.map(answer => answer._doc.quizId.toString()))

  console.log(answererIds.length + ' unique answerers, '+ answers.length + ' answers to trawl through for ' + courseConfig.COURSE_ID)

  const answersForSelectedAnswerers = await QuizAnswer
  .find({ quizId: { $in: quizIdsMap }, answererId: { $in: answererIds }})
  .sort({ createdAt: -1 })
  .exec()

  let answersForAnswerer = mapAnswers(answersForSelectedAnswerers)

  console.log('Ready initing, start crunching')

  let count = 0

  const completed = await Promise.all(answererIds.map(async (answererId) => {
    //console.log(answererId)
    const currentAnswers = answersForAnswerer.get(answererId)

    const progress = getProgressWithValidation({
      answererId,
      answers: currentAnswers,
      quizzes
    })

    count += 1
    const percentage = precise_round(count / answererIds.length * 100, 0)
    /*           if (!_.includes(percentagesShown, percentage)) {
          percentagesShown.push(percentage)
          printProgress(percentage)
        } */

    const score = calculatePercentage(progress.validation.normalizedPoints, progress.validation.maxNormalizedPoints)
    const pointsPercentage = calculatePercentage(progress.validation.points, progress.validation.maxPoints)

    // go through answers in submission order and determine the date when the answerer
    // could have been potentially have completed

    const answerValidation = progress.answered.map(entry => mapEntry(entry))

    const sortedAnswers = _.sortBy(answerValidation, 'earliestCreatedAt') //createdAt

    let partialNormalizedPoints = 0
    let partialConfirmedAmount = 0
    let partialCompleted = false
    let completionAnswersDate = null

    let prevDate = 0

    if (score >= courseConfig.MINIMUM_SCORE_TO_PASS) {
      sortedAnswers.some((entry => {
        if (prevDate > entry.earliestCreatedAt) { // createdAt
          return Promise.reject(new Error('answer sorting is borked?'))
        }

        prevDate = entry.earliestCreatedAt // createdAt

        if (_.includes(countableQuizIds, entry.quizId.toString())) {
          partialNormalizedPoints += entry.normalizedPoints
          partialConfirmedAmount += entry.confirmed ? 1 : 0
        }

        let partialProgress = calculatePercentage(partialConfirmedAmount, maxCountableNormalizedPoints)
        let partialScore = calculatePercentage(partialNormalizedPoints, maxCountableNormalizedPoints)

        if (partialProgress > 100 || partialScore > 100) {
          return Promise.reject(new Error('your progress/score calculations are wrong', progress, partialProgress, partialScore))
        }

        if (partialProgress >= courseConfig.MINIMUM_PROGRESS_TO_PASS) {
          //                partialScore >= config.MINIMUM_SCORE_TO_PASS) {
          completionAnswersDate = entry.earliestCreatedAt // createdAt
          partialCompleted = true

          if (partialProgress > progress.validation.progress || partialScore > score) {
            console.log('%s official p/s %d/%d partial p/s %d/%d', answererId, progress.validation.progress, score, partialProgress, partialScore)
          }

          return true
        }

        return false
      }))
    }

    const scoreObject = {
      answererId,
      answerValidation,
      points: progress.validation.points,
      maxPoints: progress.validation.maxPoints,
      normalizedPoints: progress.validation.normalizedPoints,
      maxNormalizedPoints: progress.validation.maxNormalizedPoints,
      maxCompletedPoints: progress.validation.maxCompletedPoints,
      maxCompletedNormalizedPoints: progress.validation.maxCompletedNormalizedPoints,
      progress: progress.validation.progress,
      score,
      pointsPercentage,
      date: Date.now(),
      latestAnswerDate: progress.latestAnswerDate
    }


    //console.log('completion:', answererId)

    try {
      await updateCompletion({
        answererId,
        scoreObject,
        completionAnswersDate,
        partialCompleted
      })
    } catch (err) {
      throw err
    }

    if (progress.validation.progress >= courseConfig.MINIMUM_PROGRESS_TO_PASS &&
          score >= courseConfig.MINIMUM_SCORE_TO_PASS) {
      return scoreObject
    }

    return
  }))
    .then(results => (results || []).filter(v => !!v))
    .catch(err => Promise.reject(err))

  return completed
/*     })
    .then(completed => Promise.resolve(completed))
    .catch(err => Promise.reject(err)) */
}

setTimeout(() => {
  getCompleted()
    .then(response => {
    /*   console.log('\n', JSON.stringify(response)) */
      console.log(response.length + ' completed')
      // process.exit(0)
    })
    .catch(err => {
      console.error('error', err)
      process.exit(1)
    })
}, 2000)


setInterval(() => {}, 1000)

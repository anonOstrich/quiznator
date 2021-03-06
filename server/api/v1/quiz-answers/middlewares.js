const co = require('co');

const Quiz = require('app-modules/models/quiz');
const QuizAnswer = require('app-modules/models/quiz-answer');
const { ForbiddenError, InvalidRequestError, NotFoundError } = require('app-modules/errors');

const middlewares = {
  getQuizAnswers,
  getQuizsAnswersBatch,
  updateQuizAnswerConfirmation,
  updateQuizAnswerRejection,
  updateQuizAnswerDeprecation
};

function updateQuizAnswerConfirmation() {
  return (req, res, next) => {
    co(function* () {
      const { confirmed } = req.body;
      const { id } = req.params;

      const answer = yield QuizAnswer.findById(id);

      if (!answer) {
        return Promise.reject('Couldn\'t find the quiz answer');
      }

      answer.confirmed = !!confirmed;

      yield answer.save();

      req.answer = answer;

      return next();
    })
      .catch(next);
  }
}

function updateQuizAnswerRejection() {
  return (req, res, next) => {
    co(function* () {
      const { rejected } = req.body;
      const { id } = req.params;

      const answer = yield QuizAnswer.findById(id);

      if (!answer) {
        return Promise.reject('Couldn\'t find the quiz answer');
      }

      answer.rejected = !!rejected;

      yield answer.save();

      req.answer = answer;

      return next();
    })
      .catch(next);
  }
}

function updateQuizAnswerDeprecation() {
  return (req, res, next) => {
    co(function* () {
      const { deprecated } = req.body;
      const { id } = req.params;

      const answer = yield QuizAnswer.findById(id);

      if (!answer) {
        return Promise.reject('Couldn\'t find the quiz answer');
      }

      answer.deprecated = !!deprecated;

      yield answer.save();

      req.answer = answer;

      return next();
    })
      .catch(next);
  }
}

function getQuizAnswers() {
  return (req, res, next) => {
    co(function* () {
      const { tags, quizzes, answerers } = req.query;

      let query = null;

      let quizIds = [];

      if (quizzes) {
        const targetQuizzes = yield Quiz.find({ _id: { $in: quizzes.split(',') } });

        const canInspectAnswers = targetQuizzes.map(quiz => req.user.canInspectAnswersOfQuiz(quiz)).every(can => !!can);

        if (canInspectAnswers) {
          quizIds = [...quizIds, ...quizzes];
        } else {
          yield Promise.reject(new ForbiddenError());
        }
      }
      
      if (tags) {
        const targetQuizzes = yield Quiz.whereTags(tags.split(',')).exec();

        quizIds = [...quizIds, ...targetQuizzes.map(quiz => quiz._id.toString())];
      }

      if (answerers) {
        query = Object.assign({}, query || {}, { answererId: { $in: answerers.split(',') } });
      }

      if (quizIds.length > 0) {
        query = Object.assign({}, query || {}, { quizId: { $in: quizIds } });
      }

      if (!query) {
        yield Promise.reject(new InvalidRequestError('No query provided'));
      }

      const answers = yield QuizAnswer.find(query);

      res.json(answers);
    })
      .catch(next);
  }
}

function getQuizsAnswersBatch(options) {
  return (req, res, next) => {
    const answererId = options.getAnswererId(req)
    const body = options.getBody(req)

    let quizIds = body.quizIds

    let pipeline = [
      { $match: { answererId, quizId: { $in: quizIds }}},
      { $sort: { createdAt: - 1 }},
      { $group: { 
        _id: '$quizId', 
        data: { $first: '$data' }, 
        quizId: { $first: '$quizId' }, 
        answererId: { $first: '$answererId' }, 
        answerId: { $first: '$_id' }, 
        createdAt: { $first: '$createdAt' },
        updatedAt: { $first: '$updatedAt' },
        confirmed: { $first: '$confirmed' },
        rejected: { $first: '$rejected' },
        peerReviewCount: { $first: '$peerReviewCount' },
        spamFlags: { $first: '$spamFlags' }
      }},
    ].filter(p => !!p)      

    QuizAnswer.aggregate(pipeline)
      .then(data => {
        req.quizAnswers = res.json(data.map(doc => ({ 
          _id: doc.answerId, 
          answererId: doc.answererId, 
          data: doc.data, 
          quizId: doc.quizId, 
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          confirmed: doc.confirmed,
          rejected: doc.rejected,
          peerReviewCount: doc.peerReviewCount,
          spamFlags: doc.spamFlags 
        })))
        return next()
      })
  }
}

module.exports = middlewares;
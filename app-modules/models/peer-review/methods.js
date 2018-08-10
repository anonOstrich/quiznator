const Promise = require('bluebird');

const mongoose = require('mongoose');
const _ = require('lodash')
const errors = require('app-modules/errors');

const QuizAnswer = require('app-modules/models/quiz-answer')

module.exports = schema => {
  schema.statics.findPeerReviewsForAnswerer = function(options) {
    // find peer reviews for given quiz and given answerer as giver
    return this.find({ 
      quizId: options.quizId, 
      giverAnswererId: options.answererId 
    }, { 
      _id: 0, 
      chosenQuizAnswerId: 1 
    })
      // return chosen quiz answerids
      // map received answerids to objectid
      .then(reviews => reviews.map(review => mongoose.Types.ObjectId(review.chosenQuizAnswerId.toString())))
      .then(chosenQuizAnswerIds => {
        // query for given quizid, NOT current answererid and NOT IN already reviewed ids
        const query = { 
          quizId: mongoose.Types.ObjectId(options.quizId.toString()), 
          answererId: { $ne: options.answererId }, 
          _id: { $nin: chosenQuizAnswerIds }, 
/*           rejected: false,
          confirmed: false */
        };

        // get limit + 20 quiz answers by query, sorted by peer review count ascending
        return mongoose.models.QuizAnswer.findDistinctlyByAnswerer(query, 
          { 
            limit: options.limit + 20, 
            skip: options.skip, 
            sort: { peerReviewCount: 1 } 
          })
          .then(reviews => _.sampleSize(reviews, options.limit));

        // TODO: get reviewable from those from required -1 
      });
  }

  schema.statics.findPeerReviewsForAnswererv2 = function(options) {
    const {
      answererId, 
      quizId, 
      limit = 2, 
      skip = 0, 
      minimumPeerReviews = 2, 
      maxSpam = 2,
      poolSize = 20 
    } = options

    return this.find({ 
      quizId: quizId, 
      giverAnswererId: answererId,
    }, { 
      _id: 0, 
      chosenQuizAnswerId: 1 
    })
      // return chosen quiz answerids
      // map received answerids to objectid
      .then(reviews => reviews.map(review => mongoose.Types.ObjectId(review.chosenQuizAnswerId.toString())))
      .then(chosenQuizAnswerIds => {
        const basicQuery = {
          quizId: mongoose.Types.ObjectId(quizId.toString()),
          answererId: { $ne: answererId },
          spamFlags: { $lte: maxSpam },
          _id: { $nin: chosenQuizAnswerIds },
        }

        const belowAnswers = QuizAnswer.findDistinctlyByAnswerer(
          Object.assign({}, basicQuery, {
            confirmed: false,
            rejected: false,
            peerReviewCount: { $lt: minimumPeerReviews },
          }), {
            sort: { peerReviewCount: -1 },
            limit: limit + poolSize,
            skip: skip,
            filterDuplicates: true
          })
        const aboveAnswers = QuizAnswer.findDistinctlyByAnswerer(
          Object.assign({}, basicQuery, {
            peerReviewCount: { $gte: minimumPeerReviews },
            rejected: false
          }), {
            sort: { peerReviewCount: 1 },
            limit: limit + poolSize,
            skip: skip,
            //filterDuplicates: true 
            // if we're out of unconfirmed/rejected, let's just give non-rejected above the limit
          })

        return Promise.all([belowAnswers, aboveAnswers])
          .spread((belowReviews, aboveReviews) => {
            let reviews = belowReviews
            if (reviews.length < limit) {
              reviews = reviews.concat(aboveReviews)
            }

/*             console.log(reviews.map(r => ({ id: r._id, peerReviewCount: r.peerReviewCount }))) */

            return _.sampleSize(reviews, limit)
          })
      })
  }

  schema.statics.findPeerReviewsGivenToAnswerer = function(options) {
    const query = {
      quizId: options.quizId,
      targetAnswererId: options.answererId
    }

    return this.find(query)
      .sort({ createdAt: -1 })
      .skip(options.skip)
      .limit(options.limit)
      .exec();
  }

  schema.pre('save', function(next) {
    mongoose.models.QuizAnswer.update({ _id: this.chosenQuizAnswerId }, { $inc: { peerReviewCount: 1 } })
      .then(() => next())
      .catch(next);
  });

  schema.pre('validate', function(next) {
    if(!this.chosenQuizAnswerId) {
      return next();
    }

    errors.withExistsOrError(new errors.NotFoundError(`Couldn't find quiz answer with id ${this.chosenQuizAnswerId}`))
      (mongoose.models.QuizAnswer.findOne({ _id: this.chosenQuizAnswerId }))
        .then(chosenAnswer => {
          this.targetAnswererId = chosenAnswer.answererId;

          next();
        })
        .catch(next);
  });
}

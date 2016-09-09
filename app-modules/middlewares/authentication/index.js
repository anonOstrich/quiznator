const flow = require('middleware-flow');
const Promise = require('bluebird');

const User = require('app-modules/models/user');
const errors = require('app-modules/errors');

const oauthServer = require('app-modules/utils/oauth-server');
const oauthModels = require('app-modules/models/oauth');

function oauthGrant() {
  return oauthServer.grant()
}

function quiznatorGrant() {
  return flow.series(
    (req, res, next) => {
      const clientCredentials = new Buffer(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');

      req.headers['authorization'] = `Basic ${clientCredentials}`;

      next();
    },
    oauthGrant()
  )
}

function removeUsersTokens(getUserId) {
  return (req, res, next) => {
    const accessToken = req.headers['authorization'].split(' ')[1];

    errors.withExistsOrError(new errors.NotFoundError('Couldn\'t find the access token'))
      (oauthModels.AccessToken.findOne({ accessToken }))
        .then(token => {
          let query = { userId: req.userId };

          if(token.clientId) {
            query = Object.assign({}, query, { clientId: token.clientId });
          }

          console.log(query);

          return Promise.all([
            oauthModels.AccessToken.remove(query),
            oauthModels.RefreshToken.remove(query)
          ]);
        })
        .then(() => next())
        .catch(err => next(err));
  }
}

function authorize() {
  return flow.series(
    oauthServer.authorise(),
    (req, res, next) => {
      const userId = req.user.id;

      delete req.user;

      req.userId = userId;

      return next();
    }
  );
}

function canAccessQuiz(options) {
  return (req, res, next) => {
    const quizId = options.getQuizId(req);
    const userId = options.getUserId(req);

    const forbiddenError = new errors.ForbiddenError('User is not allowed to update the quiz');

    if(!userId) {
      return next(forbiddenError);
    }

    errors.withExistsOrError(new errors.NotFoundError(`Couldn't find quiz with id ${quizId}`))
      (Quiz.findOne({ _id: quizId }))
        .then(quiz => {
          if(quiz.userId.toString() === userId.toString()) {
            return next();
          } else {
            return next(forbiddenError);
          }
        });
  }
}

module.exports = { oauthGrant, quiznatorGrant, authorize, canAccessQuiz, removeUsersTokens };
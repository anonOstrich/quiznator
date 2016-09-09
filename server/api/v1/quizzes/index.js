const router = require('express').Router({ mergeParams: true });

const authenticationMiddlewares = require('app-modules/middlewares/authentication');
const middlewares = require('./middlewares');

router.use('/:id/answers', require('./answers-for-quiz'));
router.use('/:id/peer-reviews', require('./peer-reviews-for-quiz'));

router.get('/',
  authenticationMiddlewares.authorize(),
  middlewares.getUsersQuizzes(req => req.userId),
  (req, res, next) => {
    res.json(req.quizzes);
  });

router.get('/:id',
  middlewares.getQuizById(req => req.params.id),
  (req, res, next) => {
    res.json(req.quiz);
  });

router.put('/:id',
  authenticationMiddlewares.authorize(),
  authenticationMiddlewares.canAccessQuiz({
    getUserId: req => req.userId,
    getQuizId: req => req.params.id
  }),
  middlewares.updateQuiz({
    getQuery: req => ({ _id: req.params.id }),
    getAttributes: req => req.body
  }),
  (req, res, next) => {
    res.json(req.updatedQuiz);
  });

router.post('/',
  authenticationMiddlewares.authorize(),
  middlewares.createQuiz({
    getUserId: req => req.userId,
    getAttributes: req => req.body
  }),
  (req, res, next) => {
    res.json(req.newQuiz);
  });

module.exports = router;
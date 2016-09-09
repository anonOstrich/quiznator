import React from 'react';
import { connect } from 'react-redux';

import Quiz from 'components/quiz';
import QuizAlerts from 'components/quiz-alerts';
import Alert from 'components/alert';
import Loader from 'components/loader';

import { fetchQuiz, submitQuiz } from 'state/quizzes';
import { updateQuizAnswer, getQuizAnswer } from 'state/quiz-answers';

import withClassPrefix from 'utils/class-prefix';

class QuizLoader extends React.Component {
  componentDidMount() {
    this.props.loadQuiz();

    this.fetchAnswer();
  }

  componentDidUpdate(nextProps) {
    if(nextProps.user && (!this.props.user || nextProps.user.id !== this.props.user.id)) {
      this.fetchAnswer();
    }
  }

  fetchAnswer() {
    if(this.props.user) {
      this.props.loadAnswer();
    }
  }

  renderLoader() {
    return <Loader/>
  }

  renderError() {
    return (
      <div className={withClassPrefix('loading-error-container')}>
        <Alert type="danger">
          Couldn't load the quiz
        </Alert>
      </div>
    );
  }

  onQuizData(data) {
    this.props.updateQuizAnswer({
      quizId: this.props.id,
      data
    });
  }

  userIsSignedIn() {
    return this.props.user && this.props.user.id;
  }

  renderNotSignInAlert() {
    if(!this.userIsSignedIn()) {
      return (
        <div className={withClassPrefix('not-sign-in-alert-container')}>
          <Alert type="info">
            Sign in before answering
          </Alert>
        </div>
      );
    } else {
      return null;
    }
  }

  renderQuiz() {
    return (
      <Quiz quiz={this.props.quiz} user={this.props.user} onData={this.onQuizData.bind(this)} answer={this.props.answer} onSubmit={this.props.submitQuiz} disabled={!this.userIsSignedIn()} quizId={this.props.id}>
        {this.renderNotSignInAlert()}
        <QuizAlerts quizId={this.props.id}/>
      </Quiz>
    );
  }

  render() {
    let content = null;

    if(this.props.quiz.loading) {
      content = this.renderLoader();
    } else if(this.props.quiz.error) {
      content = this.renderError();
    } else if(this.props.quiz.data) {
      content = this.renderQuiz();
    }

    return (
      <div className={withClassPrefix(`quiz-loader`)}>
        {content}
      </div>
    );
  }
}

QuizLoader.propTypes = {
  id: React.PropTypes.string.isRequired
}

QuizLoader.defaultProps = {
  quiz: {}
}

const mapStateToProps = (state, props) => {
  return {
    quiz: state.quizzes[props.id.toString()],
    answer: state.quizAnswers[props.id.toString()],
    user: state.user
  }
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    loadQuiz: () => dispatch(fetchQuiz(ownProps.id)),
    loadAnswer: () => dispatch(getQuizAnswer({ quizId: ownProps.id })),
    updateQuizAnswer: ({ quizId, data }) => dispatch(updateQuizAnswer({ quizId, data })),
    submitQuiz: () => dispatch(submitQuiz(ownProps.id))
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(QuizLoader);
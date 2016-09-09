import React from 'react';
import className from 'classnames';

import { ESSAY, MULTIPLE_CHOICE } from 'constants/quiz-types';

import withClassPrefix from 'utils/class-prefix';

class PeerReview extends React.Component {
  renderContentByType() {
    switch(this.props.quiz.type) {
      case ESSAY:
        return this.props.answer.data;
        break;
      default:
        return '';
    }
  }

  render() {
    const buttonClasses = withClassPrefix(className('btn', 'btn-primary', { 'btn-outline': !this.props.chosen }));

    return (
      <div className={withClassPrefix('peer-review')}>
        <div className={withClassPrefix('peer-review__body')}>
          {this.renderContentByType()}
        </div>

        <div className={withClassPrefix('peer_review__footer')}>
          <button className={buttonClasses} onClick={this.props.onChoose}>
            {this.props.chosen ? 'Chosen' : 'Choose'}
          </button>
        </div>
      </div>
    )
  }
}

PeerReview.propTypes = {
  quiz: React.PropTypes.object.isRequired,
  answer: React.PropTypes.object.isRequired,
  chosen: React.PropTypes.bool,
  onChoose: React.PropTypes.func
}

PeerReview.defaultProps = {
  chosen: false,
  onChoose: () => {}
}

export default PeerReview;
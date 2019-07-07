import * as React from 'react';
import { inject, observer } from 'mobx-react';

import { DraftStore } from '../../stores/draft-store';
import { Summoner } from '../../stores/summoner';

import "./opponents.scss";
import { Champion } from '../champion/champion';

interface OpponentsProps {
    draft: DraftStore;
}

@inject('draft')
@observer
export class Opponents extends React.Component<OpponentsProps> {

    public render() {
        const { draft } = this.props;

        const opponents = draft.summoners.slice(1);

        return (
            <section className="opponents">
                {opponents.map((x, index) => this.renderOpponent(x, index))}
            </section>
        );
    }

    public renderOpponent(opponent: Summoner, index: number) {
        const units = opponent.allUnits.filter(x => x.unit !== undefined).map(x => x.unit);
        return (
            <div className="summoner" key={index}>
                <div className="summoner-health">{opponent.health}</div>
                <div className="summoner-avatar">
                    <div className="health-display"></div>
                    <div className="summoner-avatar__icon"></div>
                </div>
                <div className="summoner__units">
                        {units.map(x => 
                            <div className="summoner__unit">
                                <Champion unit={x} />
                            </div>
                        )}
                </div>
            </div>
        );
    }
}
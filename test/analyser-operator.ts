import Analyser from '../src/analyser/analyser';
import { ScopeElementType } from '../src/analyser/scope';

import * as assert from 'assert';

describe('An Analyser', () => {
    it('should support operators', () => {
        const toParse = `
            def myvar = 1;
            def myvar2 = 2;

            def result = myvar - 2;
        `;
        const analyser = new Analyser(toParse);

        const result = analyser.parse();
        assert(result === 'var myvar = 1;var myvar2 = 2;var result = myvar - 2;');
    });
});
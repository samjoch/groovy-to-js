import Tokenizer from '../tokenizer/tokenizer';
import { TokenType } from '../tokenizer/token-type';

import Scope from './scope';
import Variable, { VariableType } from './scope-variable';

import { operators, keywords, functions, properties } from './dictionnary';

export default class Analyser {
    // Public members
    public tokenizer: Tokenizer;
    public scope: Scope = new Scope(null);

    /**
     * Constructor
     * @param toParse The groovy script to parse
     */
    constructor (toParse: string) {
        this.tokenizer = new Tokenizer(toParse);
    }

    /**
     * Parses the current groovy script block of code to to JavaScript
     */
    public parse (scope?: Scope): string {
        // Get first token of code block
        this.tokenizer.getNextToken();

        // Start with an empty string
        let str = '';

        if (!scope)
            scope = this.scope;

        // Format code
        let parent = scope;
        while ((parent = parent.parent))
            str += '\t';

        // Tokenize
        while (this.tokenizer.currentToken !== TokenType.END_OF_INPUT) {
            // Code block
            if (this.tokenizer.match(TokenType.BRACKET_OPEN)) {
                const newScope = new Scope(scope);
                str += `{\n ${this.parse(newScope)} \n`;
            }
            // End code block
            else if (this.tokenizer.match(TokenType.BRACKET_CLOSE)) {
                return str + '}';
            }
            // For loop
            else if (this.tokenizer.matchIdentifier('for')) {
                const newScope = new Scope(scope);
                str += `for ${this.for(newScope)}`;
                str += `{\n ${this.parse(newScope)} \n`;
            }
            // If condition
            else if (this.tokenizer.matchIdentifier('if')) {
                const newScope = new Scope(scope);
                str += `if (${this.parse(newScope)}`;
            }
            // Other
            else {
                str += `${this.expression(scope).str} `;
            }
        }

        return str;
    }

    /**
     * Parses an expression
     * @param scope the scope of the expression
     * @param name 
     */
    protected expression (scope: Scope): { str: string, variable: Variable } {
        const result = {
            str: '',
            variable: null
        };
        
        let identifier = '';
        let range = '';
        let accessor = '';
        let number = '';

        /**
        // Identifier ?
        */
        if ((identifier = <string> this.tokenizer.matchIdentifier())) {
            // Check keyword
            if (keywords[identifier])
                identifier = keywords[identifier];

            result.variable = Variable.find(scope, v => v.name === identifier);

            // If variable definition ?
            let variableName = '';
            let lastIdentifier = identifier;

            if (identifier === 'var' && (variableName = <string> this.tokenizer.matchIdentifier())) {
                result.str += identifier;
                result.str += ` ${variableName} `;

                const variable = new Variable(scope, variableName, VariableType.ANY);

                // Assign (=) ? Then get the variable's type
                if (this.tokenizer.match(TokenType.ASSIGN)) {
                    // Check type
                    let right = '';

                    // Number ?
                    if ((right = this.tokenizer.matchNumber())) {
                        variable.type = VariableType.NUMBER;
                        result.str += `= ${right}`;
                    }
                    // Array ?
                    else if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
                        const array = this.array(scope, variableName);
                        variable.type = array.type;

                        const left = new Variable(scope, array.str, VariableType.ARRAY);
                        result.str += `= ${this.operators(scope, left)}`;
                    }
                    // Idenfifier ?
                    else if ((identifier = <string> this.tokenizer.matchIdentifier()) || (identifier = this.tokenizer.matchAccessor())) {
                        const left = Variable.find(scope, v => v.name === identifier);
                        variable.type = left.type;

                        const operators = this.operators(scope, left);
                        if (operators === identifier) {
                            result.str += `= ${identifier}`;
                        } else {
                            result.str += `= ${operators}`;
                        }
                    }
                    // Range ?
                    else if ((right = this.tokenizer.matchRange())) {
                        result.str += `= ${this.range(scope, right)}`;
                        variable.type = VariableType.ARRAY;
                    }
                    // String ?
                    else if ((right = this.tokenizer.matchString())) {
                        result.str += `= ${right}`;
                        variable.type = VariableType.STRING;
                    }
                    // Function ?
                    else if (this.tokenizer.match(TokenType.BRACKET_OPEN)) {
                        result.str += `= ${this.func(scope)}`;
                        variable.type = VariableType.FUNCTION;
                    }
                    // Expression (expression) ?
                    else {
                        const expr = this.expression(scope);
                        result.str += `= ${expr.str}`;
                    }
                }

                if (this.tokenizer.match(TokenType.INSTRUCTION_END)) {
                    result.str += ';';
                }
            }
            // Assign expression ?
            else if (this.tokenizer.match(TokenType.ASSIGN)) {
                result.str += `${identifier} = `;
                
                if ((identifier = <string> this.tokenizer.matchIdentifier())) {
                    // Maybe an array
                    const left = Variable.find(scope, v => v.name === identifier);
                    result.str += this.operators(scope, left);
                } else {
                    // Supported natively by JavaScript
                    result.str += this.tokenizer.lastString;
                    this.tokenizer.getNextToken();
                }
            }
            // Identifier ?
            else if ((identifier = <string> this.tokenizer.matchIdentifier())) {
                const left = Variable.find(scope, v => v.name === identifier);
                result.str += ` ${lastIdentifier} ${this.operators(scope, left)}`;
            }
            // Accessor ?
            else if ((accessor = this.tokenizer.matchAccessor())) {
                result.str += ` ${lastIdentifier} ${this.accessor(scope, accessor)}`;
            }
            // Just add ?
            else {
                // If a variable is used
                if (result.variable) {
                    const operators = this.operators(scope, result.variable);

                    result.variable.name = operators;
                    result.str += operators;
                }
                // Just a keyword
                else {
                    result.str += lastIdentifier;
                }
            }
        }
        /**
        // Array ?
        */
        else if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
            const array = this.array(scope);

            // Direct method call ?
            if ((accessor = this.tokenizer.matchAccessor())) {
                const variable = new Variable(scope, array.str, VariableType.ARRAY);

                if (!(identifier = <string> this.tokenizer.matchIdentifier())) {
                    throw new Error('A method must be an identifier');
                }
                result.str += `${this.accessor(scope, array.str + '.' + identifier)}`;
            }
            // Just add ?
            else {
                result.str += array.str;
            }
        }
        /**
        // Range ?
        */
        else if ((range = this.tokenizer.matchRange())) {
            const rangeStr = this.range(scope, range);

            result.variable = new Variable(scope, rangeStr, VariableType.ARRAY);
            result.str += rangeStr;
        }
        /**
        // Parenthesis open: (expression) ?
        */
        else if (this.tokenizer.match(TokenType.PARENTHESIS_OPEN)) {
            let exprStr = '(';
            let hasArray = false;

            while (!this.tokenizer.match(TokenType.PARENTHESIS_CLOSE)) {
                const expr = this.expression(scope);
                if (expr.variable && expr.variable.type === VariableType.ARRAY) {
                    exprStr += this.operators(scope, expr.variable);
                    hasArray = true;
                }
                else
                    exprStr += expr.str;
            }

            exprStr+= ')';

            if (hasArray) {
                const left = new Variable(scope, exprStr, VariableType.ARRAY);
                exprStr = this.operators(scope, left);
            }
            result.str += exprStr;
        }
        /**
        // Accessor ?
        */
        else if ((accessor = this.tokenizer.matchAccessor())) {
            result.str += this.accessor(scope, accessor);
        }
        /**
        // Number ?
        */
        else if ((number = this.tokenizer.matchNumber())) {
            // Method call ?
            if (number[number.length - 1] === '.') {
                identifier = <string> this.tokenizer.matchIdentifier();
                if (identifier) {
                    new Variable(scope, number.replace('.', ''), VariableType.NUMBER);
                    result.str += this.accessor(scope, number + identifier);
                } else {
                    result.str += number;
                }
            }
            // Just add as number
            else {
                result.str += number;
            }
        }
        /**
        // Supported by JavaScript, just add token
        */
        else {
            result.str += this.tokenizer.lastString;
            this.tokenizer.getNextToken();
        }

        return result;
    }

    /**
     * Parses a function
     * @param scope the scope of the function
     */
    protected func (scope: Scope): string {
        let str = '';
        let params: string = null;

        const newScope = new Scope(scope);

        while (!this.tokenizer.match(TokenType.BRACKET_CLOSE)) {
            // Pointer ? (then, params)
            if (this.tokenizer.match(TokenType.POINTER)) {
                params = str;

                // Register variables in scope
                const split = params.split(',');
                split.forEach(s => new Variable(newScope, s, VariableType.ANY));

                str = '';
            }
            // Other ?
            else {
                str += this.expression(newScope).str;
            }
        }

        return `function (${params || 'it'}) {
            ${str}
        }`;
    }

    /**
     * Parses an accessor (a.size() or just a.something)
     * @param scope the scope of the accessor
     * @param accessor the accessor name
     */
    protected accessor (scope: Scope, accessor: string): string {
        let left = Variable.find(scope, v => v.name === accessor);

        const fn = accessor.substr(accessor.lastIndexOf('.') + 1);
        accessor = accessor.substr(0, accessor.lastIndexOf('.'));

        // A function ?
        const previousLeft = Variable.find(scope, v => v.name === accessor);
        if (!left)
            left = previousLeft;

        if (!left && !previousLeft)
            throw new Error('Cannot find accessor named ' + accessor);

        // Is it a function ?
        if (fn) {
            // Already a function / closure ?
            if (previousLeft.type === VariableType.FUNCTION || left.type === VariableType.FUNCTION) {
                accessor += '.' + fn;

                let variable = Variable.find(scope, v => v.name === accessor);
                if (!variable)
                    variable = new Variable(scope, accessor, VariableType.ANY);

                if (this.tokenizer.match(TokenType.ASSIGN)) {
                    accessor += ' = ';
                    
                    let right = '';
                    // Number ?
                    if ((right = this.tokenizer.matchNumber())) {
                        variable.type = VariableType.NUMBER;
                    }
                    // Identifier ?
                    else if ((right = <string> this.tokenizer.matchIdentifier()) || (right = this.tokenizer.matchAccessor())) {
                        const rightVariable = Variable.find(scope, v => v.name === right);
                        variable.type = rightVariable ? rightVariable.type : VariableType.ANY;
                    }
                    // Array or map ?
                    else if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
                        const array = this.array(scope);
                        const rightVariable = new Variable(scope, array.str, array.type);

                        right = this.operators(scope, rightVariable);
                        variable.type = array.type;
                    }

                    accessor += right;
                }
            }
            // Array ?
            else if (left.type === VariableType.ARRAY) {
                let method = functions.array[fn];
                
                // Property ?
                if (!method) {
                    method = properties.array[fn];
                    if (method) {
                        // Remove function call
                        while (!this.tokenizer.match(TokenType.PARENTHESIS_CLOSE)) {
                            this.tokenizer.getNextToken();
                        }

                        accessor += `.${method}`;
                    } else {
                        accessor = this.operators(scope, left);
                    }
                }
                // A method with parameters (function) ?
                else if (method.parameters) {
                    // Avoid parenthesis
                    if (this.tokenizer.match(TokenType.PARENTHESIS_OPEN)) {
                        while (!this.tokenizer.match(TokenType.PARENTHESIS_CLOSE)) {
                            this.tokenizer.getNextToken();
                        }
                    }

                    // A function with custom parameter names
                    if (method.parameters === 'custom') {
                        if (!this.tokenizer.match(TokenType.BRACKET_OPEN))
                            throw new Error('A function on array must be followed by a {');

                        accessor += `.${method.name}(${this.func(scope)})`;
                    }
                    // Just a function with "it" argument ?
                    else {
                        const newScope = new Scope(scope);
                        const variable = new Variable(newScope, 'it', VariableType.NUMBER);

                        accessor += `.${method.name}(function (${method.parameters.join(',')}) {
                            ${this.parse(newScope)}
                        )`;
                    }
                }
                // Keep the method ?
                else {
                    accessor += `.${method}`;
                }
            }
            // Map ?
            else if (left.type === VariableType.MAP) {
                let method = functions.map[fn];
                
                if (method) {
                    accessor += `.${method}`;
                } else {
                    accessor += `.${fn}`;
                }
            }
            // Number ?
            else if (left.type === VariableType.NUMBER) {
                let method = functions.number[fn];

                if (method) {
                    // Avoid parenthesis
                    if (this.tokenizer.match(TokenType.PARENTHESIS_OPEN)) {
                        while (!this.tokenizer.match(TokenType.PARENTHESIS_CLOSE)) {
                            this.tokenizer.getNextToken();
                        }
                    }

                    const newScope = new Scope(scope);
                    const variable = new Variable(newScope, 'it', VariableType.NUMBER);

                    accessor = `${method.name}(${left.name}, function (${method.parameters.join(',')}) {
                        ${this.parse(newScope)}
                    )`;
                } else {
                    accessor = this.operators(scope, left);
                }
            }
            // Operators
            else {
                accessor = this.operators(scope, left);
            }
        }
        // Operators
        else {
            accessor = this.operators(scope, left);
        }
        return accessor;
    }

    /**
     * Parses a for loop
     * @param scope: the new scope created by the loop
     */
    protected for (scope: Scope): string {
        if (!this.tokenizer.match(TokenType.PARENTHESIS_OPEN))
            throw new Error('A for keyword must be followed by an opened parenthesis');

        let str = '(';

        if (!this.tokenizer.matchIdentifier('def')) {
            str += 'var ';
        } else {
            str += 'var ';
        }

        // Variable
        let identifier = '';
        if ((identifier = <string> this.tokenizer.matchIdentifier())) {
            str += identifier;

            const variable = new Variable(scope, identifier, VariableType.ANY);

            // Variable type
            if (this.tokenizer.match(TokenType.ASSIGN)) {
                str += ' = ';
            }

            if (this.tokenizer.matchIdentifier('in')) {
                str += ' in ';
            }

            let right = '';
            // Number ?
            if ((right = this.tokenizer.matchNumber())) {
                variable.type = VariableType.NUMBER;
            }
            // Range ?
            else if ((right = this.tokenizer.matchRange())) {
                variable.type = VariableType.NUMBER;
                right = this.range(scope, right);
            }
            // String ?
            else if ((right = this.tokenizer.matchString())) {
                variable.type = VariableType.STRING;
            }
            // Array ?
            else if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
                const array = this.array(scope);
                right = array.str;
            }
            // Identifier
            else if ((right = <string> this.tokenizer.matchIdentifier())) {
                const otherVariable = Variable.find(scope, v => v.name === right);
                if (otherVariable.type === VariableType.ARRAY)
                    variable.type = VariableType.NUMBER;
                else
                    variable.type = VariableType.STRING;
            }

            str += right;
        }

        // Instructions in "for"
        while (!this.tokenizer.match(TokenType.PARENTHESIS_CLOSE)) {
            str += this.expression(scope).str;
        }

        return str + ')';
    }

    /**
     * Creates a new range
     * @param scope the scope of the range
     * @param range the range string
     */
    protected range (scope: Scope, range: string): string {
        let str = '';
        const split = range.split('..');

        let operator = '';
        while ((operator = this.tokenizer.matchOperator())) {
            split[1] += `${operator} ${this.expression(scope).str}`;
        }

        return `range(${split[0]}, ${split[1]})`
    }

    /**
     * Checks operations on arrays (or not)
     * @param scope the scope of operation(s)
     * @param left the left variable
     */
    protected operators (scope: Scope, left: Variable): string {
        if (!left || left.type !== VariableType.ARRAY)
            return left.name;
        
        let str = left.name;

        let operator = '';
        let operatorAssign = '';
        let right = '';

        let identifier = '';

        while ((operator = this.tokenizer.matchOperator()) || (operatorAssign = this.tokenizer.matchOperatorAssign())) {
            let fn = operators[operator || operatorAssign];

            if (operatorAssign)
                fn = `${left.name} = ${fn}`;

            // Number
            if ((right = this.tokenizer.matchNumber())) {
                str = `${fn}(${str}, ${right})`;
            }
            // Array
            else if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
                const array = this.array(scope);
                str = `${fn}(${str}, ${array.str})`;
            }
            // Identifier
            else if ((right = <string> this.tokenizer.matchIdentifier())) {
                str = `${fn}(${str}, ${right})`;
            }
            // Expression
            else {
                str = `${fn}(${str}, ${this.expression(scope).str})`;
            }
        }

        return str;
    }

    /**
     * Parses an array (or map)
     * @param scope the scope to add the map and keys 
     * @param name the name of the array or map
     */
    protected array (scope: Scope, name?: string): { str: string, type: VariableType } {
        let str = '[';
        let identifier = '';

        while (!this.tokenizer.match(TokenType.ACCESSOR_CLOSE)) {
            if ((identifier = <string> this.tokenizer.matchIdentifier())) {
                if (this.tokenizer.match(TokenType.DESCRIPTOR)) {
                    // This is a map, not an array
                    return {
                        str: this.map(scope, identifier, name),
                        type: VariableType.MAP
                    };
                }

                str += identifier;
            } else if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
                // Array in array
                const array = this.array(scope, name);
                str += array.str;
            } else {
                // Just add string
                str += this.tokenizer.lastString;
                this.tokenizer.getNextToken();
            }
        }

        return {
            str: str + ']',
            type: VariableType.ARRAY
        };
    }

    /**
     * Parses a map
     * @param scope the scope to add the map and keys 
     * @param key the current map key parsed by "array()"
     * @param name the prefix name of the keys
     */
    protected map (scope: Scope, key: string, name?: string): string {
        let str = `{ ${key}: `;
        let variable: Variable = null;
        let identifier = '';
        let number = '';

        if (name)
            variable = new Variable(scope, `${name}.${key}`, VariableType.ANY);
        
        while (!this.tokenizer.isEnd() && !this.tokenizer.match(TokenType.ACCESSOR_CLOSE)) {
            if (this.tokenizer.match(TokenType.ACCESSOR_OPEN)) {
                // Array or map
                const array = this.array(scope);
                str += array.str;

                if (variable)
                    variable.type = array.type;
            } else if ((identifier = <string> this.tokenizer.matchIdentifier())) {
                // This is a key
                key = identifier;

                if (name)
                    variable = new Variable(scope, `${name}.${key}`, VariableType.ANY);
                
                str += key;
            } else if ((number = this.tokenizer.matchNumber())) {
                if (variable)
                    variable.type = VariableType.NUMBER;

                str += number;
            } else {
                str += this.tokenizer.lastString;
                this.tokenizer.getNextToken();
            }
        }

        return str + ' }';
    }

    /**
     * Converts a groovy script to JavaScript
     * @param toParse the Groovy string to transpile to JavaScript
     */
    public static convert (toParse: string, scope?: Scope): string {
        const analyser = new Analyser(toParse + '\n');
        return analyser.parse(scope);
    }
}

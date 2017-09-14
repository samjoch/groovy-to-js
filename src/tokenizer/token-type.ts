export enum TokenType {
    END_OF_INPUT = 0,
    UNKNOWN = 1,
    ASSIGN = 2,
    IDENTIFIER = 3,
    NUMBER = 4,
    COMMA = 5,
    STRING = 6,
    LINE_END = 7,
    EQUALITY = 8,
    INSTRUCTION_END = 10,
    OPERATOR = 11,
    OPERATOR_ASSIGN = 12,

    ERROR = 100,

    ACCESSOR = 1 << 10,
    ACCESSOR_LEFT = 1 << 11,
    ACCESSOR_RIGHT = 1 << 12,

    PARENTHESIS = 1 << 20,
    PARENTHESIS_OPEN = 1 << 21,
    PARENTHESIS_CLOSE = 1 << 22,

    BRACKET = 1 << 30,
    BRACKET_OPEN = 1 << 31,
    BRACKET_CLOSE = 1 << 32,
}
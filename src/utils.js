const SINGLE_QUOTED = /^'([\s\S]*)'$/;
const DOUBLE_QUOTED = /^"([\s\S]*)"$/;
const NO_EXPRESSION_VALUE = Symbol("NO_EXPRESSION_VALUE");

export function parseArgs(line, commandName) {
  const raw = extractArgString(line, commandName);
  return splitTopLevel(raw);
}

export function parseCommand(line) {
  const normalized = stripTrailingSemicolon(line.trim());
  const match = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/);

  if (!match) {
    return null;
  }

  return {
    name: match[1],
    expression: normalized
  };
}

export function parseAssignment(line) {
  const normalized = stripTrailingSemicolon(line.trim());
  const match = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);

  if (!match) {
    return null;
  }

  return {
    variable: match[1],
    expression: match[2].trim()
  };
}

export function parseSingleQuoted(value) {
  const trimmed = value.trim();
  const match = trimmed.match(SINGLE_QUOTED);
  if (!match) {
    throw new Error(`Expected single-quoted string, got: ${value}`);
  }

  return match[1].replace(/\\'/g, "'");
}

export function parseValue(token, variables = {}) {
  const trimmed = token.trim();
  if (trimmed === "") {
    throw new Error("Cannot parse an empty value token.");
  }

  if (SINGLE_QUOTED.test(trimmed)) {
    return parseSingleQuoted(trimmed);
  }

  if (DOUBLE_QUOTED.test(trimmed)) {
    return JSON.parse(trimmed);
  }

  if (/^\{[\s\S]*\}$/.test(trimmed) || /^\[[\s\S]*\]$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through and treat this as an expression when JSON parsing fails.
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  if (trimmed === "undefined") {
    return undefined;
  }

  if (hasVariable(variables, trimmed)) {
    return variables[trimmed];
  }

  const pathResult = resolvePathValue(trimmed, variables);
  if (pathResult.found) {
    return pathResult.value;
  }

  const expressionValue = tryEvaluateExpression(trimmed, variables);
  if (expressionValue !== NO_EXPRESSION_VALUE) {
    return expressionValue;
  }

  throw new Error(`Unknown value or variable: ${trimmed}`);
}

export function hasVariable(scope, variableName) {
  return variableName in scope;
}

export function setVariable(scope, variableName, value) {
  let current = scope;

  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, variableName)) {
      current[variableName] = value;
      return;
    }

    current = Object.getPrototypeOf(current);
  }

  scope[variableName] = value;
}

export function stripTrailingSemicolon(line) {
  return line.endsWith(";") ? line.slice(0, -1).trim() : line;
}

export function splitTopLevel(input) {
  const args = [];
  let current = "";
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let bracketDepth = 0;
  let braceDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const prev = input[i - 1];

    if (!inDoubleQuotes && ch === "'" && prev !== "\\") {
      inSingleQuotes = !inSingleQuotes;
      current += ch;
      continue;
    }

    if (!inSingleQuotes && ch === '"' && prev !== "\\") {
      inDoubleQuotes = !inDoubleQuotes;
      current += ch;
      continue;
    }

    if (!inSingleQuotes && !inDoubleQuotes) {
      if (ch === "[") bracketDepth += 1;
      if (ch === "]") bracketDepth -= 1;
      if (ch === "{") braceDepth += 1;
      if (ch === "}") braceDepth -= 1;
      if (ch === "(") parenDepth += 1;
      if (ch === ")") parenDepth -= 1;

      if (ch === "," && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0) {
        args.push(current.trim());
        current = "";
        continue;
      }
    }

    current += ch;
  }

  if (current.trim() !== "") {
    args.push(current.trim());
  }

  return args;
}

function extractArgString(line, commandName) {
  const normalized = stripTrailingSemicolon(line.trim());
  const prefix = `${commandName}(`;

  if (!normalized.startsWith(prefix) || !normalized.endsWith(")")) {
    throw new Error(`Invalid ${commandName} syntax: ${line}`);
  }

  return normalized.slice(prefix.length, -1).trim();
}

function tryEvaluateExpression(expression, variables) {
  const unwrapped = stripEnclosingParentheses(expression);
  if (unwrapped !== expression) {
    return parseValue(unwrapped, variables);
  }

  const operatorGroups = [
    ["||"],
    ["&&"],
    ["==", "!="],
    [">=", "<=", ">", "<"],
    ["+", "-"],
    ["*", "/", "%"]
  ];

  for (const operators of operatorGroups) {
    const match = findTopLevelBinaryOperator(expression, operators);
    if (!match) {
      continue;
    }

    const leftRaw = expression.slice(0, match.index).trim();
    const rightRaw = expression.slice(match.index + match.operator.length).trim();
    const left = parseValue(leftRaw, variables);
    const right = parseValue(rightRaw, variables);

    return applyBinaryOperator(match.operator, left, right, leftRaw, rightRaw);
  }

  if (expression.startsWith("!")) {
    const value = parseValue(expression.slice(1), variables);
    return !Boolean(value);
  }

  if (expression.startsWith("-") && isUnaryOperator(expression, 0)) {
    const value = parseValue(expression.slice(1), variables);
    return -toNumber(value, expression.slice(1));
  }

  if (expression.startsWith("+") && isUnaryOperator(expression, 0)) {
    const value = parseValue(expression.slice(1), variables);
    return toNumber(value, expression.slice(1));
  }

  return NO_EXPRESSION_VALUE;
}

function applyBinaryOperator(operator, left, right, leftRaw, rightRaw) {
  if (operator === "||") {
    return Boolean(left) || Boolean(right);
  }

  if (operator === "&&") {
    return Boolean(left) && Boolean(right);
  }

  if (operator === "==") {
    return left === right;
  }

  if (operator === "!=") {
    return left !== right;
  }

  if (operator === ">") {
    return toComparable(left, leftRaw) > toComparable(right, rightRaw);
  }

  if (operator === "<") {
    return toComparable(left, leftRaw) < toComparable(right, rightRaw);
  }

  if (operator === ">=") {
    return toComparable(left, leftRaw) >= toComparable(right, rightRaw);
  }

  if (operator === "<=") {
    return toComparable(left, leftRaw) <= toComparable(right, rightRaw);
  }

  if (operator === "+") {
    if (typeof left === "string" || typeof right === "string") {
      return `${left}${right}`;
    }

    return toNumber(left, leftRaw) + toNumber(right, rightRaw);
  }

  if (operator === "-") {
    return toNumber(left, leftRaw) - toNumber(right, rightRaw);
  }

  if (operator === "*") {
    return toNumber(left, leftRaw) * toNumber(right, rightRaw);
  }

  if (operator === "/") {
    return toNumber(left, leftRaw) / toNumber(right, rightRaw);
  }

  if (operator === "%") {
    return toNumber(left, leftRaw) % toNumber(right, rightRaw);
  }

  throw new Error(`Unsupported operator: ${operator}`);
}

function findTopLevelBinaryOperator(expression, operators) {
  const sortedOperators = [...operators].sort((left, right) => right.length - left.length);
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let lastMatch = null;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    const previous = expression[index - 1];

    if (!inDoubleQuotes && char === "'" && previous !== "\\") {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (!inSingleQuotes && char === '"' && previous !== "\\") {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (inSingleQuotes || inDoubleQuotes) {
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      continue;
    }

    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
      continue;
    }

    for (const operator of sortedOperators) {
      if (!expression.startsWith(operator, index)) {
        continue;
      }

      if ((operator === "+" || operator === "-") && isUnaryOperator(expression, index)) {
        continue;
      }

      lastMatch = { index, operator };
      index += operator.length - 1;
      break;
    }
  }

  return lastMatch;
}

function stripEnclosingParentheses(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    return trimmed;
  }

  let depth = 0;
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    const previous = trimmed[index - 1];

    if (!inDoubleQuotes && char === "'" && previous !== "\\") {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (!inSingleQuotes && char === '"' && previous !== "\\") {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (inSingleQuotes || inDoubleQuotes) {
      continue;
    }

    if (char === "(") {
      depth += 1;
    }

    if (char === ")") {
      depth -= 1;
    }

    if (depth === 0 && index < trimmed.length - 1) {
      return trimmed;
    }
  }

  return trimmed.slice(1, -1).trim();
}

function isUnaryOperator(expression, index) {
  const prefix = expression.slice(0, index).trimEnd();
  if (prefix === "") {
    return true;
  }

  const previousChar = prefix[prefix.length - 1];
  return ["+", "-", "*", "/", "%", "<", ">", "=", "!", "&", "|", "(", ","].includes(previousChar);
}

function toComparable(value, token) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  throw new Error(`Expected comparable value for token: ${token}`);
}

function toNumber(value, token) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }

  throw new Error(`Expected numeric value for expression token: ${token}`);
}

function resolvePathValue(token, variables) {
  const tokens = parsePathTokens(token);
  if (!tokens) {
    return { found: false, value: undefined };
  }

  const [rootName, ...path] = tokens;
  if (!hasVariable(variables, rootName)) {
    return { found: false, value: undefined };
  }

  let current = variables[rootName];
  for (const part of path) {
    if (current === null || current === undefined) {
      return { found: false, value: undefined };
    }

    if (typeof part === "number") {
      if (!Array.isArray(current) || part < 0 || part >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[part];
      continue;
    }

    if (!(part in current)) {
      return { found: false, value: undefined };
    }

    current = current[part];
  }

  return { found: true, value: current };
}

function parsePathTokens(token) {
  let index = 0;
  const tokens = [];

  const rootMatch = token.slice(index).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
  if (!rootMatch) {
    return null;
  }

  tokens.push(rootMatch[0]);
  index += rootMatch[0].length;

  while (index < token.length) {
    if (token[index] === ".") {
      const propertyMatch = token.slice(index + 1).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (!propertyMatch) {
        return null;
      }

      tokens.push(propertyMatch[0]);
      index += propertyMatch[0].length + 1;
      continue;
    }

    if (token[index] === "[") {
      const close = token.indexOf("]", index + 1);
      if (close === -1) {
        return null;
      }

      const value = token.slice(index + 1, close).trim();
      if (!/^\d+$/.test(value)) {
        return null;
      }

      tokens.push(Number(value));
      index = close + 1;
      continue;
    }

    return null;
  }

  return tokens;
}

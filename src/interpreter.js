import { DOM_NO_MATCH, runDOMCommand } from "./dom.js";
import { networkCommand } from "./network.js";
import { parseArgs, parseAssignment, parseCommand, parseValue, setVariable } from "./utils.js";
import { validateCommand } from "./validation.js";

const NO_RESULT = Symbol("NO_RESULT");
const RETURN_SIGNAL = Symbol("RETURN_SIGNAL");

export async function runKinyarwanda(code, options = {}) {
  const rootVariables = Object.create(null);
  const initialVariables = options.variables || {};

  for (const [key, value] of Object.entries(initialVariables)) {
    rootVariables[key] = value;
  }

  const dependencies = options.dependencies || {};
  if (options.injectDependenciesAsVariables === true) {
    for (const [key, value] of Object.entries(dependencies)) {
      if (!(key in rootVariables)) {
        rootVariables[key] = value;
      }
    }
  }

  const context = {
    functions: new Map(),
    dependencies,
    customCommands: options.commands || {},
    constBindings: new WeakMap(),
    exports: Object.create(null),
    exportBindings: new Map(),
    stopOnValidationFail: options.stopOnValidationFail !== false,
    hooks: {
      onCommandStart: options.onCommandStart,
      onCommandEnd: options.onCommandEnd,
      onError: options.onError
    }
  };

  const lines = preprocessCode(code);
  const results = [];

  try {
    await executeLines(lines, rootVariables, context, results);
  } catch (error) {
    if (isValidationError(error)) {
      return {
        ok: false,
        failedLine: error.line,
        variables: toPlainObject(rootVariables),
        exports: buildExports(context),
        results
      };
    }

    if (typeof context.hooks.onError === "function") {
      await context.hooks.onError(error);
    }

    throw error;
  }

  return {
    ok: true,
    variables: toPlainObject(rootVariables),
    exports: buildExports(context),
    results
  };
}

async function executeLines(lines, scope, context, results) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "" || line === "}" || line === "{") {
      continue;
    }

    if (line.startsWith("umukoro ")) {
      const declaration = parseFunctionDeclaration(lines, index);
      context.functions.set(declaration.name, {
        params: declaration.params,
        body: declaration.body,
        scope
      });
      index = declaration.endIndex;
      continue;
    }

    if (line.startsWith("subiramo")) {
      const loop = parseLoopDeclaration(lines, index);
      const signal = await runLoop(loop, scope, context, results);
      if (signal?.type === RETURN_SIGNAL) {
        return signal;
      }
      index = loop.endIndex;
      continue;
    }

    if (line.startsWith("niba")) {
      const conditional = parseConditionalDeclaration(lines, index);
      const conditionValue = await evaluateToken(conditional.condition, scope, context, results);

      if (Boolean(conditionValue)) {
        const signal = await executeScopedBlock(conditional.body, scope, context, results);
        if (signal?.type === RETURN_SIGNAL) {
          return signal;
        }
      } else if (conditional.elseBody.length > 0) {
        const signal = await executeScopedBlock(conditional.elseBody, scope, context, results);
        if (signal?.type === RETURN_SIGNAL) {
          return signal;
        }
      }

      index = conditional.endIndex;
      continue;
    }

    if (line.startsWith("garura")) {
      const expression = parseReturnExpression(line);
      const value = expression === "" ? undefined : await evaluateToken(expression, scope, context, results);
      return { type: RETURN_SIGNAL, value };
    }

    if (line.startsWith("import ")) {
      await runImportStatement(line, scope, context, results);
      continue;
    }

    if (line.startsWith("export ")) {
      await runExportStatement(line, scope, context, results);
      continue;
    }

    const declaration = parseDeclaration(line);
    if (declaration) {
      const value = await evaluateToken(declaration.expression, scope, context, results);
      declareVariable(scope, declaration.variable, value, declaration.kind === "const", context);
      continue;
    }

    const assignment = parseAssignment(line);
    if (assignment) {
      const value = await evaluateToken(assignment.expression, scope, context, results);
      assignVariable(scope, assignment.variable, value, context);
      continue;
    }

    const commandValue = await executeCommand(line, scope, context, results);
    if (commandValue !== NO_RESULT) {
      results.push(commandValue);
    }
  }

  return null;
}

async function runLoop(loop, scope, context, results) {
  if (loop.mode === "count") {
    const countValue = await evaluateToken(loop.countExpression, scope, context, results);
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Loop count must be a non-negative integer: ${loop.countExpression}`);
    }

    for (let iteration = 0; iteration < count; iteration += 1) {
      const loopScope = Object.create(scope);
      const signal = await executeLines(loop.body, loopScope, context, results);
      if (signal?.type === RETURN_SIGNAL) {
        return signal;
      }
    }

    return null;
  }

  const startValue = await evaluateToken(loop.startExpression, scope, context, results);
  const endValue = await evaluateToken(loop.endExpression, scope, context, results);
  const start = Number(startValue);
  const end = Number(endValue);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`Range loop bounds must be numeric: ${loop.startExpression}, ${loop.endExpression}`);
  }

  const step = start <= end ? 1 : -1;
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    const loopScope = Object.create(scope);
    loopScope[loop.variable] = value;
    const signal = await executeLines(loop.body, loopScope, context, results);
    if (signal?.type === RETURN_SIGNAL) {
      return signal;
    }
  }

  return null;
}

async function runImportStatement(line, scope, context) {
  const normalized = stripTrailingSemicolon(line);
  const namedMatch = normalized.match(/^import\s*\{(.+)\}\s*from\s*(['"])(.+)\2$/);
  if (namedMatch) {
    const specifiers = namedMatch[1]
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    const dependencyName = namedMatch[3];
    const dependency = context.dependencies[dependencyName];

    if (dependency === undefined) {
      throw new Error(`Dependency not found for import: ${dependencyName}`);
    }

    for (const specifier of specifiers) {
      const aliasMatch = specifier.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?$/);
      if (!aliasMatch) {
        throw new Error(`Invalid import specifier: ${specifier}`);
      }

      const sourceName = aliasMatch[1];
      const localName = aliasMatch[3] || sourceName;

      if (dependency === null || typeof dependency !== "object" || !(sourceName in dependency)) {
        throw new Error(`Imported member "${sourceName}" was not found on dependency "${dependencyName}".`);
      }

      declareVariable(scope, localName, dependency[sourceName], true, context);
    }

    return;
  }

  const defaultMatch = normalized.match(
    /^import\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])(.+)\2$/
  );
  if (defaultMatch) {
    const localName = defaultMatch[1];
    const dependencyName = defaultMatch[3];

    if (!(dependencyName in context.dependencies)) {
      throw new Error(`Dependency not found for import: ${dependencyName}`);
    }

    declareVariable(scope, localName, context.dependencies[dependencyName], true, context);
    return;
  }

  throw new Error(`Invalid import syntax: ${line}`);
}

async function runExportStatement(line, scope, context, results) {
  const normalized = stripTrailingSemicolon(line);
  const body = normalized.slice("export".length).trim();

  const declaration = parseDeclaration(body);
  if (declaration) {
    const value = await evaluateToken(declaration.expression, scope, context, results);
    declareVariable(scope, declaration.variable, value, declaration.kind === "const", context);
    setExportBinding(context, declaration.variable, scope, declaration.variable);
    return;
  }

  const assignment = parseAssignment(body);
  if (assignment) {
    const value = await evaluateToken(assignment.expression, scope, context, results);
    assignVariable(scope, assignment.variable, value, context);
    setExportBinding(context, assignment.variable, scope, assignment.variable);
    return;
  }

  const namedMatch = body.match(/^\{(.+)\}$/);
  if (namedMatch) {
    const specifiers = namedMatch[1]
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

    for (const specifier of specifiers) {
      const aliasMatch = specifier.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?$/);
      if (!aliasMatch) {
        throw new Error(`Invalid export specifier: ${specifier}`);
      }

      const variableName = aliasMatch[1];
      const exportName = aliasMatch[3] || variableName;

      if (!hasVariableInChain(scope, variableName)) {
        throw new Error(`Cannot export unknown variable: ${variableName}`);
      }

      setExportBinding(context, exportName, scope, variableName);
    }

    return;
  }

  const identifierMatch = body.match(/^([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (identifierMatch) {
    const variableName = identifierMatch[1];
    if (!hasVariableInChain(scope, variableName)) {
      throw new Error(`Cannot export unknown variable: ${variableName}`);
    }

    setExportBinding(context, variableName, scope, variableName);
    return;
  }

  throw new Error(`Invalid export syntax: ${line}`);
}

async function executeScopedBlock(lines, scope, context, results) {
  const blockScope = Object.create(scope);
  return executeLines(lines, blockScope, context, results);
}

async function executeCommand(line, scope, context, results) {
  const command = parseCommand(line);
  const commandName = command ? command.name : null;

  if (typeof context.hooks.onCommandStart === "function" && commandName) {
    await context.hooks.onCommandStart({
      name: commandName,
      line
    });
  }

  const domValue = runDOMCommand(line, scope, {
    onEvent: async (handlerName, event) => {
      await callUserFunction(handlerName, [event], scope, context, results);
    }
  });
  if (domValue !== DOM_NO_MATCH) {
    await notifyCommandEnd(context, commandName, line, domValue);
    return domValue;
  }

  const validationValue = validateCommand(line, scope);
  if (validationValue !== null) {
    if (validationValue && context.stopOnValidationFail) {
      throw createValidationError(line);
    }

    await notifyCommandEnd(context, commandName, line, validationValue);
    return validationValue;
  }

  const networkValue = await networkCommand(line, scope);
  if (networkValue !== null) {
    await notifyCommandEnd(context, commandName, line, networkValue);
    return networkValue;
  }

  if (!command) {
    throw new Error(`Invalid syntax: ${line}`);
  }

  if (command.name === "injiza") {
    const value = await runInjizaCommand(command.expression, scope, context, results);
    await notifyCommandEnd(context, command.name, line, value);
    return value;
  }

  if (command.name === "koresha" || command.name === "hamagara") {
    const value = await runKoreshaCommand(command.expression, scope, context, results, command.name);
    await notifyCommandEnd(context, command.name, line, value);
    return value;
  }

  if (typeof context.customCommands[command.name] === "function") {
    const value = await runCustomCommand(command, scope, context, results, line);
    await notifyCommandEnd(context, command.name, line, value);
    return value;
  }

  if (!context.functions.has(command.name)) {
    throw new Error(`Unknown command or function: ${command.name}`);
  }

  const value = await callUserFunction(command.name, null, scope, context, results, command.expression);
  await notifyCommandEnd(context, command.name, line, value);
  return value;
}

async function runInjizaCommand(expression, scope, context, results) {
  const [keyToken] = parseArgs(expression, "injiza");
  if (typeof keyToken !== "string") {
    throw new Error("injiza(serviceName) expects one argument.");
  }

  const key = String(await evaluateToken(keyToken, scope, context, results));
  if (!(key in context.dependencies)) {
    throw new Error(`Dependency not found: ${key}`);
  }

  return context.dependencies[key];
}

async function runKoreshaCommand(expression, scope, context, results, commandName) {
  const args = parseArgs(expression, commandName);
  if (args.length < 1) {
    throw new Error(`${commandName} expects at least one argument.`);
  }

  const rawTarget = await evaluateToken(args[0], scope, context, results);
  const target = resolveDependencyTarget(rawTarget, context.dependencies);

  if (args.length === 1) {
    if (typeof target !== "function") {
      return target;
    }

    return target();
  }

  const second = await evaluateToken(args[1], scope, context, results);
  const restArgs = await Promise.all(
    args.slice(2).map((token) => evaluateToken(token, scope, context, results))
  );

  if (typeof second === "string" && target !== null && target !== undefined) {
    const method = target[second];
    if (typeof method === "function") {
      return method.apply(target, restArgs);
    }
  }

  if (typeof target === "function") {
    const functionArgs = [second, ...restArgs];
    return target(...functionArgs);
  }

  throw new Error(
    `${commandName} could not call dependency target. Use koresha('dep', 'method', ...) or koresha(fn, ...).`
  );
}

async function runCustomCommand(command, scope, context, results, line) {
  const tokens = parseArgs(command.expression, command.name);
  const args = await Promise.all(tokens.map((token) => evaluateToken(token, scope, context, results)));
  const handler = context.customCommands[command.name];

  return handler({
    args,
    variables: scope,
    dependencies: context.dependencies,
    line,
    command: command.name,
    run: async (code, runOptions = {}) => {
      const nestedOptions = {
        variables: {
          ...toPlainObject(scope),
          ...(runOptions.variables || {})
        },
        dependencies: {
          ...context.dependencies,
          ...(runOptions.dependencies || {})
        },
        commands: {
          ...context.customCommands,
          ...(runOptions.commands || {})
        },
        stopOnValidationFail:
          runOptions.stopOnValidationFail !== undefined
            ? runOptions.stopOnValidationFail
            : context.stopOnValidationFail
      };

      return runKinyarwanda(code, nestedOptions);
    }
  });
}

async function callUserFunction(name, preResolvedArgs, callScope, context, results, expression) {
  const definition = context.functions.get(name);
  if (!definition) {
    throw new Error(`Unknown function: ${name}`);
  }

  const argumentTokens = preResolvedArgs ? null : parseArgs(expression || `${name}()`, name);
  const args = preResolvedArgs
    ? preResolvedArgs
    : await Promise.all(argumentTokens.map((token) => evaluateToken(token, callScope, context, results)));

  if (args.length !== definition.params.length) {
    throw new Error(
      `Function ${name} expected ${definition.params.length} argument(s), received ${args.length}.`
    );
  }

  const functionScope = Object.create(definition.scope);
  for (let index = 0; index < definition.params.length; index += 1) {
    functionScope[definition.params[index]] = args[index];
  }

  const signal = await executeLines(definition.body, functionScope, context, results);
  if (signal?.type === RETURN_SIGNAL) {
    return signal.value;
  }

  return undefined;
}

async function evaluateToken(token, scope, context, results) {
  const trimmed = token.trim();
  if (trimmed === "") {
    return undefined;
  }

  const command = parseCommand(trimmed);
  if (command) {
    if (context.functions.has(command.name)) {
      return callUserFunction(command.name, null, scope, context, results, command.expression);
    }

    return executeCommand(trimmed, scope, context, results);
  }

  return parseValue(trimmed, scope);
}

async function notifyCommandEnd(context, name, line, value) {
  if (typeof context.hooks.onCommandEnd !== "function" || !name) {
    return;
  }

  await context.hooks.onCommandEnd({
    name,
    line,
    value
  });
}

function resolveDependencyTarget(rawTarget, dependencies) {
  if (typeof rawTarget === "string" && rawTarget in dependencies) {
    return dependencies[rawTarget];
  }

  return rawTarget;
}

function preprocessCode(code) {
  return code
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => stripInlineComment(line).trim())
    .filter((line) => line !== "");
}

function parseFunctionDeclaration(lines, startIndex) {
  const header = lines[startIndex].trim();
  const match = header.match(/^umukoro\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\{$/);
  if (!match) {
    throw new Error(`Invalid function declaration: ${header}`);
  }

  const name = match[1];
  const paramsRaw = match[2].trim();
  const params = paramsRaw === "" ? [] : paramsRaw.split(",").map((value) => value.trim());

  for (const param of params) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(param)) {
      throw new Error(`Invalid function parameter "${param}" in ${name}.`);
    }
  }

  const block = collectCurlyBlock(lines, startIndex);
  return {
    name,
    params,
    body: block.body,
    endIndex: block.endIndex
  };
}

function parseLoopDeclaration(lines, startIndex) {
  const header = lines[startIndex].trim();
  if (!header.endsWith("{")) {
    throw new Error(`Invalid loop declaration: ${header}`);
  }

  const expression = header.slice(0, -1).trim();
  const args = parseArgs(expression, "subiramo");
  const block = collectCurlyBlock(lines, startIndex);

  if (args.length === 1) {
    return {
      mode: "count",
      countExpression: args[0],
      body: block.body,
      endIndex: block.endIndex
    };
  }

  if (args.length === 3) {
    const variable = args[0].trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable)) {
      throw new Error(`Invalid loop variable: ${variable}`);
    }

    return {
      mode: "range",
      variable,
      startExpression: args[1],
      endExpression: args[2],
      body: block.body,
      endIndex: block.endIndex
    };
  }

  throw new Error(`subiramo expects 1 or 3 arguments: ${header}`);
}

function parseConditionalDeclaration(lines, startIndex) {
  const header = lines[startIndex].trim();
  const match = header.match(/^niba\s*\(([\s\S]*)\)\s*\{$/);
  if (!match) {
    throw new Error(`Invalid conditional declaration: ${header}`);
  }

  const condition = match[1].trim();
  const ifBlock = collectCurlyBlock(lines, startIndex);

  const nextIndex = ifBlock.endIndex + 1;
  if (nextIndex >= lines.length) {
    return {
      condition,
      body: ifBlock.body,
      elseBody: [],
      endIndex: ifBlock.endIndex
    };
  }

  const nextLine = lines[nextIndex].trim();
  if (!/^niba_atariyo\s*\{$/.test(nextLine)) {
    return {
      condition,
      body: ifBlock.body,
      elseBody: [],
      endIndex: ifBlock.endIndex
    };
  }

  const elseBlock = collectCurlyBlock(lines, nextIndex);
  return {
    condition,
    body: ifBlock.body,
    elseBody: elseBlock.body,
    endIndex: elseBlock.endIndex
  };
}

function parseReturnExpression(line) {
  const normalized = line.endsWith(";") ? line.slice(0, -1).trim() : line.trim();
  const match = normalized.match(/^garura\s*(.*)$/);
  if (!match) {
    throw new Error(`Invalid return syntax: ${line}`);
  }

  return match[1].trim();
}

function collectCurlyBlock(lines, startIndex) {
  let depth = 0;
  const body = [];
  let foundOpening = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const delta = countBraceDelta(line);

    if (index === startIndex) {
      if (delta <= 0 || !line.includes("{")) {
        throw new Error(`Expected block opening at line: ${line}`);
      }
      foundOpening = true;
      depth += delta;
      continue;
    }

    depth += delta;
    if (depth <= 0) {
      return {
        body,
        endIndex: index
      };
    }

    body.push(line);
  }

  if (!foundOpening) {
    throw new Error(`Missing opening brace near line: ${lines[startIndex] || ""}`);
  }

  throw new Error(`Unclosed block near line: ${lines[startIndex] || ""}`);
}

function countBraceDelta(line) {
  let delta = 0;
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

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

    if (char === "{") {
      delta += 1;
    }

    if (char === "}") {
      delta -= 1;
    }
  }

  return delta;
}

function stripInlineComment(line) {
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    const previous = line[index - 1];

    if (!inDoubleQuotes && char === "'" && previous !== "\\") {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (!inSingleQuotes && char === '"' && previous !== "\\") {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (!inSingleQuotes && !inDoubleQuotes && char === "/" && next === "/") {
      return line.slice(0, index);
    }
  }

  return line;
}

function parseDeclaration(line) {
  const normalized = stripTrailingSemicolon(line.trim());
  const match = normalized.match(/^(const|let)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
  if (!match) {
    return null;
  }

  return {
    kind: match[1],
    variable: match[2],
    expression: match[3].trim()
  };
}

function stripTrailingSemicolon(line) {
  return line.endsWith(";") ? line.slice(0, -1).trim() : line;
}

function declareVariable(scope, variableName, value, isConst, context) {
  if (Object.prototype.hasOwnProperty.call(scope, variableName)) {
    throw new Error(`Variable already declared in this scope: ${variableName}`);
  }

  scope[variableName] = value;
  if (isConst) {
    markConstBinding(scope, variableName, context);
  }
}

function assignVariable(scope, variableName, value, context) {
  const ownerScope = findOwnerScope(scope, variableName);
  if (ownerScope && isConstBinding(ownerScope, variableName, context)) {
    throw new Error(`Cannot reassign const variable: ${variableName}`);
  }

  setVariable(scope, variableName, value);
}

function setExportBinding(context, exportName, scope, variableName) {
  context.exportBindings.set(exportName, {
    scope,
    variableName
  });
  context.exports[exportName] = resolveVariable(scope, variableName);
}

function resolveVariable(scope, variableName) {
  let current = scope;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, variableName)) {
      return current[variableName];
    }
    current = Object.getPrototypeOf(current);
  }

  return undefined;
}

function hasVariableInChain(scope, variableName) {
  return findOwnerScope(scope, variableName) !== null;
}

function findOwnerScope(scope, variableName) {
  let current = scope;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, variableName)) {
      return current;
    }
    current = Object.getPrototypeOf(current);
  }

  return null;
}

function markConstBinding(scope, variableName, context) {
  const existing = context.constBindings.get(scope);
  if (existing) {
    existing.add(variableName);
    return;
  }

  context.constBindings.set(scope, new Set([variableName]));
}

function isConstBinding(scope, variableName, context) {
  const bindings = context.constBindings.get(scope);
  return Boolean(bindings && bindings.has(variableName));
}

function toPlainObject(scope) {
  const output = {};
  for (const key of Object.keys(scope)) {
    output[key] = scope[key];
  }
  return output;
}

function buildExports(context) {
  const output = {};

  for (const [exportName, binding] of context.exportBindings.entries()) {
    output[exportName] = resolveVariable(binding.scope, binding.variableName);
  }

  for (const [key, value] of Object.entries(context.exports)) {
    if (!(key in output)) {
      output[key] = value;
    }
  }

  return output;
}

function createValidationError(line) {
  return {
    type: "validation_error",
    line
  };
}

function isValidationError(error) {
  return Boolean(error && typeof error === "object" && error.type === "validation_error");
}

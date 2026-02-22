# ikinyarwanda-lang

A Kinyarwanda scripting language runtime for backend and frontend development.

It runs `.ikw` scripts in:
- Node.js backends
- Plain HTML pages
- React apps
- Vue apps

## Install

```bash
npm install ikinyarwanda-lang
```

## Quick Start

```js
import { runKinyarwanda } from "ikinyarwanda-lang";

const result = await runKinyarwanda(`
  izina = 'Muraho';
  andika(izina);
`);

console.log(result.ok); // true
```

## CLI

```bash
npx ikin
npx ikin index.ikw
npx ikin run examples/hello.ikw
```

CLI rules:
- Accepts only `.ikw` files
- If no file is provided, it runs `index.ikw`
- Exits with code `2` when validation fails

NPM shortcuts:

```bash
npm run ikw
npm run ikw -- index.ikw
```

## Language Keywords

Core:
- `andika(value1, value2, ...)` print to console
- `muburire(value)` browser alert
- `const izina = value` declare immutable variable
- `let izina = value` declare mutable variable
- `umukoro name(args) { ... }` function
- `garura value` return from function
- `subiramo(count) { ... }` loop by count
- `subiramo(i, start, end) { ... }` range loop
- `niba(condition) { ... }` if block
- `niba_atariyo { ... }` else block
- `import service from 'dependencyName'` import dependency into script scope
- `import { member, other as alias } from 'dependencyName'` named import from dependency object
- `export izina` export variable in result object
- `export { izina as hanze }` named export
- `export const izina = value` declare and export

DOM:
- `shyiramo('#selector', value)` set `innerText`
- `hindura_ibuju('#selector', color)` set text color
- `fata_agaciro('#selector')` read value/text
- `shyiraho_agaciro('#selector', value)` write value/text
- `tegeka('#selector', 'event', handlerName)` attach event listener

Validation:
- `idafite_agaciro('#selector')`
- `si_imererwe_neza('#selector')`
- `ntibihuye('#a', '#b')`

Network:
- `fata('#form')` get `FormData`
- `subiza('/api', payload)` `POST` (raw `fetch` response)
- `zana('/api')` `GET` (raw `fetch` response)
- `subiza_json('/api', payload)` `POST` and parse JSON/text
- `zana_json('/api')` `GET` and parse JSON/text

Dependency keywords (new):
- `injiza('name')` get injected dependency/service
- `koresha('name', 'method', ...args)` call dependency method
- `koresha(fnRef, ...args)` call function reference
- `hamagara(...)` alias of `koresha(...)`

## How Runtime Works

`runKinyarwanda(code, options)`:
1. Preprocesses lines (trim + remove inline comments).
2. Builds execution scope (variables, functions, dependencies).
3. Executes statements sequentially.
4. Returns:
   - `ok`: `true | false`
   - `failedLine`: when validation fails
   - `variables`: final root variable scope
   - `exports`: variables exported with `export ...`
   - `results`: collected command return values

## Advanced Runtime Options

```ts
interface RunKinyarwandaOptions {
  variables?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  commands?: Record<string, CustomCommandHandler>;
  stopOnValidationFail?: boolean;
  injectDependenciesAsVariables?: boolean;
  onCommandStart?: (event) => unknown;
  onCommandEnd?: (event) => unknown;
  onError?: (error) => unknown;
}
```

## Backend Integration (Express, Prisma, Axios, etc.)

Inject any dependency through `dependencies` and call it in Kinyarwanda.

```js
import axios from "axios";
import { createBackendKinyarwanda } from "ikinyarwanda-lang";

const runtime = createBackendKinyarwanda({
  dependencies: {
    http: axios,
    logger: console
  }
});

const result = await runtime.run(`
  response = koresha('http', 'get', 'https://jsonplaceholder.typicode.com/todos/1');
  koresha('logger', 'log', response.data.title);
`);
```

Using custom backend commands:

```js
import { runKinyarwanda } from "ikinyarwanda-lang";

await runKinyarwanda(
  `
  ububiko = db_shakisha('users');
  andika(ububiko.length);
  `,
  {
    commands: {
      async db_shakisha({ args, dependencies }) {
        const [table] = args;
        return dependencies.prisma[table].findMany();
      }
    },
    dependencies: { prisma }
  }
);
```

## HTML Integration

### 0. Simple live editor file

Open `playground.html` in your browser for a local editor, or serve the project and open `docs/playground.html` for a shareable page.  
You can write Kinyarwanda code in a textarea and run it instantly.

### 1. Script tags with auto runner

```html
<script type="text/ikinyarwanda">
  andika('Muraho from HTML');
</script>
```

```js
import { installKinyarwandaGlobal } from "ikinyarwanda-lang";

installKinyarwandaGlobal({
  autoRun: true
});
```

### 2. HTML adapter

```js
import { createHtmlKinyarwanda } from "ikinyarwanda-lang";

const htmlRuntime = createHtmlKinyarwanda({
  variables: { appName: "Demo" }
});

await htmlRuntime.runFromElement("#ikin-script");
```

## React Integration

```jsx
import { createReactKinyarwanda } from "ikinyarwanda-lang";

const runtime = createReactKinyarwanda({
  dependencies: {
    log: console.log
  }
});

await runtime.run(`
  koresha('log', 'React + Kinyarwanda');
`);
```

Tip: create one runtime per feature/module and inject services (API clients, analytics, state bridges).

## Vue Integration

```js
import { createVueKinyarwanda } from "ikinyarwanda-lang";

const runtime = createVueKinyarwanda({
  variables: { project: "Vue App" }
});

await runtime.run(`
  andika(project);
`);
```

## Programmatic Runners

```js
import { createKinyarwandaRunner } from "ikinyarwanda-lang";

const runner = createKinyarwandaRunner({ variables: { env: "dev" } });
const child = runner.withOptions({ variables: { env: "prod" } });

await runner.run("andika(env);");
await child.run("andika(env);");
```

## Browser Runtime Helpers

- `runKinyarwandaInBrowser(code, options)`
- `runKinyarwandaFile(url, options)` fetch `.ikw` and execute
- `runKinyarwandaScripts({ selector, runOptions })` run all matching script tags

## TypeScript

Type definitions are bundled in `types/index.d.ts`.

```ts
import {
  RunKinyarwandaResult,
  createBackendKinyarwanda
} from "ikinyarwanda-lang";

const runtime = createBackendKinyarwanda();
const result: RunKinyarwandaResult = await runtime.run("andika('Muraho');");
```

## Project Structure

- `src/interpreter.js` core parser/executor
- `src/dom.js` DOM commands
- `src/network.js` fetch/form commands
- `src/validation.js` form validations
- `src/browser.js` browser bootstrapping helpers
- `src/adapters.js` backend/html/react/vue adapters
- `bin/ikin.js` CLI

## Development Scripts

```bash
npm run test
npm run smoke
npm run typecheck
npm run verify
```

Release safety:
- `npm run verify` runs tests, smoke CLI check, and typecheck.
- `npm publish` automatically runs `prepublishOnly` (which calls `verify`).

## License

MIT

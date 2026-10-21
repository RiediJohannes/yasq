# Testing

The project contains various unit tests for the client, server, and the shared library using vitest, integration tests to verify client-server communication, as well as end-to-end (E2E) and component-specific tests using Playwright to test the full app including correct behaviour of the client UI. To run the tests, execute the respective `npm` script in the project root:

## Unit Tests

```bash
npm run test:unit
npm run test:unit:coverage # with coverage report

npm run test:unit:client   # only client tests
npm run test:unit:server   # only server tests
npm run test:unit:shared   # only shared tests
```

## Integration Tests

```bash
npm run test:integration
```

## UI Tests

The user interface tests consist of end-to-end (E2E) tests and more fine-grained single-component tests.
Furthermore, all the UI tests offer `npm` scripts for both a headless execution mode as well as an interactive mode through the Playwright Test Runner (`ui` mode).

```bash
npx playwright install        # install test devices (required for first execution)

npm run test:e2e              # E2E tests - headless mode
npm run test:e2e:ui           # E2E tests - ui mode
npm run test:components       # component tests - headless mode
npm run test:components:ui    # component tests - ui mode
npm run test:gui              # all UI tests - headless mode
npm run test:gui:ui           # all UI tests - ui mode
```

## CI Pipeline

In addition, the repo contains the `.yml` file for a GitHub Action CI Pipeline. For pushes on `main` and pull requests to `main` the unit, integration, and e2e tests are executed.

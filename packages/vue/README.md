# @cloudflare/agents-vue

Vue 3 bindings for [Cloudflare Agents](https://developers.cloudflare.com/agents/).

## Installation

```sh
npm install @cloudflare/agents-vue
```

## Quick Start

```vue
<script setup lang="ts">
import { useAgent } from "@cloudflare/agents-vue";
import type { CounterAgent, CounterState } from "./server";

const { state, stub } = useAgent<CounterAgent, CounterState>({
  agent: "CounterAgent",
  onStateUpdate: (s) => console.log("State updated:", s)
});
</script>

<template>
  <div>
    <span>{{ state?.count ?? 0 }}</span>
    <button @click="stub.increment()">+</button>
    <button @click="stub.decrement()">-</button>
  </div>
</template>
```

## API

### `useAgent(options)`

Vue 3 composable for connecting to an Agent via WebSocket. Mirrors the React `useAgent` hook from `agents/react`.

#### Options

| Option               | Type                                             | Description                                                 |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `agent`              | `string`                                         | **Required.** Name of the agent class to connect to.        |
| `name`               | `string`                                         | Name of the specific agent instance (default: `"default"`). |
| `basePath`           | `string`                                         | Full URL path — bypasses agent/name URL construction.       |
| `path`               | `string`                                         | Additional path appended to the URL.                        |
| `query`              | `object \| () => Promise<object>`                | Query parameters (static or async).                         |
| `onStateUpdate`      | `(state, source) => void`                        | Called when the agent's state is updated.                   |
| `onStateUpdateError` | `(error) => void`                                | Called when a state update fails.                           |
| `onMcpUpdate`        | `(mcpServers) => void`                           | Called when MCP server state is updated.                    |
| `onIdentity`         | `(name, agent) => void`                          | Called when the server sends the agent's identity.          |
| `onIdentityChange`   | `(oldName, newName, oldAgent, newAgent) => void` | Called when identity changes on reconnect.                  |
| `onMessage`          | `(event) => void`                                | Called for unhandled WebSocket messages.                    |
| `onOpen`             | `(event) => void`                                | Called when the WebSocket connection opens.                 |
| `onClose`            | `(event) => void`                                | Called when the WebSocket connection closes.                |
| `onError`            | `(event) => void`                                | Called on WebSocket error.                                  |

#### Return Value

| Property     | Type                                         | Description                                           |
| ------------ | -------------------------------------------- | ----------------------------------------------------- |
| `connection` | `ShallowRef<PartySocket \| null>`            | The underlying PartySocket instance.                  |
| `agent`      | `Ref<string>`                                | The agent class name (kebab-case).                    |
| `name`       | `Ref<string>`                                | The agent instance name.                              |
| `identified` | `Ref<boolean>`                               | Whether identity has been received from the server.   |
| `ready`      | `Promise<void>`                              | Resolves when identity is received.                   |
| `state`      | `ShallowRef<State \| undefined>`             | The current agent state (reactive).                   |
| `setState`   | `(state) => void`                            | Update agent state (syncs to server).                 |
| `call`       | `(method, args?, streamOptions?) => Promise` | Call an agent method via RPC.                         |
| `stub`       | `AgentStub`                                  | Proxy for calling agent methods like local functions. |
| `send`       | `(data) => void`                             | Send a raw WebSocket message.                         |
| `close`      | `(code?, reason?) => void`                   | Close the WebSocket connection.                       |

## Type Safety

When you provide the agent type parameter, `call` and `stub` are fully typed:

```vue
<script setup lang="ts">
import { useAgent } from "@cloudflare/agents-vue";
import type { MyAgent, MyState } from "./server";

const { stub } = useAgent<MyAgent, MyState>({
  agent: "MyAgent"
});

// stub.myMethod() is fully typed with correct params and return type
const result = await stub.myMethod("arg1", 42);
</script>
```

## License

[MIT](../../LICENSE)

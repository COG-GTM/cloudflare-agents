import {
  ref,
  shallowRef,
  onScopeDispose,
  type Ref,
  type ShallowRef
} from "vue";
import { PartySocket, type PartySocketOptions } from "partysocket";
import type { MCPServersState, RPCRequest, RPCResponse } from "agents";
import type {
  AgentStub,
  UntypedAgentStub,
  StreamOptions,
  AgentPromiseReturnType,
  OptionalAgentMethods,
  RequiredAgentMethods
} from "agents/client";
import { createStubProxy } from "agents/client";
import { MessageType } from "agents/types";

/**
 * Convert a camelCase string to a kebab-case string
 */
function camelCaseToKebabCase(str: string): string {
  if (str === str.toUpperCase() && str !== str.toLowerCase()) {
    return str.toLowerCase().replace(/_/g, "-");
  }

  let kebabified = str.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`
  );
  kebabified = kebabified.startsWith("-") ? kebabified.slice(1) : kebabified;
  return kebabified.replace(/_/g, "-").replace(/-$/, "");
}

type QueryObject = Record<string, string | null>;

/**
 * Options for the useAgent composable
 * @template State Type of the Agent's state
 */
export type UseAgentOptions<State = unknown> = Omit<
  PartySocketOptions,
  "party" | "room"
> & {
  /** Name of the agent to connect to (ignored if basePath is set) */
  agent: string;
  /** Name of the specific Agent instance (ignored if basePath is set) */
  name?: string;
  /**
   * Full URL path - bypasses agent/name URL construction.
   * When set, the client connects to this path directly.
   * Server must handle routing manually (e.g., with getAgentByName + fetch).
   * @example
   * // Client connects to /user, server routes based on session
   * useAgent({ agent: "UserAgent", basePath: "user" })
   */
  basePath?: string;
  /** Query parameters - can be static object or async function */
  query?: QueryObject | (() => Promise<QueryObject>);
  /** Called when the Agent's state is updated */
  onStateUpdate?: (state: State, source: "server" | "client") => void;
  /** Called when a state update fails (e.g., connection is readonly) */
  onStateUpdateError?: (error: string) => void;
  /** Called when MCP server state is updated */
  onMcpUpdate?: (mcpServers: MCPServersState) => void;
  /**
   * Called when the server sends the agent's identity on connect.
   * Useful when using basePath, as the actual instance name is determined server-side.
   * @param name The actual agent instance name
   * @param agent The agent class name (kebab-case)
   */
  onIdentity?: (name: string, agent: string) => void;
  /**
   * Called when identity changes on reconnect (different instance than before).
   * If not provided and identity changes, a warning will be logged.
   * @param oldName Previous instance name
   * @param newName New instance name
   * @param oldAgent Previous agent class name
   * @param newAgent New agent class name
   */
  onIdentityChange?: (
    oldName: string,
    newName: string,
    oldAgent: string,
    newAgent: string
  ) => void;
  /**
   * Additional path to append to the URL.
   * Works with both standard routing and basePath.
   * @example
   * // With basePath: /user/settings
   * { basePath: "user", path: "settings" }
   * // Standard: /agents/my-agent/room/settings
   * { agent: "MyAgent", name: "room", path: "settings" }
   */
  path?: string;
  /** Called when a WebSocket message is received (after internal handling) */
  onMessage?: (event: MessageEvent) => void;
  /** Called when the WebSocket connection is opened */
  onOpen?: (event: Event) => void;
  /** Called when the WebSocket connection is closed */
  onClose?: (event: CloseEvent) => void;
  /** Called when a WebSocket error occurs */
  onError?: (event: Event) => void;
};

type OptionalArgsAgentMethodCall<AgentT> = <
  K extends keyof OptionalAgentMethods<AgentT>
>(
  method: K,
  args?: Parameters<OptionalAgentMethods<AgentT>[K]>,
  streamOptions?: StreamOptions
) => AgentPromiseReturnType<AgentT, K>;

type RequiredArgsAgentMethodCall<AgentT> = <
  K extends keyof RequiredAgentMethods<AgentT>
>(
  method: K,
  args: Parameters<RequiredAgentMethods<AgentT>[K]>,
  streamOptions?: StreamOptions
) => AgentPromiseReturnType<AgentT, K>;

type AgentMethodCall<AgentT> = OptionalArgsAgentMethodCall<AgentT> &
  RequiredArgsAgentMethodCall<AgentT>;

type UntypedAgentMethodCall = <T = unknown>(
  method: string,
  args?: unknown[],
  streamOptions?: StreamOptions
) => Promise<T>;

/**
 * Return type of the useAgent composable
 */
export interface UseAgentReturn<State = unknown> {
  /** The underlying PartySocket connection */
  connection: ShallowRef<PartySocket | null>;
  /** The agent class name (kebab-case) */
  agent: Ref<string>;
  /** The agent instance name */
  name: Ref<string>;
  /** Whether the client has received identity from the server */
  identified: Ref<boolean>;
  /** Promise that resolves when identity has been received from the server */
  ready: Promise<void>;
  /** The current agent state */
  state: ShallowRef<State | undefined>;
  /** Update the agent state (sends to server and updates local state) */
  setState: (state: State) => void;
  /** Call a method on the agent via RPC */
  call: UntypedAgentMethodCall;
  /** Proxy for calling agent methods as if they were local functions */
  stub: UntypedAgentStub;
  /** Send a raw message through the WebSocket */
  send: (data: string | ArrayBuffer | Blob | ArrayBufferView) => void;
  /** Close the WebSocket connection */
  close: (code?: number, reason?: string) => void;
}

/**
 * Return type of the useAgent composable with typed agent
 */
export interface TypedUseAgentReturn<
  AgentT extends { get state(): State },
  State
> {
  /** The underlying PartySocket connection */
  connection: ShallowRef<PartySocket | null>;
  /** The agent class name (kebab-case) */
  agent: Ref<string>;
  /** The agent instance name */
  name: Ref<string>;
  /** Whether the client has received identity from the server */
  identified: Ref<boolean>;
  /** Promise that resolves when identity has been received from the server */
  ready: Promise<void>;
  /** The current agent state */
  state: ShallowRef<State | undefined>;
  /** Update the agent state (sends to server and updates local state) */
  setState: (state: State) => void;
  /** Call a method on the agent via RPC */
  call: AgentMethodCall<AgentT>;
  /** Proxy for calling agent methods as if they were local functions */
  stub: AgentStub<AgentT>;
  /** Send a raw message through the WebSocket */
  send: (data: string | ArrayBuffer | Blob | ArrayBufferView) => void;
  /** Close the WebSocket connection */
  close: (code?: number, reason?: string) => void;
}

/**
 * Vue 3 composable for connecting to an Agent.
 *
 * Mirrors the React `useAgent` hook from `agents/react`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAgent } from '@cloudflare/agents-vue';
 * import type { CounterAgent, CounterState } from './server';
 *
 * const { state, stub } = useAgent<CounterAgent, CounterState>({
 *   agent: 'CounterAgent',
 *   onStateUpdate: (s) => console.log('State updated:', s),
 * });
 * </script>
 *
 * <template>
 *   <div>
 *     <span>{{ state?.count ?? 0 }}</span>
 *     <button @click="stub.increment()">+</button>
 *     <button @click="stub.decrement()">-</button>
 *   </div>
 * </template>
 * ```
 */
export function useAgent<State = unknown>(
  options: UseAgentOptions<State>
): UseAgentReturn<State>;
export function useAgent<
  AgentT extends {
    get state(): State;
  },
  State
>(options: UseAgentOptions<State>): TypedUseAgentReturn<AgentT, State>;
export function useAgent<State>(
  options: UseAgentOptions<State>
): UseAgentReturn<State> {
  const agentNamespace = camelCaseToKebabCase(options.agent);

  // Reactive state
  const agentRef = ref(agentNamespace);
  const nameRef = ref(options.name || "default");
  const identifiedRef = ref(false);
  const agentState: ShallowRef<State | undefined> = shallowRef(undefined);
  const connection: ShallowRef<PartySocket | null> = shallowRef(null);

  // Pending RPC calls
  const pendingCalls = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      stream?: StreamOptions;
    }
  >();

  // Identity tracking for change detection
  let previousName: string | null = null;
  let previousAgent: string | null = null;

  // Ready promise management
  let resolveReady: () => void;
  let readyPromise = new Promise<void>((r) => {
    resolveReady = r;
  });

  function resetReady() {
    readyPromise = new Promise<void>((r) => {
      resolveReady = r;
    });
  }

  // Build the call function
  const call = <T = unknown>(
    method: string,
    args: unknown[] = [],
    streamOptions?: StreamOptions
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const socket = connection.value;
      if (!socket) {
        reject(new Error("Not connected"));
        return;
      }

      const id = crypto.randomUUID();
      pendingCalls.set(id, {
        reject,
        resolve: resolve as (value: unknown) => void,
        stream: streamOptions
      });

      const request: RPCRequest = {
        args,
        id,
        method,
        type: MessageType.RPC
      };

      socket.send(JSON.stringify(request));
    });
  };

  // Build the stub proxy
  const stub = createStubProxy(call);

  // setState function
  const setState = (newState: State) => {
    const socket = connection.value;
    if (!socket) return;
    socket.send(
      JSON.stringify({ state: newState, type: MessageType.CF_AGENT_STATE })
    );
    agentState.value = newState;
    options.onStateUpdate?.(newState, "client");
  };

  // send delegate
  const send = (data: string | ArrayBuffer | Blob | ArrayBufferView) => {
    connection.value?.send(data);
  };

  // close delegate
  const close = (code?: number, reason?: string) => {
    connection.value?.close(code, reason);
  };

  // Handle incoming WebSocket messages
  function handleMessage(event: MessageEvent) {
    if (typeof event.data === "string") {
      let parsedMessage: Record<string, unknown>;
      try {
        parsedMessage = JSON.parse(event.data);
      } catch (_error) {
        options.onMessage?.(event);
        return;
      }

      if (parsedMessage.type === MessageType.CF_AGENT_IDENTITY) {
        const oldName = previousName;
        const oldAgent = previousAgent;
        const newName = parsedMessage.name as string;
        const newAgent = parsedMessage.agent as string;

        // Update reactive state
        agentRef.value = newAgent;
        nameRef.value = newName;
        identifiedRef.value = true;

        // Resolve ready promise
        resolveReady();

        // Detect identity change on reconnect
        if (
          oldName !== null &&
          oldAgent !== null &&
          (oldName !== newName || oldAgent !== newAgent)
        ) {
          if (options.onIdentityChange) {
            options.onIdentityChange(oldName, newName, oldAgent, newAgent);
          } else {
            const agentChanged = oldAgent !== newAgent;
            const nameChanged = oldName !== newName;
            let changeDescription = "";
            if (agentChanged && nameChanged) {
              changeDescription = `agent "${oldAgent}" \u2192 "${newAgent}", instance "${oldName}" \u2192 "${newName}"`;
            } else if (agentChanged) {
              changeDescription = `agent "${oldAgent}" \u2192 "${newAgent}"`;
            } else {
              changeDescription = `instance "${oldName}" \u2192 "${newName}"`;
            }
            console.warn(
              `[agents] Identity changed on reconnect: ${changeDescription}. ` +
                "This can happen with server-side routing (e.g., basePath with getAgentByName) " +
                "where the instance is determined by auth/session. " +
                "Provide onIdentityChange callback to handle this explicitly, " +
                "or ignore if this is expected for your routing pattern."
            );
          }
        }

        // Track for next change detection
        previousName = newName;
        previousAgent = newAgent;

        // Call onIdentity callback
        options.onIdentity?.(newName, newAgent);
        return;
      }

      if (parsedMessage.type === MessageType.CF_AGENT_STATE) {
        agentState.value = parsedMessage.state as State;
        options.onStateUpdate?.(parsedMessage.state as State, "server");
        return;
      }

      if (parsedMessage.type === MessageType.CF_AGENT_STATE_ERROR) {
        options.onStateUpdateError?.(parsedMessage.error as string);
        return;
      }

      if (parsedMessage.type === MessageType.CF_AGENT_MCP_SERVERS) {
        options.onMcpUpdate?.(parsedMessage.mcp as MCPServersState);
        return;
      }

      if (parsedMessage.type === MessageType.RPC) {
        const response = parsedMessage as RPCResponse;
        const pending = pendingCalls.get(response.id);
        if (!pending) return;

        if (!response.success) {
          pending.reject(new Error(response.error));
          pendingCalls.delete(response.id);
          pending.stream?.onError?.(response.error);
          return;
        }

        // Handle streaming responses
        if ("done" in response) {
          if (response.done) {
            pending.resolve(response.result);
            pendingCalls.delete(response.id);
            pending.stream?.onDone?.(response.result);
          } else {
            pending.stream?.onChunk?.(response.result);
          }
        } else {
          // Non-streaming response
          pending.resolve(response.result);
          pendingCalls.delete(response.id);
        }
        return;
      }
    }
    options.onMessage?.(event);
  }

  // Handle WebSocket close
  function handleClose(event: CloseEvent) {
    // Reset ready state for next connection
    resetReady();
    identifiedRef.value = false;

    // Reject all pending calls
    const error = new Error("Connection closed");
    for (const pending of pendingCalls.values()) {
      pending.reject(error);
      pending.stream?.onError?.("Connection closed");
    }
    pendingCalls.clear();

    options.onClose?.(event);
  }

  // Resolve async query if needed
  let resolvedQuery: QueryObject | undefined;
  const userQuery = options.query as
    | QueryObject
    | (() => Promise<QueryObject>)
    | undefined;

  const {
    query: _query,
    onMessage: _onMessage,
    onOpen: _onOpen,
    onClose: _onClose,
    onError: _onError,
    onStateUpdate: _onStateUpdate,
    onStateUpdateError: _onStateUpdateError,
    onMcpUpdate: _onMcpUpdate,
    onIdentity: _onIdentity,
    onIdentityChange: _onIdentityChange,
    ...restOptions
  } = options;

  if (userQuery && typeof userQuery !== "function") {
    resolvedQuery = userQuery;
  }

  // Create socket options
  const socketOptions: PartySocketOptions = options.basePath
    ? {
        basePath: options.basePath,
        path: options.path,
        query: resolvedQuery,
        ...restOptions
      }
    : {
        party: agentNamespace,
        prefix: "agents",
        room: options.name || "default",
        path: options.path,
        query: resolvedQuery,
        ...restOptions
      };

  // Create the PartySocket connection
  function createSocket(queryParams?: QueryObject) {
    const opts = { ...socketOptions };
    if (queryParams) {
      opts.query = queryParams;
    }

    const socket = new PartySocket(opts);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", handleClose);

    if (options.onOpen) {
      socket.addEventListener("open", options.onOpen);
    }
    if (options.onError) {
      socket.addEventListener("error", options.onError);
    }

    connection.value = socket;
  }

  // Cleanup function
  function destroySocket() {
    const socket = connection.value;
    if (socket) {
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("close", handleClose);
      if (options.onOpen) {
        socket.removeEventListener("open", options.onOpen);
      }
      if (options.onError) {
        socket.removeEventListener("error", options.onError);
      }
      socket.close();
      connection.value = null;
    }

    // Reject any remaining pending calls
    const error = new Error("Connection disposed");
    for (const pending of pendingCalls.values()) {
      pending.reject(error);
      pending.stream?.onError?.("Connection disposed");
    }
    pendingCalls.clear();
  }

  // Initialize connection
  if (userQuery && typeof userQuery === "function") {
    // Async query: resolve first, then connect
    userQuery()
      .then((result: QueryObject) => {
        createSocket(result);
      })
      .catch((err: unknown) => {
        console.error(
          `[useAgent] Query failed for agent "${options.agent}":`,
          err
        );
      });
  } else {
    createSocket();
  }

  // Warn if agent isn't in lowercase
  if (agentNamespace !== agentNamespace.toLowerCase()) {
    console.warn(
      "Agent name: " +
        agentNamespace +
        " should probably be in lowercase. Received: " +
        agentNamespace
    );
  }

  // Cleanup on scope disposal (component unmount)
  onScopeDispose(() => {
    destroySocket();
  });

  return {
    connection,
    agent: agentRef,
    name: nameRef,
    identified: identifiedRef,
    get ready() {
      return readyPromise;
    },
    state: agentState,
    setState,
    call,
    stub,
    send,
    close
  };
}

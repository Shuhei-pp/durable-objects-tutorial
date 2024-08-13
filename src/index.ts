import { DurableObject } from 'cloudflare:workers'

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/**
 * Associate bindings declared in wrangler.toml with the TypeScript type system
 */
export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObject>
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
  //
  // Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
  // MY_QUEUE: Queue;
}
type ChatMessage = {
  name: string
  text: string
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject {
  /**
   * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
   * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
   *
   * @param ctx - The interface for interacting with Durable Object state
   * @param env - The interface to reference bindings declared in wrangler.toml
   */

  // biome-ignore lint/complexity/noUselessConstructor: <explanation>
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  clients: Set<WebSocket> = new Set()

  /**
   * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
   *  Object instance receives a request from a Worker via the same method invocation on the stub
   *
   * @param name - The name provided to a Durable Object instance from a Worker
   * @returns The greeting to be sent back to the Worker
   */
  async fetch(): Promise<Response> {
    const webSocketPair = new WebSocketPair()
    const [clientSocket, serverSocket] = Object.values(webSocketPair)
    this.handleSession(serverSocket)
    return new Response(null, { status: 101, webSocket: clientSocket })
  }

  handleSession(serverSocket: WebSocket) {
    for (const user of this.clients) {
      user.send('system: new user connected')
    }
    this.clients.add(serverSocket)
    serverSocket.accept()
    serverSocket.addEventListener('message', async event => {
      for (const user of this.clients) {
        user.send(event.data)
      }
    })
    serverSocket.addEventListener('close', () => {
      console.log('close')
      this.clients.delete(serverSocket)
      for (const user of this.clients) {
        user.send('system: user disconnected')
      }
    })
    serverSocket.addEventListener('error', () => {
      console.log('error')
    })
  }
}

export default {
  /**
   * This is the standard fetch handler for a Cloudflare Worker
   *
   * @param request - The request submitted to the Worker from the client
   * @param env - The interface to reference bindings declared in wrangler.toml
   * @param ctx - The execution context of the Worker
   * @returns The response to be sent back to the client
   */
  async fetch(request, env, ctx): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade') //ヘッダーを取得
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Not a WebSocket request', { status: 400 })
    }

    // We will create a `DurableObjectId` using the pathname from the Worker request
    // This id refers to a unique instance of our 'MyDurableObject' class above
    const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(new URL(request.url).pathname)

    // This stub creates a communication channel with the Durable Object instance
    // The Durable Object constructor will be invoked upon the first call for a given id
    const stub = env.MY_DURABLE_OBJECT.get(id)

    // We call the `sayHello()` RPC method on the stub to invoke the method on the remote
    // Durable Object instance
    // const greeting = await stub.setValueAndFetch(request.url)

    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>

# Pharos Doc-Search CLI

A command-line and web documentation assistant for the Pharos Agent Arena **Doc-Search CLI** task. Both interfaces use the same official Developer Docs MCP client and return concise, sourced answers from `docs.pharos.xyz`.

- **Demo:** https://pharos-doc-search.shoupeorg.workers.dev
- **Developer Docs MCP:** `https://docs.pharos.xyz/~gitbook/mcp`
- **Transport:** Streamable HTTP
- **Authentication:** none required at the time of verification
- **Official discovery sources:** [AI.PHAROS](https://ai.pharos.xyz) and [Pharos Developer Docs](https://docs.pharos.xyz)

Developer Docs MCP is separate from the Pharos Chain MCP. This project never sends a documentation query to `mcp.pharos.xyz`, scrapes pages, fetches docs directly as a fallback, or serves hardcoded answers.

## Verified MCP discovery

On 2026-10-14, `ai.pharos.xyz` presented **Pharos Docs MCP** as a distinct agent option. The official `docs.pharos.xyz` page metadata advertised its MCP connection URL as:

```text
https://docs.pharos.xyz/~gitbook/mcp
```

An unauthenticated Streamable HTTP connection through the official MCP SDK returned these tools:

| Tool | Purpose |
| --- | --- |
| `searchDocumentation` | Search documentation and return contextual matches with links. |
| `getPage` | Retrieve a complete documentation page by URL. |
| `askQuestion` | Produce a synthesized answer with links to its source pages. |
| `sendFeedback` | Report a documentation issue; this application does not call it. |

The pre-build verification called `searchDocumentation` with `how do I deploy a contract?` and returned real results including the Hardhat and Foundry deployment guides.

Generic MCP client configuration:

```json
{
  "mcpServers": {
    "pharos-docs": {
      "type": "http",
      "url": "https://docs.pharos.xyz/~gitbook/mcp"
    }
  }
}
```

## Install and use the CLI

Requires Node.js 20+ and npm.

```bash
npm install
npm link
pharos-docs "how do I deploy a contract?"
```

Without `npm link`:

```bash
node ./bin/pharos-docs.js "how do I deploy a contract?"
```

Run verification and a real MCP smoke test:

```bash
npm run check
npm run smoke
```

## Run the web interface

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler. Enter a natural-language question and select **Search**. The interface distinguishes:

- **Loading:** the MCP request is still in flight.
- **Success:** a synthesized answer and official sources were returned.
- **No answer:** the docs did not support an answer and the UI says `No good answer found`.
- **Error/timeout:** the MCP connection failed or exceeded the request deadline.

Deploy to the configured free `workers.dev` route:

```bash
npm run deploy
```

## How answers are grounded

The shared client in `src/docs-mcp.js` calls the MCP `askQuestion` tool with an instruction to answer only from `docs.pharos.xyz`, include relevant source links, and return exactly `No good answer found.` when the docs do not support an answer. Source links are extracted only from the MCP response. There is no secondary search provider or direct-doc fallback.

The Worker keeps the MCP connection server-side. The current official endpoint requires no credential; no browser receives MCP session data or a secret.

## Recorded real examples

These outputs were returned by the CLI through Developer Docs MCP on 2026-10-14. They are recorded examples, not hardcoded application responses.

### 1. Deploy a contract

```text
$ pharos-docs "How do I deploy a contract with Hardhat on Pharos?"

Use Hardhat Ignition to deploy. The Pharos guide provides testnet and Atlantic Testnet configurations in Write Your First Token.

1. Configure hardhat.config.js with your chosen testnet RPC. For Atlantic Testnet, use https://atlantic.dplabs-internal.com.
2. Store the deployer key, then compile and deploy:

npx hardhat vars set PRIVATE_KEY
npx hardhat compile
npx hardhat ignition deploy ./ignition/modules/Token.js --network pharos

Ensure the deployer has enough testnet tokens for deployment fees.
```

Sources returned by MCP:

- [Write Your First Token](https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-token)
- [Hardhat](https://docs.pharos.xyz/developer-guide/hardhat)
- [Write Your First dApp](https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-dapp)

### 2. Pacific Mainnet settings

```text
$ pharos-docs "What are the Pharos Pacific Mainnet network settings?"

Pacific Mainnet settings:

* Network: Pharos Pacific Mainnet
* Chain ID: 1672
* Currency symbol: PROS
* RPC URL: https://rpc.pharos.xyz
* Block explorer: https://www.pharosscan.xyz
```

Sources returned by MCP:

- [Pacific Mainnet](https://docs.pharos.xyz/getting-started/network/pacific-mainnet)
- [Network](https://docs.pharos.xyz/getting-started/network)

### 3. Get PROS gas

```text
$ pharos-docs "How do I get PROS gas?"

Get PROS through Pharos Port at https://port.pharos.xyz/get-pros.

* Already have crypto: use Halliday or withdraw from an exchange using the Pharos network.
* Paying with fiat: use Halliday or Alchemy Pay.
* Need a wallet too: use TopNod, then buy or deposit PROS.

Confirm the destination address and network, then check the received balance on Pharos Scan.
```

Sources returned by MCP:

- [Get PROS Gas](https://docs.pharos.xyz/getting-started/get-pros-gas)
- [Gas Model](https://docs.pharos.xyz/getting-started/gas-model)
- [Pacific Mainnet](https://docs.pharos.xyz/getting-started/network/pacific-mainnet)

### Unsupported question

```text
$ pharos-docs "What is the weather in Tehran tomorrow?"
No good answer found.
```

This is a successful MCP response with no documentation support. It is distinct from a connection failure or timeout, which is printed as an error and returns a non-zero CLI exit code.

## HTTP interface

`POST /api/search`

```json
{ "question": "What is the Pharos Pacific Mainnet chain ID?" }
```

Successful responses use `status: "success"`; unsupported questions use `status: "no_answer"`; connection and timeout failures use `status: "error"` with distinct `kind` values.

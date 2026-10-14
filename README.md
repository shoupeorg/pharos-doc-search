# Pharos Doc-Search CLI

A command-line and web documentation assistant for the Pharos Agent Arena **Doc-Search CLI** task. Both interfaces use the same official Developer Docs MCP client and return concise, sourced answers from `docs.pharos.xyz`.

- **Demo:** https://pharos-doc-search.shoupeorg.workers.dev
- **Developer Docs MCP:** `https://docs.pharos.xyz/~gitbook/mcp`
- **Transport:** Streamable HTTP
- **Authentication:** none required at the time of verification
- **Official discovery sources:** [AI.PHAROS](https://ai.pharos.xyz) and [Pharos Developer Docs](https://docs.pharos.xyz)

Developer Docs MCP is separate from the Pharos Chain MCP. This project does not scrape documentation, call a direct-doc fallback, or serve hardcoded answers.

## Verified MCP tools

An unauthenticated connection through the official MCP SDK returned:

| Tool | Use in this project |
| --- | --- |
| `searchDocumentation` | Find candidate official pages for the question. |
| `getPage` | Retrieve complete Markdown for the selected pages and every cited page. |
| `askQuestion` | Synthesize the final answer, constrained to the retrieved pages. |
| `sendFeedback` | Available from the server; not called by this application. |

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
pharos-docs "How do I deploy a contract with Hardhat on Pharos?"
```

Without `npm link`:

```bash
node ./bin/pharos-docs.js "What are the Pharos mainnet network settings?"
```

Run unit checks and a real MCP smoke test:

```bash
npm run check
npm run smoke
```

## Run the web interface

```bash
npm install
npm run dev
```

The web interface distinguishes loading, success, no-answer, connection-error, and timeout states. Its answer panel uses Marked plus DOMPurify: raw HTML is rendered as text, unsafe URL protocols are rejected, relative documentation links resolve against `https://docs.pharos.xyz/`, and external links use `rel="noopener noreferrer"`.

Deploy to the configured free `workers.dev` route:

```bash
npm run deploy
```

## How answers are grounded

The shared client in `src/docs-mcp.js`, used by both CLI and Worker API, performs this sequence:

1. `searchDocumentation` finds official candidate pages.
2. `getPage` retrieves their complete Markdown.
3. `askQuestion` is instructed to use only those pages, preserve documented commands/configuration, avoid mixing examples, and state uncertainty rather than fill gaps from memory.
4. Every page cited by the synthesized answer is retrieved with `getPage` before the response is returned.

If the docs do not support the question, the result is exactly `No good answer found.` A missing verified source also fails closed as no-answer. MCP connection failures and timeouts remain separate errors.

## Hardhat accuracy audit

The complete [Write Your First Token](https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-token) page was retrieved through `getPage` and checked against the answer.

- The documented example is `https://github.com/PharosNetwork/examples`, directory `examples/token/hardhat/contract`.
- The page documents `npm install`, `npx hardhat compile`, `npx hardhat vars set PRIVATE_KEY`, and `npx hardhat ignition deploy ./ignition/modules/Token.js --network pharos`.
- It provides separate `pharos` configurations for Testnet (`https://testnet.dplabs-internal.com`, chain ID `688688`) and Atlantic Testnet (`https://atlantic.dplabs-internal.com`, chain ID `688689`). A response must select one; it must not combine them or present either as Pacific Mainnet.
- The page does not state a Hardhat package version and does not include the Ignition module contents. It also places network configuration under the later verification step even though `--network pharos` needs that configuration for deployment. The answer now states these limitations.
- The documented repository was cloned separately for a non-broadcast local check. Its package ranges at verification time were Hardhat `^2.22.17`, toolbox `^5.0.0`, and OpenZeppelin Contracts `^5.1.0`; `ignition/modules/Token.js` exists. With a disposable dummy key supplied only as `HARDHAT_VAR_PRIVATE_KEY`, `npx hardhat compile` compiled six Solidity files using compiler `0.8.28`. This independently checks configuration/compilation only; no deployment command was run and no transaction was signed or broadcast.

## Recorded real examples

These are actual CLI responses returned through Developer Docs MCP on 2026-10-15. They are snapshots, not hardcoded responses, so wording can change when the official documentation or MCP synthesis changes.

### Hardhat deployment

```text
$ pharos-docs "How do I deploy a contract with Hardhat on Pharos?"

Use the ERC-20 token example and deploy it to Pharos Testnet. You need Git, Node.js, Hardhat, and access to a Pharos node. The Write Your First Token page does not specify a Hardhat version.

1. Clone the example and install its dependencies:
   git clone https://github.com/PharosNetwork/examples
   cd examples/token/hardhat/contract
   npm install
2. Configure hardhat.config.js for Testnet, using network pharos, RPC https://testnet.dplabs-internal.com, and chain ID 688688.
3. Set the Hardhat variable, then compile and deploy:
   npx hardhat vars set PRIVATE_KEY
   npx hardhat compile
   npx hardhat ignition deploy ./ignition/modules/Token.js --network pharos

The Solidity example uses pragma solidity ^0.8.20; the config specifies 0.8.28. The guide does not provide the Ignition module contents, including how it supplies the token constructor's initialSupply. It presents network configuration under verification, but that configuration must be in place before deployment.
```

Verified source returned by MCP:

- [Write Your First Token](https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-token)

### Pacific Mainnet settings

```text
$ pharos-docs "What are the Pharos mainnet network settings?"

Pharos Pacific Mainnet settings:
* Network name: Pharos Pacific Mainnet
* Chain ID: 1672
* Currency: PROS
* RPC URL: https://rpc.pharos.xyz
* Explorer: https://www.pharosscan.xyz
```

Verified source returned by MCP:

- [Pacific Mainnet](https://docs.pharos.xyz/getting-started/network/pacific-mainnet)

### Unsupported question

```text
$ pharos-docs "What is the weather in Beijing tomorrow?"
No good answer found.
```

This is a successful MCP response with no documentation support. It is distinct from a connection failure or timeout, which prints an error and returns a non-zero CLI exit code.

## HTTP interface

`POST /api/search`

```json
{ "question": "What is the Pharos Pacific Mainnet chain ID?" }
```

Successful responses use `status: "success"`; unsupported questions use `status: "no_answer"`; connection and timeout failures use `status: "error"` with distinct `kind` values.

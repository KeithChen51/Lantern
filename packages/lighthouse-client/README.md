# lighthouse CLI / MCP

Independent knowledge reader for authenticated employees. The user's Agent decides
how to use the results. This package contains no business documents, database
configuration, model calls, maintenance tools or browser/portal token integration.

Node.js >=20.9.0. Dependencies: MCP SDK `^1.30.0`, Zod `^4.6.5`.
Run from the repository with `node packages/lighthouse-client/src/cli.js`, or install
the package into a trusted tool environment to use its `lighthouse` binary. Root
dependency/lock integration is maintained by the application controller.

```sh
lighthouse --server https://knowledge.example auth login
lighthouse auth status
lighthouse knowledge search --query "service policy" --limit 10
lighthouse knowledge get --resource-id RESOURCE --version-id VERSION
lighthouse knowledge outline --resource-id RESOURCE --version-id VERSION
lighthouse knowledge read --resource-id RESOURCE --version-id VERSION --start-line 1 --line-count 40
lighthouse knowledge files --resource-id RESOURCE --version-id VERSION
lighthouse knowledge download --resource-id RESOURCE --version-id VERSION --file-id FILE --output ./document.pdf
lighthouse mcp serve
lighthouse auth logout
```

The server origin must be explicitly supplied on first login. Subsequent commands
use the nonsecret `~/.lighthouse/profile.json` origin. There is no built-in real
service address. HTTPS with normal certificate validation is mandatory; custom
trusted CAs can be configured through Node's supported CA configuration. A server
origin cannot contain a path, query, userinfo or fragment. Redirects are rejected.
Every request uses a fixed first-party endpoint and omits browser cookies. Tokens
bind to the exact normalized origin and `lighthouse-cli` / `knowledge:read` grant.

`auth login` prints the verification URL and user code on stderr, then polls the
device grant. `--open` optionally opens that same-origin HTTPS URL through a native
process with `shell:false`. Pending, slow-down, denial and expiration responses
are handled explicitly. Access tokens last at most 5 minutes; the client never
extends its 8-hour grant deadline during refresh. The backend is authoritative
for grant validity and revocation. `auth logout` revokes the grant before deleting
its credential; on network failure the credential remains so revocation can be
retried. An `invalid_grant` response during logout clears the already revoked
credential and reports `alreadyRevoked:true`. Status checks `/api/client/v1/me`
instead of trusting local token presence.

## Credentials

- Windows: DPAPI CurrentUser encrypted files. A static PowerShell helper receives
  payloads through stdin; tokens never appear in process arguments or diagnostics.
- macOS: native Keychain through a nonsecret Swift Security helper. Requires
  `/usr/bin/swift` and an available unlocked user keychain.
- Linux: `secret-tool` and a running user Secret Service. Requires the system
  `libsecret` CLI. Missing item/service lookup fails clearly; run login to create an
  entry. No unavailable-backend condition falls back to a plaintext token file.

CLI and MCP share the OS store. Per-origin/client/scope exclusive lock files under
`~/.lighthouse` serialize refresh, login persistence and logout; refresh rereads
the credential after acquiring the lock and atomically replaces encrypted data.
Lock wait is bounded to 15 seconds. An abandoned lock is never stolen from a
possibly active process. After stopping all lighthouse processes, an operator may
remove the named hash `.lock` file and retry. Unix storage directories must have
private permissions. DPAPI ciphertext can be copied only as encrypted data; it
remains bound to the Windows user.

`--ephemeral` explicitly uses process memory only. An ephemeral CLI login expires
when that invocation exits; it cannot authenticate a later CLI or MCP process.
For a useful ephemeral session, use the exported `LighthouseClient` API with a
`MemoryStore`, log in, then read knowledge in that same process. There is no
automatic bearer-environment fallback or anonymous mode.

## Read contract

The client preserves JSON version, citation and pagination metadata unchanged.

| Operation | GET endpoint | Parameters |
| --- | --- | --- |
| browse | `/api/client/v1/resources/browse` | folderId,offset,limit |
| search | `/api/client/v1/resources` | query,type,tag,visibility,offset,limit |
| get | `/api/client/v1/resources/{resourceId}` | versionId |
| outline | `/api/client/v1/resources/{resourceId}/outline` | versionId,sectionOffset,sectionLimit,fileOffset,fileLimit |
| read | `/api/client/v1/resources/{resourceId}/read` | versionId,offset OR startLine,lineCount (<=120) |
| files | `/api/client/v1/resources/{resourceId}/files` | versionId,offset,limit |
| file_read | `/api/client/v1/resources/{resourceId}/files/read` | versionId,path,offset |
| download | `/api/client/v1/resources/{resourceId}/download` | versionId,fileId |

CLI option names use hyphens; MCP arguments use the table's camelCase names.
Search queries are limited to 500 characters, resource/version identifiers to
120 characters, and file-read paths to 240 characters.
Downloads require an explicit version and output path. Select the exact `fileId`
from the returned `files` or `downloads` metadata: an individual file uses its
opaque 64-character lowercase SHA-256 ID; `package` selects the full ZIP/Markdown
resource, and `markdown` selects its main Markdown body when listed. Original
file paths are used only for `files/read`, never inferred as download identifiers.
Downloads use exclusive creation,
reject reserved device/stream paths and symlink parents, and never use a server
filename as a local destination. Existing files are never overwritten.
JSON responses are limited to 2 MiB. Successful binary downloads are limited to
16 MiB to accommodate the hub's 12 MB resource bound and ZIP overhead. Error JSON
retains the 2 MiB limit even on a download request. Requests time out after 15
seconds. Larger responses require a separately approved limit change.

MCP serves stdio only, with exactly `knowledge_browse`, `knowledge_search`,
`knowledge_get`, `knowledge_outline`, `knowledge_read`, `knowledge_files`, and
`knowledge_file_read`. Every tool is annotated readonly. Unknown tools and extra
arguments are rejected by the protocol schema. A version resource is available
at `lighthouse://resources/{id}/versions/{versionId}`. Use the returned exact
version and citation metadata for reproducible references. No ask, chat,
write/import/publish/preview/history or interaction tools exist. CLI success output
is JSON; MCP stdout contains protocol frames only; diagnostics go to stderr.

## Validation

`npm test --prefix packages/lighthouse-client` exercises fake HTTP/credential and
process adapters, timeouts, redirect rejection, device states, refresh races,
OS backend command construction, exclusive downloads, stdout isolation and an
in-memory MCP protocol handshake/tool/resource round trip. Windows DPAPI includes
a local synthetic-credential round trip. macOS Keychain/Linux Secret Service and
real employee portal integration require their actual environments.

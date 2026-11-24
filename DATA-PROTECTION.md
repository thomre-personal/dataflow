# Data at rest in DataFlow

This design proposes storage encryption and covers the requirement for an optional lock on individual workspaces. The proposed web design trusts the DataFlow backend to open workspaces and run authorized SQL queries. Verify the actual storage and backup configuration before using it for personal finance data.

## Storage and backups

| Location | Proposed protection |
| --- | --- |
| Local Mac | Enable FileVault. Keep the storage behind the Minikube database volume and the browser profile on encrypted storage. Check the Minikube driver's actual storage path. [Apple FileVault guide](https://support.apple.com/guide/security/volume-encryption-with-filevault-sec4c6dc1b6e/1/web/1) |
| Beta PostgreSQL | Store the shared PostgreSQL data directory, write-ahead log (WAL), and any separate temporary tablespaces on encrypted storage. Use a Linux LUKS volume with an unlock key kept separately from the disks and snapshots it protects. Keep DataFlow's logical database and roles separate from those of other products. [PostgreSQL encryption options](https://www.postgresql.org/docs/current/encryption-options.html) |
| DuckDB worker | Run with memory limits and disable disk spill for the first version. If larger jobs later need disk spill, use encrypted temporary storage. DuckDB can otherwise write temporary data even with an in-memory database. [DuckDB temporary storage](https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads#spilling-to-disk) |
| Backups | Encrypt database backups and archived WAL before uploading them. Keep recovery keys separate from the backup repository and verify recovery in an isolated environment. The shared database service owns physical backups. [pgBackRest repository encryption](https://pgbackrest.org/configuration.html#section-repository/option-repo-cipher-type) |

Hetzner server backups and snapshots exclude attached Cloud Volumes. Plan a separate backup path for the database. Before adopting encrypted volumes, test restart and recovery with the planned unlock method and make sure the data path stays unavailable when the encrypted volume is locked. [Hetzner Cloud Volumes](https://docs.hetzner.com/cloud/volumes/overview/)

## Other copies of workspace data

- Store drafts, historical versions, and saved results on the same protected storage as the workspace. Apply the same protection to any object store that later holds snapshots or results.
- Keep pending browser edits only as long as needed to recover or sync them. On the local Mac, rely on device disk encryption for those copies. A future native client needs its own storage protection.
- Keep workspace content and credentials out of logs and traces. Clearly label readable Git, CSV, and JSON exports. Their protection depends on where the user saves them.
- Store AI API keys and connector credentials in the stage's secret store. Keep secrets out of workspace versions and exports. Protect any Kubernetes Secrets kept by k3s in its datastore separately from the PostgreSQL volume. [K3s secrets encryption](https://docs.k3s.io/security/secrets-encryption)

## Protection boundaries

Disk encryption protects storage that is locked or copied in encrypted form. Once mounted, authorized processes read data normally. Application access controls and database roles still determine who can access the data while the service runs. A shared disk key does not provide separate cryptographic protection for each logical database. [PostgreSQL encryption options](https://www.postgresql.org/docs/current/encryption-options.html)

If a future deployment needs protection from someone who can read the live database or its logical exports, consider encrypting workspace data in the application with a key per workspace, wrapped by Vault Transit or a key management service. The backend would decrypt allowed inputs before SQL execution. True end-to-end encryption keeps the keys with clients and needs a separate design for SQL, AI, search, collaboration, and publishing. [Vault envelope encryption](https://developer.hashicorp.com/vault/docs/secrets/transit/envelope-encryption)

## Optional workspace lock

Let users lock an individual workspace even while the device and DataFlow session are unlocked. On supported Apple devices, users should be able to unlock it with Touch ID on a Mac or Face ID on an iPhone. The extra check applies to that workspace. Other workspaces remain available.

### Proposed behavior

- Show a locked placeholder until the user verifies their identity. Allow manual locking and expire access after inactivity. Lock when the device locks where the platform provides a reliable signal. Each collaborator unlocks the workspace for their own session.
- Apply the lock to the workspace's cells, SQL, versions, previews, search snippets, and derived results. Check access at the server as well as in the editor. A dashboard or another workspace must respect the same access check for linked data.
- Encrypt the protected content with a separate key for each workspace. Store only encrypted copies in persistent browser storage. Closing the unlock session removes plaintext from the editor and ends access for that session. Previously downloaded exports are separate copies.

Verify that a signed-in user can open the workspace only after the additional check and that locking it also blocks access through its history, search, and linked results.

### Web and native options

- **Web.** Use WebAuthn for a fresh identity check and grant short-lived access to the selected workspace. The backend can unwrap its data key for authorized work during that session. WebAuthn confirms user verification, which can use biometrics, a PIN, or another method chosen by the authenticator. Label this option as a passkey check. [WebAuthn user verification](https://www.w3.org/TR/webauthn-3/#user-verification)
- **Native Apple apps.** Use a device-bound key protected by the Apple Keychain, with access tied to the current biometric enrollment. The key can protect a local copy of the workspace key. Define a separate recovery path for a lost device or a change to enrolled fingerprints or Face ID, such as an authorized second device or a recovery key. [Keychain access control](https://developer.apple.com/documentation/security/secaccesscontrolcreateflags) and [Keychain item accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility)

The web design protects access from a person using an unattended logged-in session. It still trusts the backend with workspace contents during authorized use. A mode that also keeps decryption keys away from the backend needs its own design.

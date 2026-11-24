# Version history and collaboration

## Product requirements

Most users should be able to work as they do in a shared document editor. Changes save automatically. The main editing flow uses plain actions such as **Undo**, **Version history**, **Create a variant**, and **Restore this version**. Git commits and pushes belong to an optional developer workflow outside the main editor.

| Action | Behavior |
| --- | --- |
| Undo and redo | Undo and redo any number of steps within the editing session. Treat a pasted range or an accepted SQL change as one step. Autosave the result of undo and redo like any other edit. |
| Automatic version | Save a snapshot when an editing session with changes ends. Show it in version history by date and time. |
| Named version | Let users add a name or comment to a saved version. Accepting a SQL proposal saves a version that can be compared or restored later. |
| Release tag | Let users assign a SemVer tag such as `1.2.0` to a version for sharing. Once published, that number identifies the same release. |
| Variant | Create a simple branch from a saved version. Edit it independently, compare it with the main version, and merge it back when ready. |
| Compare and restore | Show differences in data, SQL, and canvas structure. Restore a snapshot by saving a new version with the restored state. |
| Resolve a conflict | When changes are incompatible, show both versions and let the user choose a value or edit the combined result. |

### Edit the same workspace together

Multiple users with edit access can work in the same workspace and on the same working version at the same time. Changes save automatically and appear for the other users without a manual refresh.

Keep independent edits from both users. For example, two people can enter values in different cells while one of them adds a row. If they change the same cell to different values at the same time, preserve both values for review. Undo applies to the current user's own edits. If another user has since changed the same value, show the conflict before applying the undo.

Verify the shared editing flow with two user accounts. Check that independent edits appear in both sessions, a conflicting edit can be resolved, and one user's undo preserves the other user's work.

#### Show where others are working

Show who is in the workspace and where they are working. On the canvas, show each person's pointer and outline the block they have in focus. In a table, outline their active cell or selected range so the indicator works for keyboard and touch users too. Identify each person by name as well as color. The markers should be readable in light and dark modes.

Presence indicators are temporary and stay outside the version history. Clear them when someone leaves the workspace or loses their connection. Verify with two user accounts that each person can see the other's current focus and that markers disappear after departure.

## Proposed design for shared workspaces

Use PostgreSQL for the current drafts and saved versions. Keep a stable ID for each block, connection, row, and column. Store edits as small, identifiable changes, with a pasted range or other single user action grouped together. Use those changes for undo and redo. Save versions as immutable workspace snapshots that reference the input data versions needed to reproduce the analysis. A merge version records both versions it combined.

Save edits while the user works. For recovery from a tab close or a short network interruption, retain pending changes on the device until the server acknowledges them. Retry with the same change IDs so a retry applies the edit only once. The UI can show **Saved**, **Saving**, or **Saved on this device** so users know where their edits are safe.

Take the end-of-session snapshot from the last saved draft. When a close signal does not arrive, finish the session after a period without edits, using the last saved edit time in history. Use the close signal as a hint because mobile browsers can close without sending one. [Browser page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)

Use a shared starting version to compare and merge a variant and the main branch. For example, a corrected amount in one version and a new row in the other can both be kept. If both versions change the same amount to different values, show the original and both edits. For SQL, offer a side-by-side diff and an editable result. Check the merged SQL and its input connections before saving the merge. [Git merge as a reference](https://git-scm.com/docs/git-merge)

Keep dated snapshots and release tags in the same history. For a reusable component, the version number describes changes to its contract, such as which inputs it expects and which outputs it provides. Sharing or publishing stays a separate action. [Semantic Versioning](https://semver.org/)

## Proposed path to synchronization

1. **Device handoff.** Start with a shared server draft. Open the latest saved state on another device. Apply a submitted edit against the version it was based on so a stale device cannot silently overwrite newer work.
2. **Live editing.** Start with the server applying and broadcasting edits to users in the same workspace. Reuse the comparison and conflict tools from variants when edits conflict.
3. **Offline editing.** If extended offline editing becomes a priority, test a synchronization library such as Automerge on a real DataFlow workspace. Its sync model and Swift bindings are relevant to a future Apple client. DataFlow still defines how to handle conflicting financial values, invalid graph connections, and SQL that combines poorly. [Automerge concepts](https://automerge.org/docs/reference/concepts/) and [Swift bindings](https://github.com/automerge/automerge-swift)

## Local files and Git

Local workspaces can use a versioned, readable `.dataflow.json` file. It keeps stable IDs for blocks, connections, rows, and columns. Save it in a Git working tree for manual diffs and commits, or in iCloud Drive for device handoff. DataFlow pauses file autosave when it detects a change on disk and retains the browser draft.

Use a single editor for a file, then give the file provider time to finish syncing before opening it on a second device. For future simultaneous editing, users can move a workspace into the DataFlow cloud through a document import. Direct Git integration remains an open decision.

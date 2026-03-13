# Contract: Sidecar JSON Schema

**Feature**: `001-md-comments` | **Date**: 2026-02-26

Sidecar files persist all active comments for a single `.md` file. They are stored
alongside the `.md` file, committed to version control, and are the single source
of truth for active comments.

---

## File Naming

```
.{original-filename}.comments.json
```

Examples:
- `README.md` → `.README.md.comments.json`
- `docs/guide.md` → `docs/.guide.md.comments.json`

The dot prefix makes the file hidden on Unix systems but still visible in VS Code's
file explorer (VS Code shows hidden files by default). The full original filename
including extension is preserved before `.comments.json` to avoid naming collisions
(e.g., `foo` and `foo.md` in the same directory would generate
`.foo.comments.json` and `.foo.md.comments.json` respectively).

---

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "title": "Sidecar",
  "type": "object",
  "required": ["version", "comments"],
  "additionalProperties": false,
  "properties": {
    "version": {
      "type": "integer",
      "const": 1,
      "description": "Schema version. Currently 1."
    },
    "comments": {
      "type": "array",
      "items": { "$ref": "#/definitions/Comment" }
    }
  },
  "definitions": {
    "Comment": {
      "type": "object",
      "required": ["id", "anchor", "body", "createdAt"],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "UUID v4. Stable identifier."
        },
        "anchor": { "$ref": "#/definitions/CommentAnchor" },
        "body": {
          "type": "string",
          "minLength": 1,
          "description": "Plain-text comment body."
        },
        "createdAt": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 creation timestamp."
        }
      }
    },
    "CommentAnchor": {
      "type": "object",
      "required": ["text", "sourceOffset", "contextBefore", "contextAfter"],
      "additionalProperties": false,
      "properties": {
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500,
          "description": "Verbatim selected text."
        },
        "sourceOffset": {
          "type": "integer",
          "minimum": 0,
          "description": "UTF-16 character offset in .md source at comment creation time."
        },
        "contextBefore": {
          "type": "string",
          "maxLength": 40,
          "description": "Up to 40 source chars immediately before anchor.text."
        },
        "contextAfter": {
          "type": "string",
          "maxLength": 40,
          "description": "Up to 40 source chars immediately after anchor.text."
        }
      }
    }
  }
}
```

---

## Example Sidecar File

```json
{
  "version": 1,
  "comments": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "anchor": {
        "text": "the quick brown fox",
        "sourceOffset": 142,
        "contextBefore": "This is a paragraph about ",
        "contextAfter": " jumping over the lazy dog."
      },
      "body": "This phrase is a bit cliché — consider replacing with something specific to the project.",
      "createdAt": "2026-02-26T14:30:00.000Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "anchor": {
        "text": "Installation",
        "sourceOffset": 0,
        "contextBefore": "",
        "contextAfter": "\n\nTo install the extension, run:"
      },
      "body": "Should this be 'Quick Start' instead of 'Installation' to match the rest of the docs?",
      "createdAt": "2026-02-26T14:35:22.000Z"
    }
  ]
}
```

---

## Empty Sidecar (Post-Review State)

After an accepted review round, the sidecar is cleared to:

```json
{
  "version": 1,
  "comments": []
}
```

The file is NOT deleted. It persists as an empty store ready for the next
annotation cycle.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| File absent | Return `{ version: 1, comments: [] }` (no write) |
| File present, empty string | Return empty sidecar; log warning |
| File present, invalid JSON | Return empty sidecar; log warning; do NOT overwrite |
| File present, valid JSON, invalid structure | Drop invalid comment entries; log warning per dropped entry; load remaining valid entries |
| File present, `version > 1` | Return empty sidecar; log warning (forward-compatibility unknown) |
| Write failure (permissions, disk full) | Surface error to user via `showError` webview message; do not silently fail |

---

## Git Considerations

Sidecar files are intended to be committed to version control (per constitution
Principle II and spec Assumptions). Consumers of this repository who do not use
the extension will see `.{filename}.comments.json` files in directories alongside
`.md` files. To prevent accidental clutter in git status for teams that don't use
the extension, the extension's installation guide (`quickstart.md`) recommends
adding a `.gitattributes` entry to mark sidecar files as binary (suppresses diff
noise) or ignoring them if the team opts out of comment sharing:

```gitattributes
# Mark comment sidecars as binary to suppress diff noise (optional)
.*.comments.json binary
```

The extension does NOT add anything to `.gitignore` automatically — that decision
is left to the user/team.

<!-- Copied from byplay-previs-app/docs/production-profile.md by `npm run sync`. Do not edit here. -->
<!-- Paths below are the app's: src/production/schema.ts and naming.ts are src/schema.ts and src/naming.ts in this repo. -->

# Production profiles

A production profile is a small JSON file that tells every device on a production how to name and file captures, which slate fields to show, and which cameras and lenses the production uses. One person writes it (usually in the web profile editor), and the crew loads it onto their devices by AirDrop, by file, or by scanning a QR code. Nothing goes through a server.

- Schema (source of truth): `src/production/schema.ts` (zod, no app dependencies; the web editor copies it verbatim).
- Example: `docs/fixtures/example.bpprod`, with its QR payloads in `docs/fixtures/example.qr-single.txt` and `docs/fixtures/example.qr-parts.txt`.

## File

- Extension `.bpprod`, UTF-8 JSON. Uniform type identifier `io.byplay.production`, conforms to `public.json`.
- `format` is always `"byplay-production"`. `version` is the breaking-change version, currently `1`. New optional fields don't bump it; readers ignore keys they don't know, and drop them, so edit profiles with the current editor rather than an old offline copy.
- `id` is stable for the life of a production (a UUID). `revision` starts at 1 and goes up by one on every export of an edited profile. `updatedAt` is an ISO 8601 timestamp.

Importing a profile whose `id` is already on the device replaces it when `revision` is higher, and is a no-op otherwise. A new `id` is added alongside the others. One profile is active at a time.

What is deliberately not in the profile: the current day, roll, scene, take, camera letter, notes, and custom field values. Those stay on each device, so re-sharing an updated profile never resets anyone's slate.

## Fields

| Field | Meaning |
|---|---|
| `project` | Short production code, 1–24 characters. The `{project}` token. |
| `title` | Full title, optional. The `{title}` token. |
| `naming.snapshot` / `naming.video` | `{ folder, file }` templates, see below. For videos, `file` names the recording folder; the files inside keep their fixed names (`video.mp4`, …). |
| `slate.cameraOptions` | Camera letters to pick from, e.g. `["A","B"]`. Empty means free text. |
| `slate.customFields` | Up to 8 extra slate fields `{ key, label, options? }`. `key` matches `^[a-z][a-z0-9]{0,23}$`, is unique, and isn't a built-in token; it becomes the `{key}` token. With `options` (1–20 entries) the field is a pick list. |
| `slate.director`, `slate.dp` | Crew defaults, applied when the profile is activated. |
| `slate.snapshotsAdvanceTake` | Each snapshot advances the take, like a video recording does. Default `true`. |
| `slate.clearNotesAfterCapture` | Notes describe one capture and are cleared after it. Default `true`. |
| `capture.saveToFiles` | Save snapshots under the app's folder in the Files app. Default `true`. |
| `capture.saveToPhotos` | Also save snapshots to Photos. Default `true`. |
| `capture.shotLog` | Append a row per capture to `shotlog.csv` in the capture folder. Default `true`. |
| `optics` | Optional camera kit: `cameras` (name, manufacturer, model, sensors with sizes in mm), `lenses` (family, name, focal lengths in mm, anamorphic squeeze), `mattes` (aspect ratios like `[2.39, 1]`), and `defaults` (camera by name, sensor mode, lens by family+name, focal length, matte) applied when the profile is activated. Cameras and lenses carry their actual values, not database ids, so an older app can use a camera added to the editor's database later. Camera names are unique within a profile, as are lens family + name pairs, because the defaults refer to them that way. Sensor modes are unique within a camera for the same reason (a camera with one sensor may leave its mode out). |

## Templates

A template is literal text with tokens in braces: `{name}` or `{name:format}`. Token names are lowercase letters and digits starting with a letter (`[a-z][a-z0-9]*`); anything else in braces, such as `{Roll}`, is literal text. `src/production/naming.ts` is the reference implementation, and the web editor runs the same file, so its preview matches what devices write.

Built-in tokens:

| Token | Value |
|---|---|
| `project`, `title` | From the profile. |
| `day` | Shoot day number (1, 2, …). |
| `date`, `time` | Capture time. Default formats `YYYYMMDD` and `HHmm`. |
| `roll`, `scene`, `take`, `camera` | Slate values. |
| `director`, `dp` | Slate crew. |
| `body` | Camera body name, e.g. `Sony Venice 2`. |
| `focal` | Focal length in mm, number only (`35`). |
| `seq` | Capture counter within the resolved folder, starting at 1. |
| `device` | The device's name. |
| `mode` | `AR`, `3D` or `Drone`. |
| any custom field key | That field's value. |

Formats:

- `{name:0N}`, with N from 1 to 9, zero-pads a value made only of digits to width N: `{roll:02}` with roll `1` gives `01`; `A001` stays `A001`. Other formats on non-date tokens are ignored.
- `date` and `time` take a pattern in which `YYYY`, `YY`, `MM`, `DD`, `HH`, `mm` and `ss` are replaced and every other character is kept as written (so stick to `-`, `.` and `_` between them). Both tokens accept the same patterns, so `{date:YYYY-MM-DD_HHmmss}` is valid.

Rendering rules, in order:

1. A file template is one level: any `/` in it becomes `_`. A folder template splits into levels on `/`.
2. Token values are cleaned: `/ \ : * ? " < > |` and control characters become `-`, surrounding whitespace is trimmed, and leading dots are removed.
3. Within a level, `_` and space in the literal text separate segments (separators inside a token's value don't). A segment that contains a token whose value is empty is dropped together with its literal text, so `R{roll:02}` disappears entirely when roll is empty instead of leaving `R`. Unknown tokens count as empty. Segments left empty by repeated separators are dropped too.
4. The remaining segments are joined, each with the separator that stood in front of it in the template.
5. The joined level gets the same cleaning as values (so literal text can't contain `:` either), and trailing dots and spaces are removed. Levels that end up empty, `.` or `..` are dropped, so a template can't write outside the app's folder.
6. A file name longer than 150 characters is cut at 150 code points, and separators or dots left at the end of the cut are removed.
7. Snapshots get the extension `.png`; video recordings are folders with no extension. If the result already exists, the app appends `_v2`, `_v3`, … before the extension.

Example, with day 1, roll 1, scene D12, take 1, 2026-10-07 16:43:

```
folder  {project}/Day_{day:02}                                                   → ABC/Day_01
file    {project}_Day-{day:02}_{date:YYYYMMDD}_{time:HHmm}_R{roll:02}_{scene}_Tk{take} → ABC_Day-01_20261007_1643_R01_D12_Tk1
```

## QR codes

For devices that can't receive files (managed iPads with AirDrop and downloads blocked), the profile travels as one or more QR codes, scanned with the app's own scanner.

- Data: `base45(zlib(utf8(JSON)))`. zlib means the RFC 1950 wrapper (what `CompressionStream('deflate')`, `pako.deflate` and Python's `zlib.compress` produce), not raw deflate. base45 is RFC 9285 with the alphabet `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:`.
- One code: `BPP1:` + data.
- The base45 alphabet includes the space character, so a payload can begin or end with a space. Scanners and decoders must never trim scanned text.
- Several codes: split data into n ≤ 16 chunks anywhere, and encode each as `BPP1P:<i>/<n>/<tag>:<chunk>`, with `i` from 1 to n and `tag` 4 characters from `[0-9A-Z]`, the same for every part of one encoding (random per encoding). The scanner collects parts in any order, joins chunks by `i`, and decodes.
- Every character of every payload is in the QR alphanumeric set, so encoders should use alphanumeric mode (about 30% denser than byte mode). Use error correction level M.
- Keep each code at or below about 1,000 characters (QR version 20 or below) so a device camera can read it off a laptop screen or a printed page. A typical profile with a camera kit is about 1,100 characters, so two codes.

The app treats a scanned profile exactly like an imported file: same validation, same confirmation, same revision rules.

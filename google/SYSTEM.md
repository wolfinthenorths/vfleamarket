# Character data flow

The shared module runs inside the existing signed Protectoron Apps Script project alongside the market, inventory and perk bridge. No additional public endpoint is created, and the deployment URLs and HMAC secret remain unchanged.

- Master character worksheet: A2 name, C2 class, C6:D6 XP, B10:B15 attributes, B17:B36 skill ownership. Character and roll worksheets read by A2. A missing source never falls back to donor values.
- Personal character sheets also read the master's six attribute analyses (H2, H3, H5, H7, H9, H11) and twenty skill analyses (P2, P3, P5 through P39). Edit that prose in the master. A hidden inline BQ1:CP39 import carries the source name alongside the text, so copied sheets follow A2 and suppress donor prose while the new source loads. Existing text formatting and merged panels remain intact.
- Personal and master perk summaries occupy E32:L36, aligned with the inventory and ending with the skill table. The master shows class and acquired perks; personal sheets show only acquired passive/active perks. All perk text uses 12 pt, bold, centered type. Images use fit-to-cell mode to preserve their proportions. Roll sheets keep the class card at A4:D8 with the illustration fitted to A5:A8, a wide name and no description. Residents also show their two selected class skills with a +1 label. Original class, passive and active palettes and emphasis are preserved. The acquired list has inventory-independent ledger names only, no duplicate class card, and uses F:M like the passive/active blocks. Empty entries blend into the existing dark background.
- Ghoul layouts have a three-row offset: their real perk selectors are G28/G35, while other roll sheets use G25/G32. BP25/BP32 validate those actual cells against ownership before any perk affects a roll. Reconfiguration and new branch copies preserve the Mysterium and saving-throw controls, remove ghost selectors, and restore white blank areas to the existing #3f3f3f background.
- Resident class choices come from the latest immutable `twice_learned_chemist` class receipt, matched by controller UUID. The master exports the two choices through column G of `_Связь_перков`; inline AF:AL imports feed validated BO2:BO4 helpers in copies. Only two distinct allowed skills for a current resident can apply. The main roll adds +1 once to a matching skill; the legacy B7/B8 adjustment is removed first. Base skill modifiers and saving throws remain unchanged. Missing choices display “Навыки не выбраны”; no choices are inferred from donor sheets.
- Controller perk ledger: immutable receipts determine paid skill point spending. Both the shop and character sheets derive the balance from master XP and those receipts. Registry F/G are a presentation cache.
- Master E63:L92: GM grants. E item, I quantity (default 1), K slots (catalog default), L category (catalog default). Unknown custom items remain visible and require a slot value before packing. A copied worksheet's unchanged donor grants are ignored and cleared on reconciliation.
- Market receipt ledger + GM grants + migrated manual stock − `Списания вещей`: total ownership. `Рюкзаки` holds one canonical packet per character/chapter. Free inventory is ownership minus its packet. Returning an item restores the free count.
- Bookkeeping `Инвентарь` and `_Экспорт_вещей` are derived views. The master export mirrors the same rows for personal and roll worksheets. Do not edit derived inventory cells; enter GM grants or consumption instead.
- `Журнал гулей` in the controller mirrors the existing journal source, preserving the robot's storage and its current import. Header variants from the original and updated robot are accepted.

## Install / resume

1. Save `system.gs` and `templates.gs`, update `inventory.gs` and the Protectoron bridge in the existing Apps Script project. Keep its catalog and script properties.
2. Update the existing active deployments to a **new version**, preserving their URLs and access settings.
3. Run `systemInstall` as owner until it returns `complete: true`. It resumes after three books per call. A temporary flag blocks packet edits and legacy inventory mirrors during migration; paid receipts remain authoritative.
4. The initial stock and packet migration is one atomic Sheets batch, marked in `_Старые_вещи!A1`'s note. Existing backup worksheets remain hidden.
5. Run `systemCheck` for a read-only audit; `systemRefresh` can refresh derived views. The existing market reconciliation worker also refreshes them each minute.

## New characters and copies

Create the master worksheet from the appropriate class, set its worksheet name and A2 to the character's name, and enter that character's source values. Copy the corresponding personal and roll files and change A2; copied roll worksheets retain their own inline bindings when placed into a branch book. Google may require the normal one-time **Allow access** action for an imported range in a brand-new file. Account binding still requires a verified roster username / numeric Telegram ID; a character name never grants another person's account access.

Never rewrite historical controller or market UUIDs to make them match: the systems have separate receipt identities. Source files stay in their existing Drive folders.

## Validation

`node tests/system.cjs` exercises production shared-state code with isolated fixtures: XP and paid/free perks, receipt retries, grants, copied grants, consumption, ownership/free/packed counts, packet retries, stale versions, foreign items, returns, descriptions and selected-perk isolation. When both repos are checked out, set `PROTECTORON_BRIDGE_SOURCE` to the production `protectoron/sheets-bridge.gs` path to also verify the live shop entry uses derived XP, points and class over stale cache values. Existing transaction, backpack and perk bridge suites must continue to pass. No real player balance is spent during verification.

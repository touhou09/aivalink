# Desktop App E2E / Manual Scenarios

## Preconditions
- `pnpm install`
- local agent available at `http://127.0.0.1:4315`
- run desktop app via `pnpm --filter @aiva/desktop dev`

## Scenario 1: Window/Pet/Tray mode switching
1. Start in **Window** mode
   - Expected: window is visible, normal click behavior, not always-on-top.
2. Switch to **Pet** mode
   - Expected: window stays visible, always-on-top enabled, click-through enabled.
3. Switch to **Tray** mode
   - Expected: window is hidden and tray icon remains alive.
4. Switch back to **Window** mode
   - Expected: window reappears with standard interaction.

## Scenario 2: Local Agent status
1. Start local agent.
2. Start desktop app.
3. Verify app logs no healthcheck warning.
4. Stop local agent and restart desktop app.
   - Expected: app logs local agent health warning and remains running.

## Scenario 3: Crash and restart behavior
1. Force renderer crash (e.g. process kill or debug crash trigger).
2. Verify app relaunches automatically.
3. Repeat crash three times.
   - Expected: first two crashes auto-recover.
   - Expected: third crash returns manual intervention path.

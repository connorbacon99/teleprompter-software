# Integration Issues & Fixes

## Problem Statement
Phase 1 features were added but not properly integrated with existing functionality. Users experience:
- Buttons that don't do anything
- UI elements covering each other
- Disconnected workflows
- Confusing state management

---

## Issues Identified

### 1. ❌ Marker Toolbar Hidden & Covered by Menus
**Problem:**
- Marker toolbar has `display: none` by default
- Z-index issues - toolbar covered by other UI elements
- No clear indication when it's available

**Fix:**
- Show toolbar when recording starts
- Increase z-index to be above all panels
- Add visual connection to recording state

---

### 2. ❌ Recording System Disconnected from Playback
**Problem:**
- Recording toggle button exists but doesn't integrate with play/pause
- Playing teleprompter doesn't automatically start recording
- Unclear what "recording" means in context of teleprompter

**Fix:**
- When user clicks Play → automatically start recording session
- Recording tracks time while teleprompter is running
- Stop recording button also stops playback
- Clear visual indication of recording state

---

### 3. ❌ Multi-Script System Isolated from File Operations
**Problem:**
- Opening files doesn't integrate with multi-script tabs
- Saving doesn't work with multiple scripts
- Cue markers tied to single script, not multi-script system

**Fix:**
- Opening file creates new script tab OR replaces current tab
- Save operation saves current active script
- "Save Session" saves all scripts
- Cue markers associated with correct script

---

### 4. ❌ Export Guide Button Without Context
**Problem:**
- Export button appears always, even with no markers
- No indication of what will be exported
- Confusing when no recording has been done

**Fix:**
- Disable export button when no markers exist
- Show marker count in button or nearby
- Only enable after recording has started

---

### 5. ❌ Auto-Save Not Saving Complete State
**Problem:**
- Auto-save may not include all necessary state
- Unclear what's being auto-saved
- No way to restore from auto-save

**Fix:**
- Auto-save includes: scripts, markers, settings, cue markers, current position
- Add "Restore Session" option in File menu
- Show what was last saved

---

### 6. ❌ Script Tabs Don't Sync with Script Content
**Problem:**
- Changing scriptText doesn't update current script object
- Switching tabs may lose unsaved changes
- Script names don't update intuitively

**Fix:**
- Auto-save script content on text change (debounced)
- Always save current script before switching tabs
- Double-click tab name to rename

---

### 7. ❌ Position Tracking Across Scripts
**Problem:**
- Monitor position is global, not per-script
- Switching scripts doesn't reset position appropriately
- Confusing when resuming different script

**Fix:**
- Each script stores its last position
- Switching script restores that script's position
- Clear indication of position per script

---

### 8. ❌ Recording Timer vs Playback State
**Problem:**
- Timer runs but teleprompter may not be playing
- Can record without teleprompter running (confusing)
- No clear connection between recording and playback

**Fix:**
- Recording = session is active (can pause/resume playback)
- Timer continues even when paused (total session time)
- Script timer only counts when teleprompter is playing

---

## Comprehensive Integration Plan

### Phase 1: Fix Visibility & Z-Index Issues
- [x] Marker toolbar z-index and positioning
- [ ] Recording status panel positioning
- [ ] Ensure no overlapping UI elements

### Phase 2: Unify Recording & Playback
- [ ] Play button starts both playback AND recording
- [ ] Recording state persists across pause/resume
- [ ] Stop button ends both playback and recording session
- [ ] Clear visual feedback

### Phase 3: Integrate Multi-Script with File Ops
- [ ] Open file → add to current script or new tab (user choice)
- [ ] Save → saves active script to file
- [ ] Save Session → saves all scripts + markers
- [ ] Load Session → restores complete state

### Phase 4: Smart Auto-Save
- [ ] Debounced text changes auto-save to script object
- [ ] Periodic full session auto-save
- [ ] Restore last session on startup (optional)

### Phase 5: Polish & User Flow
- [ ] Disable irrelevant buttons based on state
- [ ] Show counts (markers, scripts, recording time)
- [ ] Add keyboard shortcuts for markers
- [ ] Tool tips everywhere

---

## Proposed User Flow

### Simple Recording Session
1. User opens app
2. Opens PowerPoint notes → becomes first script
3. Clicks Play → teleprompter starts + recording session starts
4. User reads script, clicks marker buttons as needed
5. Clicks Next Script tab, loads new content
6. Continues recording (session timer continues)
7. Clicks Stop → ends session
8. Clicks Export → gets editing guide with all markers

### Expected Behavior at Each Step
- **Step 2**: Tab shows "Script 1 (1-10)" with slide range
- **Step 3**: Recording panel appears, timer starts, marker toolbar visible
- **Step 4**: Markers saved with timestamps, visual feedback on click
- **Step 5**: Script timer resets, session timer continues, position resets
- **Step 6**: All markers tracked per script
- **Step 7**: Final timing recorded, export button enabled
- **Step 8**: TXT or CSV with complete timeline

---

## Implementation Priority

### Critical (Must Fix Now)
1. Marker toolbar visibility and z-index
2. Recording starts automatically with playback
3. Multi-script tabs save content on switch
4. Export button only enabled when markers exist

### Important (Fix Soon)
5. Auto-save includes complete state
6. Position tracking per script
7. File operations integrate with tabs
8. Clear button states (enabled/disabled)

### Nice to Have (Polish)
9. Keyboard shortcuts for markers
10. Marker count badges
11. Session restore on startup
12. Undo for markers

---

## Testing Checklist

After fixes, test this complete workflow:
1. [ ] Open app, load script
2. [ ] Click play → recording starts, timer shows, markers appear
3. [ ] Add retake marker → feedback shown, marker saved
4. [ ] Switch to new script tab → content saved, position resets
5. [ ] Add content to new script
6. [ ] Add markers in second script
7. [ ] Click stop → recording ends
8. [ ] Export guide → both scripts included with markers
9. [ ] Reload app → auto-save recovered (if implemented)
10. [ ] Open file → integrates with script tabs correctly

---

## Next Steps

Starting with critical fixes in order of user impact:
1. Fix marker toolbar visibility NOW
2. Unify recording/playback NOW
3. Fix script content saving NOW
4. Polish and test

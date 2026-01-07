# Recording Countdown & Play/Record Decoupling

**Date:** 2025-01-07
**Status:** Approved

## Overview

Add a countdown delay before recording starts, allowing the operator to click "Start Recording", walk to the camera (~10 feet), and hit record while watching the countdown on the operator panel. Also decouple the Play and Recording functions so they operate independently.

## Features

### 1. Recording Countdown

**Trigger:** User clicks "Start Recording" button

**Behavior:**
1. Large full-screen overlay appears on operator panel
2. Shows countdown (e.g., "5... 4... 3... 2... 1... REC")
3. Font size ~200-250px (visible from 10 feet away)
4. **Red** color during countdown numbers
5. **Green** color on "REC"
6. Text below: "Recording starts in..." → "RECORDING" when complete
7. Subtle pulse animation on the number
8. When countdown finishes, overlay disappears and timer tracking begins

**Settings:**
- "Recording Countdown" toggle (default: enabled)
- Seconds input (default: 5 seconds)
- Located in Playback settings section

### 2. Play/Record Decoupling

**Current behavior (being changed):**
- Play button auto-starts recording ❌ (remove)
- Play/Stop adds markers to recording ✅ (keep)

**New behavior:**
- Play button only controls teleprompter scrolling
- Play button does not auto-start recording
- If recording IS active: Play/Stop still adds "▶️ Playback Started" / "⏸️ Playback Stopped" markers
- If recording is NOT active: Play/Stop just controls scrolling (no markers)

### 3. Warning Modal

**Trigger:** User clicks "Play Teleprompter" when no recording is active

**Modal:**
- **Title:** "No Active Recording"
- **Message:** "You're about to start the teleprompter without recording. Timestamps won't be tracked."
- **Buttons:**
  - "Start Recording First" → Closes modal, triggers recording countdown (user clicks Play separately after)
  - "Continue Anyway" → Starts playback without recording
  - "Cancel" → Closes modal, does nothing

### 4. Settings Label Updates

Rename existing settings for clarity:
- "Countdown" → "Teleprompter Countdown"
- Add new "Recording Countdown" row below it

## Implementation Notes

### Files to Modify

1. **src/js/operator.js**
   - Add recording countdown overlay logic
   - Add `recordingCountdownEnabled` and `recordingCountdownSeconds` state
   - Modify `startRecording()` to use countdown when enabled
   - Remove `startRecording()` calls from play button handler
   - Add warning modal logic when playing without recording
   - Update marker logic to check `isRecording` before adding

2. **src/operator.html**
   - Add recording countdown overlay HTML
   - Add warning modal HTML
   - Add recording countdown settings inputs
   - Rename existing countdown label

3. **src/css/operator-modern.css**
   - Add recording countdown overlay styles (red countdown, green REC)
   - Add warning modal styles (if not using existing modal pattern)

4. **src/main.js**
   - Add `recordingCountdownEnabled` and `recordingCountdownSeconds` to default state
   - Update project save/load to include new settings

## Visual Design

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                  5                      │  ← Red, ~200px, pulse animation
│                                         │
│         Recording starts in...          │  ← Gray subtext
│                                         │
│                                         │
└─────────────────────────────────────────┘

        ↓ After countdown completes ↓

┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                REC                      │  ← Green, ~200px
│                                         │
│              RECORDING                  │  ← Green subtext
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

## Testing Checklist

- [ ] Recording countdown shows when "Start Recording" clicked
- [ ] Countdown is visible from 10 feet away
- [ ] Red during countdown, green on REC
- [ ] Timer starts after countdown completes
- [ ] Recording countdown toggle enables/disables feature
- [ ] Recording countdown seconds is adjustable
- [ ] Play button does NOT auto-start recording
- [ ] Warning modal appears when playing without recording
- [ ] "Start Recording First" triggers countdown
- [ ] "Continue Anyway" starts playback without recording
- [ ] Playback markers still added when recording IS active
- [ ] No markers added when recording is NOT active
- [ ] Settings persist when saving/loading projects

# Phase 2 Implementation Plan - Presentation Mode

**Target Use Case:** Faculty video recording with slide integration
**Goal:** Seamless workflow for recording multi-hour videos with slide references for video editing

---

## Overview

Phase 2 focuses on **Presentation Mode** - integrating slide information directly into your recording and editing workflow. Since you extract scripts from PowerPoint notes and record videos referencing those slides, Phase 2 will make slide tracking automatic and export comprehensive editing guides.

---

## Features to Implement

### 1. 🎯 Slide Range Management (UI Enhancement)

**What:** Make slide ranges visible and editable for each script

**Why:** You mentioned extracting scripts from slides - need to know which slides each script covers

**Implementation:**
- Add slide range input field to each script tab (tooltip on hover)
- Show slide range in tab header when available
- Persist slide ranges in session saves
- Include in exports

**UI Changes:**
```
[Script Tab]
  Script Name: "Introduction"
  Slides: [1-10] ← editable input
```

**Effort:** Low (1-2 hours)

---

### 2. 📊 Slide Transition Markers

**What:** Special marker type to flag slide changes during recording

**Why:** Helps video editor know exactly when you switched slides

**Implementation:**
- Add 5th marker button: 🎞️ "Slide Change"
- Prompt for slide number when clicked
- Store slide number with marker
- Highlight slide transitions in export

**UI Changes:**
```
[Marker Toolbar]
🔴 Retake | ⚠️ Issue | ✓ Good | 📝 Note | 🎞️ Slide Change (NEW)
```

**Export Example:**
```
00:02:45 - 🎞️ SLIDE CHANGE → Slide 5
```

**Effort:** Medium (2-3 hours)

---

### 3. 📋 Enhanced Export with Slide Timeline

**What:** More detailed editing guides with slide-by-slide breakdown

**Why:** Video editor needs to know what content appears on which slide for easier editing

**Implementation:**
- Add "Detailed" export mode alongside TXT/CSV
- Timeline view showing:
  - Script segments by slide
  - Duration per slide
  - Markers within each slide section
- Color-coded sections in text export

**Export Example:**
```
===============================================
SLIDE-BY-SLIDE EDITING TIMELINE
===============================================

SLIDE 1-3: Introduction (00:00:00 - 00:03:15)
Script: "Introduction Script"
Duration: 3 min 15 sec
Markers:
  - 00:01:23 - ⚠️  Minor audio issue
  - 00:02:45 - ✓  Good take

SLIDE 4-7: Main Content (00:03:15 - 00:08:30)
Script: "Body Script"
Duration: 5 min 15 sec
Markers:
  - 00:04:00 - 🔴 RETAKE needed
  - 00:06:12 - 📝 "Emphasize this point"
```

**Effort:** Medium (3-4 hours)

---

### 4. 🖼️ Slide Preview Panel (Optional - Advanced)

**What:** Display slide thumbnails alongside teleprompter

**Why:** Visual reference while recording

**Implementation:**
- Import PowerPoint slides as images
- Show current slide thumbnail in operator window
- Manual slide advance with arrow keys
- Auto-detect slide changes based on script position (if slide ranges set)

**Technical Notes:**
- Use jszip (already installed) to extract slide images from .pptx
- Store thumbnails in session folder
- Display in resizable panel

**UI Mockup:**
```
┌─────────────┬──────────────────┐
│   Slide     │   Teleprompter   │
│  Preview    │    Monitor       │
│             │                  │
│ [Slide 3/10]│  Script text...  │
│             │                  │
│  ◀  Slide 3  ▶                 │
└─────────────┴──────────────────┘
```

**Effort:** High (6-8 hours) - **OPTIONAL**

---

### 5. ⏱️ Per-Slide Timing Statistics

**What:** Track how long you spent on each slide range

**Why:** Helps estimate editing time and identify problem sections

**Implementation:**
- When slide transition marker added, calculate time since last slide
- Show slide timing in export summary
- Color-code slow vs fast slides

**Export Example:**
```
SLIDE TIMING ANALYSIS:
- Slide 1-3:  3:15 (avg 1:05/slide) ✓ Normal
- Slide 4-7:  5:15 (avg 1:19/slide) ✓ Normal
- Slide 8-10: 8:45 (avg 2:55/slide) ⚠️  Slow - check for retakes
- Slide 11:   0:45                   ✓ Quick
```

**Effort:** Medium (2-3 hours)

---

### 6. 🎬 Quick Script Templates

**What:** Save script templates with common slide patterns

**Why:** Speed up setup for repetitive recording sessions

**Implementation:**
- Save/load script templates with:
  - Pre-named scripts
  - Pre-set slide ranges
  - Standard notes
- Template library in settings

**Example Template:**
```
Template: "3-Part Lecture"
Scripts:
  - Introduction (Slides 1-3)
  - Main Content (Slides 4-15)
  - Conclusion (Slides 16-18)
```

**Effort:** Low (1-2 hours)

---

## Implementation Priority

### Phase 2A - Core Presentation Features (Implement First)
1. ✅ Slide Range Management (UI)
2. ✅ Slide Transition Markers
3. ✅ Enhanced Export with Slide Timeline
4. ✅ Per-Slide Timing Statistics

**Total Effort:** ~8-12 hours
**User Value:** HIGH - Direct impact on editing workflow

### Phase 2B - Advanced Features (Optional)
5. ⭕ Slide Preview Panel
6. ⭕ Quick Script Templates

**Total Effort:** ~7-10 hours
**User Value:** MEDIUM - Nice to have, not critical

---

## Technical Architecture

### Data Structure Updates

**Script Object (Enhanced):**
```javascript
{
  id: 'script-1',
  name: 'Introduction',
  content: '...',
  slideRange: '1-10',        // Already added in Phase 1
  slideStart: 1,             // NEW: Start slide number
  slideEnd: 10,              // NEW: End slide number
  markers: [...],
  slideTransitions: [        // NEW: Track slide changes
    {
      timestamp: 1234567890,
      sessionTime: 45000,
      scriptTime: 12000,
      slideNumber: 5,
      position: 23.5
    }
  ]
}
```

**Marker Object (Enhanced):**
```javascript
{
  id: '...',
  type: 'slide-change',      // NEW: 5th marker type
  timestamp: 1234567890,
  sessionTime: 45000,
  scriptTime: 12000,
  slideNumber: 5,            // NEW: Associated slide
  position: 23.5,
  note: ''
}
```

### UI Component Structure

```
Operator Window:
├── Script Tabs (with slide indicators)
├── Slide Range Editor (per script)
├── Recording Controls
├── Marker Toolbar (+ Slide Change button)
├── Teleprompter Monitor
└── Export Options (TXT/CSV/Detailed)
```

---

## Phase 2A Implementation Steps

### Step 1: Slide Range UI (30-60 min)
- [ ] Add slide range input to script tab tooltip
- [ ] Parse slide range string (e.g., "1-10", "5", "12-15, 20")
- [ ] Show slide indicator in active tab
- [ ] Save/load slide ranges

### Step 2: Slide Transition Marker (1-2 hours)
- [ ] Add "Slide Change" button to marker toolbar
- [ ] Create custom modal for slide number input
- [ ] Store slide transitions in marker array
- [ ] Update export functions to highlight slide changes

### Step 3: Enhanced Export (2-3 hours)
- [ ] Create slide-by-slide timeline generator
- [ ] Calculate duration between slide transitions
- [ ] Generate formatted timeline in TXT export
- [ ] Add slide column to CSV export

### Step 4: Slide Timing Statistics (1-2 hours)
- [ ] Calculate per-slide durations
- [ ] Identify slow/problem sections
- [ ] Add timing analysis to export summary
- [ ] Color-code timing indicators

### Step 5: Testing & Polish (1-2 hours)
- [ ] Test complete recording workflow
- [ ] Verify exports include all slide data
- [ ] Check timing calculations
- [ ] Update PHASE2_IMPLEMENTATION.md

---

## Testing Scenarios

### Scenario 1: Multi-Slide Recording
1. Create 3 scripts with slide ranges (1-5, 6-10, 11-15)
2. Start recording
3. Add slide transition markers at appropriate times
4. Export editing guide
5. Verify slide timeline shows correct segments

### Scenario 2: Complex Slide Pattern
1. Script with non-contiguous slides (1-3, 5, 8-10)
2. Add markers and slide transitions
3. Export and check formatting
4. Verify timing calculations

### Scenario 3: Long Recording Session
1. Record for 30+ minutes across multiple scripts
2. Add 20+ slide transitions
3. Export detailed timeline
4. Verify memory usage and performance

---

## Success Criteria

Phase 2A is complete when:
- ✅ Slide ranges can be set for each script
- ✅ Slide transitions can be marked during recording
- ✅ Exports include slide-by-slide timeline
- ✅ Timing statistics show per-slide durations
- ✅ All slide data persists in auto-saves
- ✅ Workflow is seamless for multi-hour recordings
- ✅ Video editors can easily identify sections by slide

---

## Future Enhancements (Phase 3+)

- Import slides directly from PowerPoint with thumbnails
- Auto-detect slide changes via script position
- Real-time slide preview during recording
- Multi-camera sync markers for professional production
- Cloud sync for remote team collaboration
- Integration with video editing software (Final Cut, Premiere)

---

## Notes

- Focus on **workflow efficiency** - save time in both recording and editing
- Keep UI **clean and unobtrusive** - don't distract from teleprompter
- Make exports **editor-friendly** - video editors should love these guides
- Maintain **free/no-subscription** philosophy - all features work locally

---

**Ready to implement Phase 2A?** Estimated completion: 8-12 hours total

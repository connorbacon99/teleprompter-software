# Improved Marker UX Design

**Date:** 2026-01-15
**Status:** Approved for implementation

## Problem

The current marker system works but has UX friction:
- **Retake modal** blocks the script view, but users need to see the script to identify where to restart
- **Stumble markers** capture no context about what was being read when the stumble occurred
- Users uncertain when to use Stumble vs Retake vs Note

## Design

### Marker Type Definitions

| Marker | Purpose | When to Use |
|--------|---------|-------------|
| **Retake** 🔴 | Full stop, talent re-reads a section | Editor will cut between marker and resume point |
| **Stumble** ⚠️ | Minor issue, talent pushed through | Editor should review but take might be usable |
| **Note** 📝 | General annotation | Anything else: "great take", "check audio", etc. |

### Retake Flow (Revised)

**Current:** Blocking modal with blur → user can't see script to reference restart point

**New flow:**

1. User clicks "Retake" button
2. **Enters retake mode:**
   - Top banner appears: `🔴 RETAKE MODE - Scroll to find restart point, then click [Cancel]`
   - Banner is red/prominent, impossible to miss
   - Script/monitor area remains fully visible and scrollable
3. User scrolls monitor preview to find restart point (can scroll back many lines)
4. User clicks on the word/line where talent should restart
5. **Marker created** with:
   - Timestamp (session time, script time)
   - Selected text reference (the clicked word/phrase)
   - Position percentage
6. Banner dismisses, returns to normal recording state

**Cancel behavior:** Clicking Cancel (or pressing Escape) exits retake mode without creating a marker.

### Stumble Flow (Revised)

**Current:** Instant marker with no context

**New flow:**

1. User clicks "Stumble" button
2. **Auto-capture context:**
   - Get current scroll position percentage
   - Apply reaction offset (~1-2 seconds of scroll distance based on speed)
   - Map adjusted position to approximate location in script text
   - Extract surrounding sentence/phrase
3. **Marker created immediately** with:
   - Timestamp (session time, script time)
   - Auto-captured text context (approximate sentence where stumble occurred)
   - Position percentage
4. Visual feedback (existing flash animation)

**No modal, no clicks required** - stumble is a quick "mark this spot" action.

### Note Flow (Unchanged)

Keep current modal behavior - notes require typed input by nature.

## Technical Approach

### Retake Mode State

```javascript
let isRetakeMode = false;

function enterRetakeMode() {
  isRetakeMode = true;
  showRetakeBanner();
  enableScriptClickListener();
}

function exitRetakeMode(selectedText = null) {
  isRetakeMode = false;
  hideRetakeBanner();
  disableScriptClickListener();
  if (selectedText) {
    createMarker('retake', selectedText, null);
  }
}
```

### Script Click Detection

When in retake mode, clicking on the monitor preview script text should:
1. Identify the clicked word/element (using existing `data-word-index` or `data-char-index` attributes)
2. Extract that word plus surrounding context (e.g., 5 words before/after)
3. Pass to `exitRetakeMode(selectedText)`

### Stumble Context Extraction

```javascript
function getStumbleContext() {
  const scriptContent = scriptText.value;
  const totalLength = scriptContent.length;

  // Current position as character index
  const currentCharIndex = Math.floor((monitorPosition / 100) * totalLength);

  // Apply reaction offset (scroll back ~1-2 seconds worth)
  const scrollSpeed = parseInt(speedSlider.value);
  const charsPerSecond = estimateCharsPerSecond(scrollSpeed);
  const reactionOffset = charsPerSecond * 1.5; // 1.5 second reaction time
  const adjustedIndex = Math.max(0, currentCharIndex - reactionOffset);

  // Extract surrounding sentence
  return extractSentenceAt(scriptContent, adjustedIndex);
}
```

## UI Components

### Retake Banner

```html
<div class="retake-mode-banner" id="retakeBanner">
  <span class="retake-mode-icon">🔴</span>
  <span class="retake-mode-text">RETAKE MODE - Scroll to find restart point, then click</span>
  <button class="retake-mode-cancel" id="retakeCancelBtn">Cancel</button>
</div>
```

**Styling:**
- Fixed position at top of recording pane (or full width)
- Red/orange background for high visibility
- Z-index above other content but doesn't block script

## Success Criteria

1. Operator can mark a retake point anywhere in the script (including scrolling back)
2. Operator never loses sight of the script during retake marking
3. Stumble markers include useful context without any extra interaction
4. Timeline export includes the text references for editor use

## Out of Scope

- Voice-activated markers
- Automatic stumble detection
- Integration with specific video editors

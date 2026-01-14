# Flutter Screen Generation from Captured Breakpoints

## Overview

This guide explains how to interpret the JSON files exported by the screen capture tool and use them to generate responsive Flutter UI code.

## JSON File Format

### Location

Exported files are stored in: `./captures/ready/{page-name}.json`

### File Status Markers

- `{page-name}.json` - Breakpoints selected, ready for generation
- `{page-name}.json.done` - Flutter screen already generated

### JSON Structure

```json
{
  "url": "https://my.bswhealth.com/dashboard",
  "title": "Dashboard - MyBSWHealth",
  "widthBreakpoints": [375, 768, 1024, 1366, 1920],
  "heightBreakpoints": [667, 768, 900, 1080],
  "maxWidth": 1920,
  "maxHeight": 1080,
  "timestamp": "2024-12-11T12:34:56.789Z",
  "captures": [...],
  "selectedCaptures": [
    {
      "type": "width",
      "width": 375,
      "height": 1080,
      "filename": "width-375px.png"
    },
    {
      "type": "width",
      "width": 768,
      "height": 1080,
      "filename": "width-768px.png"
    },
    {
      "type": "height",
      "width": 1920,
      "height": 667,
      "filename": "height-667px.png"
    }
  ],
  "folderName": "dashboard-mybswhealth"
}
```

### Field Descriptions

**Top-Level Fields:**
- `url`: Original page URL that was captured
- `title`: Page title (used for naming)
- `widthBreakpoints`: Array of all width breakpoints detected
- `heightBreakpoints`: Array of all height breakpoints detected
- `maxWidth`: Maximum viewport width used during capture
- `maxHeight`: Maximum viewport height used during capture
- `timestamp`: When the capture was performed
- `captures`: Array of ALL captured breakpoints
- `selectedCaptures`: Array of USER-SELECTED breakpoints (use this!)
- `folderName`: Directory name containing PNG files

**Capture Object Fields:**
- `type`: Either "width" or "height"
- `width`: Viewport width in pixels
- `height`: Viewport height in pixels
- `filename`: PNG filename in `./captures/{folderName}/`

## Interpretation Guide

### Width vs Height Breakpoints

**Width Breakpoints (`type: "width"`)**
- Test responsive layout changes at different viewport widths
- Captured at **maximum available height**
- Use for: Mobile → Tablet → Desktop transitions
- Flutter implementation: Use `MediaQuery.of(context).size.width`

**Height Breakpoints (`type: "height"`)**
- Test responsive layout changes at different viewport heights
- Captured at **maximum available width**
- Use for: Scrollable content, bottom sheets, app bars
- Flutter implementation: Use `MediaQuery.of(context).size.height`

### Recommended Flutter Patterns

#### Pattern 1: LayoutBuilder with Width Breakpoints

```dart
class DashboardScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // From captures: widths [375, 768, 1024, 1366, 1920]
        
        if (constraints.maxWidth < 600) {
          // Mobile layout (375px reference)
          return _buildMobileLayout();
        } else if (constraints.maxWidth < 900) {
          // Tablet portrait (768px reference)
          return _buildTabletLayout();
        } else if (constraints.maxWidth < 1200) {
          // Tablet landscape / small desktop (1024px reference)
          return _buildDesktopSmallLayout();
        } else {
          // Large desktop (1366px+ reference)
          return _buildDesktopLargeLayout();
        }
      },
    );
  }
}
```

#### Pattern 2: MediaQuery with Breakpoint Constants

```dart
class Breakpoints {
  // From captures/ready/{page-name}.json widthBreakpoints
  static const double mobile = 375;
  static const double tablet = 768;
  static const double desktop = 1024;
  static const double desktopLarge = 1366;
  static const double desktopXL = 1920;
}

class ResponsiveWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    
    if (width >= Breakpoints.desktopLarge) {
      return DesktopXLView();
    } else if (width >= Breakpoints.desktop) {
      return DesktopView();
    } else if (width >= Breakpoints.tablet) {
      return TabletView();
    } else {
      return MobileView();
    }
  }
}
```

#### Pattern 3: Responsive Value Helper

```dart
class ResponsiveValue<T> {
  final T mobile;
  final T tablet;
  final T desktop;
  
  ResponsiveValue({
    required this.mobile,
    required this.tablet,
    required this.desktop,
  });
  
  T getValue(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width >= 1024) return desktop;
    if (width >= 768) return tablet;
    return mobile;
  }
}

// Usage:
final padding = ResponsiveValue<double>(
  mobile: 16.0,    // Reference: width-375px.png
  tablet: 24.0,    // Reference: width-768px.png
  desktop: 32.0,   // Reference: width-1024px.png
).getValue(context);
```

## Code Generation Workflow

### Step 1: Read JSON File

```dart
import 'dart:convert';
import 'dart:io';

Future<Map<String, dynamic>> loadBreakpoints(String pageName) async {
  final file = File('./captures/ready/$pageName.json');
  final contents = await file.readAsString();
  return jsonDecode(contents);
}
```

### Step 2: Extract Breakpoint Values

```dart
void main() async {
  final data = await loadBreakpoints('dashboard-mybswhealth');
  
  // Get SELECTED breakpoints only
  final selected = data['selectedCaptures'] as List;
  
  // Separate width and height breakpoints
  final widths = selected
    .where((c) => c['type'] == 'width')
    .map((c) => c['width'] as int)
    .toList()
    ..sort();
    
  final heights = selected
    .where((c) => c['type'] == 'height')
    .map((c) => c['height'] as int)
    .toList()
    ..sort();
  
  print('Width breakpoints: $widths');
  print('Height breakpoints: $heights');
  
  // Generate Flutter constants
  print('\nclass Breakpoints {');
  for (var width in widths) {
    print('  static const double width$width = $width.0;');
  }
  for (var height in heights) {
    print('  static const double height$height = $height.0;');
  }
  print('}');
}
```

### Step 3: Reference Screenshot Files

```dart
// All screenshots are in: ./captures/{folderName}/
final folderName = data['folderName'];
final screenshots = <String, String>{};

for (var capture in data['selectedCaptures']) {
  final key = '${capture['type']}-${capture['type'] == 'width' ? capture['width'] : capture['height']}';
  final path = './captures/$folderName/${capture['filename']}';
  screenshots[key] = path;
}

// Usage:
print('Mobile view reference: ${screenshots['width-375']}');
print('Tablet view reference: ${screenshots['width-768']}');
```

### Step 4: Mark as Built

After successful Flutter screen generation:

```bash
touch ./captures/ready/{page-name}.json.done
```

This creates the `.done` marker file, updating the web UI to show "✓ Screen built".

## Best Practices

### 1. Select Minimum Necessary Breakpoints

- Don't include every breakpoint - select representative ones
- Typical minimal set: 1 mobile, 1 tablet, 1 desktop width
- Only include height breakpoints if layout significantly changes

### 2. Use Semantic Naming

```dart
// Good
static const double mobile = 375;
static const double tablet = 768;
static const double desktop = 1024;

// Avoid
static const double bp1 = 375;
static const double bp2 = 768;
static const double bp3 = 1024;
```

### 3. Add Ranges, Not Exact Matches

```dart
// Good - uses range
if (width < 600) { /* mobile */ }

// Avoid - exact match rarely works
if (width == 375) { /* brittle */ }
```

### 4. Document Screenshot References

```dart
/// Mobile layout matching width-375px.png capture
Widget _buildMobileLayout() {
  // Implementation
}

/// Tablet layout matching width-768px.png capture
Widget _buildTabletLayout() {
  // Implementation
}
```

### 5. Test Intermediate Sizes

The captures show specific breakpoints, but test sizes between them:
- If you have 375px and 768px captures, test at 500px, 600px
- Ensure smooth transitions, not just matching exact capture sizes

## Common Pitfalls

### ❌ Using ALL Captures Instead of Selected

```dart
// Wrong - uses all captures
final breakpoints = data['captures'];

// Correct - uses user selection
final breakpoints = data['selectedCaptures'];
```

### ❌ Ignoring Capture Type

```dart
// Wrong - mixes width and height
for (var capture in selectedCaptures) {
  if (width == capture['width']) { /* width might be maxWidth for height type! */ }
}

// Correct - filter by type
final widthCaptures = selectedCaptures.where((c) => c['type'] == 'width');
for (var capture in widthCaptures) {
  if (width >= capture['width']) { /* safe */ }
}
```

### ❌ Hard-Coding Values Instead of Reading JSON

```dart
// Wrong - hard-coded
static const double mobile = 375;

// Better - generated from JSON
// Run codegen script to read actual selected breakpoints
```

## Automation Scripts

### Bash Script to Generate Dart Constants

```bash
#!/bin/bash
# generate-breakpoints.sh <page-name>

PAGE_NAME=$1
JSON_FILE="./captures/ready/${PAGE_NAME}.json"

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: $JSON_FILE not found"
  exit 1
fi

echo "// Generated from $JSON_FILE"
echo "class ${PAGE_NAME}Breakpoints {"

# Extract width breakpoints
jq -r '.selectedCaptures[] | select(.type == "width") | "  static const double width\(.width) = \(.width).0;"' "$JSON_FILE"

# Extract height breakpoints
jq -r '.selectedCaptures[] | select(.type == "height") | "  static const double height\(.height) = \(.height).0;"' "$JSON_FILE"

echo "}"

# Mark as built
touch "${JSON_FILE}.done"
echo "// Marked as built: ${JSON_FILE}.done"
```

Usage:
```bash
chmod +x generate-breakpoints.sh
./generate-breakpoints.sh dashboard-mybswhealth > lib/breakpoints/dashboard.dart
```

## Integration with Flutter Project

### Recommended Directory Structure

```
your_flutter_project/
├── lib/
│   ├── screens/
│   │   ├── dashboard_screen.dart        # Main screen widget
│   │   └── dashboard_responsive.dart    # Responsive layout logic
│   ├── breakpoints/
│   │   └── dashboard_breakpoints.dart   # Generated constants
│   └── assets/
│       └── reference_captures/
│           └── dashboard/               # Copy from captures/{page-name}/
│               ├── width-375px.png
│               ├── width-768px.png
│               └── width-1024px.png
└── captures_tool/                       # This tool (symlink or copy)
```

### Example Integration

```dart
// lib/breakpoints/dashboard_breakpoints.dart
// Generated from captures/ready/dashboard-mybswhealth.json
class DashboardBreakpoints {
  static const double width375 = 375.0;
  static const double width768 = 768.0;
  static const double width1024 = 1024.0;
  
  // References (for developer documentation)
  static const String mobile = 'assets/reference_captures/dashboard/width-375px.png';
  static const String tablet = 'assets/reference_captures/dashboard/width-768px.png';
  static const String desktop = 'assets/reference_captures/dashboard/width-1024px.png';
}

// lib/screens/dashboard_responsive.dart
import '../breakpoints/dashboard_breakpoints.dart';

class DashboardScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < DashboardBreakpoints.width768) {
          return _DashboardMobile();
        } else if (constraints.maxWidth < DashboardBreakpoints.width1024) {
          return _DashboardTablet();
        } else {
          return _DashboardDesktop();
        }
      },
    );
  }
}
```

## Summary

1. **Capture**: Use tool to capture breakpoints at various screen sizes
2. **Select**: Review captures in web UI, deselect unnecessary ones
3. **Export**: Tool creates JSON in `captures/ready/`
4. **Read**: Parse `selectedCaptures` array (not all captures!)
5. **Generate**: Create Flutter responsive layout matching screenshots
6. **Mark**: Create `.done` file to track completion

The exported JSON provides both metadata and file references needed to build responsive Flutter UIs that match the captured screens at all selected breakpoints.
